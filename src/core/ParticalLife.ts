import vertex_shader from "./shaders/vertex.wgsl?raw";
import fragment_shader from "./shaders/fragment.wgsl?raw";
import compute_shader from "./shaders/compute.wgsl?raw";

export interface ParticleLifeOptions {
  particleCount?: number;
  species?: number;
  interactionRadius?: number;
}

export class ParticleLife {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private particleBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;

  private options: Required<ParticleLifeOptions>;
  // private particlePositions!: Float32Array;
  private particleData!: Float32Array;
  bindGroup?: GPUBindGroup;
  velocities: Float32Array<ArrayBuffer>;
  speciesColors: Record<number, [number, number, number]>;
  speciesIds: Uint8Array<ArrayBuffer>;
  computePipeline!: GPUComputePipeline;
  computeBindGroup!: GPUBindGroup;

  constructor(canvas: HTMLCanvasElement, options: ParticleLifeOptions = {}) {
    console.log(vertex_shader);
    console.log(fragment_shader);
    this.canvas = canvas;
    this.options = {
      particleCount: options.particleCount ?? 1000,
      species: options.species ?? 3,
      interactionRadius: options.interactionRadius ?? 0.02,
    };
    // Example: 3 species
    this.speciesColors = {
      0: [1, 0, 0],   // red
      1: [0, 1, 0],   // green
      // 2: [0, 0, 1],   // blue
      2: [1, 1, 0],   // yellow
    };
    this.speciesIds = new Uint8Array(this.options.particleCount);


    // You need to store velocities per particle
    // Example: in constructor
    this.velocities = new Float32Array(this.options.particleCount * 2); // dx, dy per particle
    for (let i = 0; i < this.options.particleCount; i++) {
      this.velocities[i * 2 + 0] = (Math.random() - 0.5) * 0.01;
      this.velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.01;
    }


  }

