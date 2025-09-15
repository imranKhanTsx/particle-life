import vertex_shader from "./shaders/vertex.wgsl?raw";
import fragment_shader from "./shaders/fragment.wgsl?raw";
import compute_shader from "./shaders/compute.wgsl?raw";

export interface ParticleLifeOptions {
  particleCount?: number;
  species?: number;
  interactionRadius?: number;
  distribution?: number[];
  particleSize?: number;
  maxSpeed?: number;
  intersectionMatrix?: number[][];
  friction?: number;
  forceScalingFactor?: number;
  repulStrength?: number;
  minDistance?: number;
  speciesColors?: Record<number, [number, number, number]>;
}

export class ParticleLife {
  canvas: HTMLCanvasElement;
  device!: GPUDevice;
  context!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  particleBuffer!: GPUBuffer;
  indexBuffer!: GPUBuffer;

  options: Required<ParticleLifeOptions>;
  // private particlePositions!: Float32Array;
  particleData!: Float32Array;
  bindGroup?: GPUBindGroup;
  velocities: Float32Array<ArrayBuffer>;
  // speciesColors: Record<number, [number, number, number]>;
  speciesIds: Uint8Array<ArrayBuffer>;
  computePipeline!: GPUComputePipeline;
  computeBindGroup!: GPUBindGroup;
  velocityBuffer!: GPUBuffer;
  paramsBuffer!: GPUBuffer;
  vertexBindGroup!: GPUBindGroup;
  paramsArray: Float32Array<ArrayBuffer>;
  speciesIdBuffer!: GPUBuffer;
  interactionMatrixBuffer!: GPUBuffer;
  vertexParamsBuffer!: GPUBuffer;
  vertexParams: Float32Array<ArrayBuffer>;

  constructor(canvas: HTMLCanvasElement, options: ParticleLifeOptions = {}) {
    this.canvas = canvas;
    this.options = {
      particleCount: options.particleCount ?? 1000,
      species: options.species ?? 3,
      interactionRadius: options.interactionRadius ?? 0.02,
      distribution: options.distribution ?? [0.33, 0.33, 0.33],
      particleSize: options.particleSize ?? 0.005,
      maxSpeed: options.maxSpeed ?? 0.01,
      repulStrength: 0.01,
      minDistance: 0.01,
      intersectionMatrix: options.intersectionMatrix ?? [
        [0.02, -0.02, 0.02],
        [-0.02, 0.02, -0.01],
        [-0.01, 0.01, 0.02],
      ],
      friction: options.friction ?? 0.1,
      forceScalingFactor: options.forceScalingFactor ?? 1.0,
      speciesColors: options.speciesColors ?? {
        0: [1, 0, 0],
        1: [0, 1, 0],
        2: [0, 0, 1],
      },
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

    this.paramsArray = new Float32Array([
      0.016,                    // deltaT
      this.options.interactionRadius, // ruleRadius
      this.options.particleCount, // we will store particleCount separately as u32 in a separate view below
      this.options.species,
      0.99, // friction
      0.01, // maxSpeed
      0.01, // repelStrength
      0.015, // minDistance
      0.00015, // strength scaling factor
    ]);
    this.vertexParams = new Float32Array([this.options.particleSize, this.canvas.height / this.canvas.width]);
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
      const [r, g, b] = this.options.speciesColors[Number(this.speciesIds[i])] ?? [1, 1, 1];

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

    this.vertexParamsBuffer = this.device.createBuffer({
      size: this.vertexParams.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexParamsBuffer, 0, this.vertexParams.buffer);


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

    console.log("paramsArray", this.paramsArray);

    this.paramsBuffer = this.createUniformBuffer(this.device, this.paramsArray);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsArray.buffer as ArrayBuffer);

    // Example: 3 species, value = strength of attraction (+) or repulsion (-)

    const speciesIdArray = new Uint32Array(this.options.particleCount);
    speciesIdArray.set(this.speciesIds);

    this.speciesIdBuffer = this.device.createBuffer({
      size: speciesIdArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.speciesIdBuffer, 0, speciesIdArray.buffer, speciesIdArray.byteOffset, speciesIdArray.byteLength);

    const numSpecies = this.options.species;
    if (this.options.intersectionMatrix.flat().length !== numSpecies * numSpecies) {
      throw new Error("Intersection matrix size does not match number of species");
    }
    const matrixData = this.options.intersectionMatrix.flat();
    const dataArray = new Float32Array(matrixData.length);
    dataArray.set(matrixData, 0);
    this.interactionMatrixBuffer = this.device.createBuffer({
      size: dataArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.interactionMatrixBuffer, 0, dataArray.buffer, dataArray.byteOffset, dataArray.byteLength);

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
        { binding: 3, resource: { buffer: this.interactionMatrixBuffer } }, // storage: interaction matrix
        { binding: 4, resource: { buffer: this.speciesIdBuffer } }, // storage: species ids
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
    // Create a bind group for the vertex shader uniform
    this.vertexBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0), // use group 0 in the vertex shader
      entries: [
        {
          binding: 0, // match @binding(0) in vertex shader
          resource: { buffer: this.vertexParamsBuffer },
        },
      ],
    });

    console.log("WebGPU initialized with particles!");
    console.log("Species counts:", this.speciesCountbyId());
    console.log("species:", this.speciesIds);
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
      pass.setBindGroup(0, this.vertexBindGroup);
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
