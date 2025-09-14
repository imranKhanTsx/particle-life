struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) localOffset: vec2f, // this is already giving you -1..1 coordinates
};

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    let dist = length(in.localOffset);

    // fade edge between 0.9 and 1.0
    let alpha = 1.0 - smoothstep(0.7, 1.0, dist);

    // kill pixels fully outside (optional, saves fillrate)
    if (alpha <= 0.0) {
        discard;
    }

    return vec4f(in.color, alpha);
}
