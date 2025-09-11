struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) localOffset: vec2f,
};
struct VertexParams {
    particleSize: f32,
    aspectRatio: f32,
};
@group(0) @binding(0) var<uniform> params: VertexParams;

@vertex
fn vertex_main(
    @location(0) center: vec2f,      // particle center
    @location(1) color: vec3f,       // particle color
    @location(2) localOffset: vec2f  // quad corner offset
) -> VertexOut {
    var out: VertexOut;
    let particleSize = params.particleSize; // adjust this for bigger/smaller particles

    // offset the vertex by localOffset scaled by particleSize
    let currectoffset = vec2f(localOffset.x*params.aspectRatio, localOffset.y);
    let pos = center + currectoffset * particleSize;

    out.position = vec4f(pos.x, pos.y, 0.0, 1.0);
    out.color = color;
    out.localOffset = vec2f(localOffset.x, localOffset.y); // pass through for fragment shader
    return out;
}
