struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) localOffset: vec2f, // this is already giving you -1..1 coordinates
};

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    // Compute distance from center in local quad space
    let dist = length(in.localOffset);

    // If fragment is outside unit circle, throw it away
    if (dist > 1.0) {
        discard;
    }

    // Otherwise paint it
    return vec4f(in.color, 1.0);
}