  async init() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU not supported");

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;

    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
    });

    const cornerOffsets: [number, number][] = [
      [-1, -1], // bottom-left
      [1, -1],  // bottom-right
      [1, 1],   // top-right
      [-1, 1],  // top-left
    ];

    // --- create particle data (your code unchanged) ---
    const distribution = [0.4, 0.3, 0.3];
    const counts = distribution.map(r => Math.floor(r * this.options.particleCount));

    let index = 0;
    for (let s = 0; s < counts.length; s++) {
      for (let j = 0; j < counts[s]!; j++) {
        this.speciesIds[index++] = s;
      }
    }

    this.particleData = new Float32Array(this.options.particleCount * 4 * 7);

    for (let i = 0; i < this.options.particleCount; i++) {
      const cx = Math.random() * 2 - 1;
      const cy = Math.random() * 2 - 1;
      const [r, g, b] = this.speciesColors[Number(this.speciesIds[i])] ?? [1, 1, 1];

      for (let j = 0; j < 4; j++) {
        const [lx, ly] = cornerOffsets[j]!;
        const baseIndex = (i * 4 + j) * 7;

        this.particleData[baseIndex + 0] = cx;
        this.particleData[baseIndex + 1] = cy;
        this.particleData[baseIndex + 2] = r;
        this.particleData[baseIndex + 3] = g;
        this.particleData[baseIndex + 4] = b;
        this.particleData[baseIndex + 5] = lx;
        this.particleData[baseIndex + 6] = ly;
      }
    }

    this.particleBuffer = this.device.createBuffer({
      size: this.particleData.byteLength,
      usage:
        GPUBufferUsage.VERTEX |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.STORAGE, // 👈 needed for compute
      mappedAtCreation: true,
    });
    new Float32Array(this.particleBuffer.getMappedRange()).set(this.particleData);
    this.particleBuffer.unmap();

    // --- indices (your code unchanged) ---
    const allIndices = new Uint16Array(this.options.particleCount * 6);
    for (let i = 0; i < this.options.particleCount; i++) {
      const vertexOffset = i * 4;
      const indexOffset = i * 6;
      allIndices[indexOffset + 0] = vertexOffset + 0;
      allIndices[indexOffset + 1] = vertexOffset + 1;
      allIndices[indexOffset + 2] = vertexOffset + 2;
      allIndices[indexOffset + 3] = vertexOffset + 0;
      allIndices[indexOffset + 4] = vertexOffset + 2;
      allIndices[indexOffset + 5] = vertexOffset + 3;
    }

    this.indexBuffer = this.device.createBuffer({
      size: allIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(allIndices);
    this.indexBuffer.unmap();

    // --- shader modules ---
    const vertexModule = this.device.createShaderModule({ code: vertex_shader });
    const fragmentModule = this.device.createShaderModule({ code: fragment_shader });
    const computeModule = this.device.createShaderModule({ code: compute_shader });

    // --- compute pipeline ---
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: computeModule,
        entryPoint: "compute_main",
      },
    });

    // ✅ compute bind group (connects buffer to compute shader)
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.particleBuffer },
        },
      ],
    });

    // --- render pipeline ---
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: 7 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
              { shaderLocation: 1, offset: 2 * 4, format: "float32x3" }, // color
              { shaderLocation: 2, offset: 5 * 4, format: "float32x2" }, // local offset
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: "fragment_main",
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    console.log("WebGPU initialized with particles!");
    console.log("Species counts:", this.speciesCountbyId());
  }

  speciesCountbyId() {
    const counts: Record<number, number> = {};
    for (let i = 0; i < this.speciesIds.length; i++) {
      const id = this.speciesIds[i]!;
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }


  start() {
    if (!this.device) throw new Error("Call init() first");

    // Example: 3 species, value = strength of attraction (+) or repulsion (-)
    const interactionValue = 0.001;
    const interactionMatrix: number[][] = [
      [0.001, interactionValue + 0.001, -interactionValue + 0.001],  // Red with [Red, Green, Blue]
      [-interactionValue + 0.001, 0.001, interactionValue + 0.001],   // Green with [Red, Green, Blue]
      [interactionValue + 0.001, -interactionValue + 0.001, 0.001],  // Blue with [Red, Green, Blue]
    ];

    const frame = () => {
      const encoder = this.device.createCommandEncoder();
      const textureView = this.context.getCurrentTexture().createView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });

      const wrap = (v: number) => {
        if (v < -1) return 1;
        if (v > 1) return -1;
        return v;
      };

      // --- 1️⃣ Compute species interactions ---
      const radius = this.options.interactionRadius; // normalize for -1..1 space
      for (let i = 0; i < this.options.particleCount; i++) {
        let vx = this.velocities[i * 2 + 0]!;
        let vy = this.velocities[i * 2 + 1]!;

        const baseIndexA = i * 4 * 7;
        let cxA = this.particleData[baseIndexA + 0]!;
        let cyA = this.particleData[baseIndexA + 1]!;

        const speciesA = this.speciesIds[i]!;
        const row = interactionMatrix[speciesA];

        for (let j = 0; j < this.options.particleCount; j++) {
          if (i === j) continue;

          const baseIndexB = j * 4 * 7;
          const cxB = this.particleData[baseIndexB + 0]!;
          const cyB = this.particleData[baseIndexB + 1]!;
          const speciesB = this.speciesIds[j]!;
          const strength = row?.[speciesB];
          if (strength === undefined) continue;

          let dxAB = cxB - cxA;
          let dyAB = cyB - cyA;
          const dist = Math.sqrt(dxAB * dxAB + dyAB * dyAB);

          if (dist > 0 && dist < radius) {
            // distance-based scaling from the interaction matrix
            let f = strength * (1 - dist / radius);

            // 🟢 short-range repulsion to prevent collapse
            const minDist = 0.02;        // tweakable "personal space"
            const repulsionStrength = 0.02; // tweakable
            if (dist < minDist) {
              f += -repulsionStrength * (1 - dist / minDist);
            }

            // normalize direction
            dxAB /= dist;
            dyAB /= dist;

            // apply to velocity
            vx += f * dxAB;
            vy += f * dyAB;
          }

        }

        // --- 2️⃣ Update positions ---
        cxA += vx;
        cyA += vy;
        cxA = wrap(cxA);
        cyA = wrap(cyA);

        for (let k = 0; k < 4; k++) {
          const idx = baseIndexA + k * 7;
          this.particleData[idx + 0] = cxA;
          this.particleData[idx + 1] = cyA;
        }

        // Apply friction
        const friction = 0.8; // closer to 1 = slippery, smaller = more damping
        vx *= friction;
        vy *= friction;

        const maxSpeed = 0.001; // limit max speed to avoid instability
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > maxSpeed) {
          vx = (vx / speed) * maxSpeed;
          vy = (vy / speed) * maxSpeed;
        }

        this.velocities[i * 2 + 0] = vx;
        this.velocities[i * 2 + 1] = vy;
      }

      // Push updated positions to GPU
      this.device.queue.writeBuffer(this.particleBuffer, 0, new Float32Array(this.particleData));

      pass.setPipeline(this.pipeline);
      pass.setVertexBuffer(0, this.particleBuffer);
      pass.setIndexBuffer(this.indexBuffer, "uint16");
      pass.drawIndexed(this.options.particleCount * 6, 1, 0, 0, 0);
      pass.end();

      this.device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

}
