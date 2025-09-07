import vertex_shader from "./shaders/vertex.wgsl?raw";
import fragment_shader from "./shaders/fragment.wgsl?raw";
import compute_shader from "./shaders/compute.wgsl?raw";

export interface ParticleLifeOptions {
  particleCount?: number;
  species?: number;
  interactionRadius?: number;
  distribution?: number[];
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
  velocityBuffer!: GPUBuffer;
  paramsBuffer!: GPUBuffer;

  constructor(canvas: HTMLCanvasElement, options: ParticleLifeOptions = {}) {
    console.log(vertex_shader);
    console.log(fragment_shader);
    console.log(compute_shader);
    this.canvas = canvas;
    this.options = {
      particleCount: options.particleCount ?? 1000,
      species: options.species ?? 3,
      interactionRadius: options.interactionRadius ?? 0.02,
      distribution: options.distribution ?? [0.4, 0.3, 0.3],
    };
    // Example: 3 species
    this.speciesColors = {
      0: [1.0, 0.0, 0.0],   // red
      1: [0.0, 1.0, 0.0],   // green
      2: [0.0, 0.0, 1.0],   // blue
      // 2: [1, 1, 0],   // yellow
    };
    this.speciesIds = new Uint8Array(this.options.particleCount);


    // You need to store velocities per particle
    // Example: in constructor
    this.velocities = new Float32Array(this.options.particleCount * 2); // dx, dy per particle
    for (let i = 0; i < this.options.particleCount; i++) {
      this.velocities[i * 2 + 0] = (Math.random() - 0.5) * 0.01;
      this.velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.01;
      // this.velocities[i * 2 + 0] = 0;
      // this.velocities[i * 2 + 1] = 0;
    }


  }

  createUniformBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
    // how many bytes actual data takes
    const byteLength = data.byteLength;

    // round up to the nearest multiple of 64
    const alignedSize = Math.ceil(byteLength / 64) * 64;

    const buffer = device.createBuffer({
      size: alignedSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // write data into the buffer
    device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);

    return buffer;
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
    const counts = this.options.distribution.map(r => Math.floor(r * this.options.particleCount));

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

    // --- after creating this.particleBuffer and filling it ---

    // 1) create a velocity buffer (one vec2 per particle)
    const velocityArray = new Float32Array(this.options.particleCount * 2);
    for (let i = 0; i < this.options.particleCount; i++) {
      velocityArray[i * 2 + 0] = this.velocities[i * 2 + 0] ?? 0; // already set in ctor but copy to a typed array
      velocityArray[i * 2 + 1] = this.velocities[i * 2 + 1] ?? 0;
    }

    this.velocityBuffer = this.device.createBuffer({
      size: velocityArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.velocityBuffer.getMappedRange()).set(velocityArray);
    this.velocityBuffer.unmap();

    // 2) optional: create a small params uniform buffer (deltaT, radius, particleCount)
    const paramsArray = new Float32Array([
      0.016,                    // deltaT
      this.options.interactionRadius, // ruleRadius
      0.0,                      // placeholder
      0.0,                      // padding to 16 bytes if needed
      this.options.particleCount // we will store particleCount separately as u32 in a separate view below
    ]);

    // pack particleCount into a separate Uint32Array view (WGSL needs alignment care).
    const paramsBufferSize = 4 * 4 + 4; // keep it simple
    this.paramsBuffer = this.createUniformBuffer(this.device, paramsArray);
    // Write params (we'll use writeBuffer)
    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsArray.buffer as ArrayBuffer);

    // Example: 3 species, value = strength of attraction (+) or repulsion (-)
    const interactionMatrix: number[][] = [
      [0.0, 0.0, 0.0, 0.0], // Red weakly attracts both, avoids self [red, green, blue]
      [0.0, 0.0, 0.0, 0.0], // Green weakly attracts both, avoids self [red, green, blue]
      [0.0, 0.0, 0.2, 0.0], // Blue weakly attracts both, avoids self [red, green, blue]
    ];

    const matrixData = new Float32Array(interactionMatrix.flat());
    const interactionMatrixBuffer = this.createUniformBuffer(this.device, matrixData);
    this.device.queue.writeBuffer(interactionMatrixBuffer, 0, matrixData.buffer as ArrayBuffer);

    // 3) create compute pipeline (you already do this) and compute bind group
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: computeModule,
        entryPoint: "compute_main",
      },
    });

    // create bind group now (layout index 0 must match shader)
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } }, // storage: particle data floats
        { binding: 1, resource: { buffer: this.velocityBuffer } }, // storage: velocities vec2
        { binding: 2, resource: { buffer: this.paramsBuffer } },   // uniform params
        { binding: 3, resource: { buffer: interactionMatrixBuffer } }, // uniform interaction matrix
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

    const frame = () => {
      const encoder = this.device.createCommandEncoder();

      // 1️⃣ Run compute shader first
      {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.computeBindGroup);
        const workgroupCount = Math.ceil(this.options.particleCount / 64);
        computePass.dispatchWorkgroups(workgroupCount);
        computePass.end();
      }

      // 2️⃣ Render as before
      const textureView = this.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });

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
