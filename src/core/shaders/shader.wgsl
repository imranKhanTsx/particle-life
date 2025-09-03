// struct screen {
//     size: vec2f,
// };
// @group(0) @binding(0) var<uniform> screenSize: screen;

@vertex
fn vertex_main(@location(0) position: vec2f) -> @builtin(position) vec4f {
    return vec4f(position.x, position.y, 0.0, 1.0);
}

@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4f(1.0, 1.0, 1.0, 1.0); // white color
}
