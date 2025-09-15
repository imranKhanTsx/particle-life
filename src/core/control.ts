import { ParticleLife } from "./ParticalLife";
export function updateMaxSpeed(p: ParticleLife, speed: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    // assuming maxSpeed is index 5
    p.paramsArray[5] = speed;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}
export function updateMinDistance(p: ParticleLife, distance: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    // assuming minDistance is index 7
    p.paramsArray[7] = distance;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}
export function updateStrengthFactor(p: ParticleLife, factor: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    // assuming strengthFactor is index 8
    p.paramsArray[8] = factor;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}
export function updateFriction(p: ParticleLife, friction: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    // assuming friction is index 4
    p.paramsArray[4] = friction;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}
export function updateInteractionRadius(p: ParticleLife, radius: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    p.options.interactionRadius = radius;
    p.paramsArray[1] = radius;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}
export function setParticleSize(p: ParticleLife, size: number) {
    if (!p.device || !p.paramsBuffer || !p.vertexParamsBuffer) {
        console.warn("Device or buffers not ready");
        return;
    }
    p.options.particleSize = size;
    p.vertexParams[0] = size;
    p.device.queue.writeBuffer(p.vertexParamsBuffer, 0, p.vertexParams.buffer);
}

export function updateRepulsion(p: ParticleLife, strength: number) {
    if (!p.device || !p.paramsBuffer) {
        console.warn("Device or paramsBuffer not ready");
        return;
    }
    // assuming repelStrength is index 6
    p.paramsArray[6] = strength;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);
}


export async function updateParticleCount(p: ParticleLife, newCount: number) {
    // 1️⃣ Update option
    p.options.particleCount = newCount;

    // 2️⃣ Rebuild CPU arrays (species distribution, colors, velocities)
    p.speciesIds = new Uint8Array(newCount);
    const counts = p.options.distribution.map(r => Math.floor(r * newCount));
    let idx = 0;
    for (let s = 0; s < counts.length; s++) {
        for (let j = 0; j < counts[s]!; j++) {
            p.speciesIds[idx++] = s;
        }
    }
    const speciesIdArray = new Uint32Array(p.options.particleCount);
    speciesIdArray.set(p.speciesIds);
    p.speciesIdBuffer.destroy?.();
    p.speciesIdBuffer = p.device.createBuffer({
        size: speciesIdArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Uint32Array(p.speciesIdBuffer.getMappedRange()).set(speciesIdArray);
    p.speciesIdBuffer.unmap();

    // velocities
    p.velocities = new Float32Array(newCount * 2);
    for (let i = 0; i < newCount; i++) {
        p.velocities[i * 2] = (Math.random() - 0.5) * 0.01;
        p.velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.01;
    }

    // particleData (4 verts × 7 floats)
    const cornerOffsets: [number, number][] = [
        [-1, -1], // bottom-left
        [1, -1],  // bottom-right
        [1, 1],   // top-right
        [-1, 1],  // top-left
    ];
    p.particleData = new Float32Array(newCount * 4 * 7);
    for (let i = 0; i < p.options.particleCount; i++) {
        const cx = Math.random() * 2 - 1;
        const cy = Math.random() * 2 - 1;
        const [r, g, b] = p.options.speciesColors[Number(p.speciesIds[i])] ?? [1, 1, 1];

        for (let j = 0; j < 4; j++) {
            const [lx, ly] = cornerOffsets[j]!;
            const baseIndex = (i * 4 + j) * 7;

            p.particleData[baseIndex + 0] = cx;
            p.particleData[baseIndex + 1] = cy;
            p.particleData[baseIndex + 2] = r;
            p.particleData[baseIndex + 3] = g;
            p.particleData[baseIndex + 4] = b;
            p.particleData[baseIndex + 5] = lx;
            p.particleData[baseIndex + 6] = ly;
        }
    }

    // 3️⃣ Recreate GPU buffers
    p.particleBuffer.destroy?.();
    p.velocityBuffer.destroy?.();
    p.indexBuffer.destroy?.();

    p.particleBuffer = p.device.createBuffer({
        size: p.particleData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
    });
    new Float32Array(p.particleBuffer.getMappedRange()).set(p.particleData);
    p.particleBuffer.unmap();

    p.velocityBuffer = p.device.createBuffer({
        size: p.velocities.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(p.velocityBuffer.getMappedRange()).set(p.velocities);
    p.velocityBuffer.unmap();

    // indices
    const allIndices = new Uint16Array(newCount * 6);
    for (let i = 0; i < newCount; i++) {
        const vOff = i * 4;
        const iOff = i * 6;
        allIndices.set([vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3], iOff);
    }
    p.indexBuffer = p.device.createBuffer({
        size: allIndices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Uint16Array(p.indexBuffer.getMappedRange()).set(allIndices);
    p.indexBuffer.unmap();

    // 4️⃣ Update paramsArray and write to paramsBuffer
    p.paramsArray[2] = newCount;
    p.device.queue.writeBuffer(p.paramsBuffer, 0, p.paramsArray.buffer);

    // 5️⃣ Update compute bind group (needs new buffers)
    p.computeBindGroup = p.device.createBindGroup({
        layout: p.computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: p.particleBuffer } },
            { binding: 1, resource: { buffer: p.velocityBuffer } },
            { binding: 2, resource: { buffer: p.paramsBuffer } },
            { binding: 3, resource: { buffer: p.interactionMatrixBuffer } },
            { binding: 4, resource: { buffer: p.speciesIdBuffer } }
        ],
    });
}

