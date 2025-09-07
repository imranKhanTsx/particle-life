struct Particle {
  pos : vec2f,
  color : vec3f,
  localOffset : vec2f,
};
struct InteractionMatrix {
  values : array<vec4<f32>, 3>, // 3 rows, each row = vec4
};
@group(0) @binding(0) var<storage, read_write> particles : array<f32>;  // your packed particleData
@group(0) @binding(1) var<storage, read_write> velocities : array<vec2f>;
@group(0) @binding(2) var<uniform> params : vec4<f32>;  /*   const paramsArray = new Float32Array([
      0.016,                    // deltaT
      this.options.interactionRadius, // ruleRadius
      0.0,                      // placeholder
      0.0,                      // padding to 16 bytes if needed
      this.options.particleCount // we will store particleCount separately as u32 in a separate view below
    ]);
*/
@group(0) @binding(3) var<uniform> interactionMatrix : InteractionMatrix;

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) id : vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&velocities)) {
    return;
  }

  var vel = velocities[i]; // local copy
  let posA = vec2f(particles[i * 28 + 0], particles[i * 28 + 1]);
  let colorA = vec3f(particles[i * 28 + 2], particles[i * 28 + 3], particles[i * 28 + 4]);

  let radius = params.y;
  let minDist = 0.02;      // “personal space” distance
  let maxSpeed = 0.01;     // limit velocity
  let repelStrength = 0.01; // repulsion scaling

  for (var j = 0u; j < arrayLength(&velocities); j++) {
    if (i == j) { continue; }

    let posB = vec2f(particles[j * 28 + 0], particles[j * 28 + 1]);
    let colorB = vec3f(particles[j * 28 + 2], particles[j * 28 + 3], particles[j * 28 + 4]);

    var delta = posB - posA;
    let distSqr = dot(delta, delta);
    if (distSqr > radius * radius || distSqr <= 0.0001) { continue; }

    let dist = sqrt(distSqr);
    let normDelta = delta / dist;

    // Interaction strength based on colors
    var interaction = interactionMatrix.values[0];
    if (colorA.g > colorA.r && colorA.g > colorA.b) { interaction = interactionMatrix.values[1]; }
    else if (colorA.b > colorA.r && colorA.b > colorA.g) { interaction = interactionMatrix.values[2]; }

    var strength = interaction.x * colorB.r + interaction.y * colorB.g + interaction.z * colorB.b;
    strength *= 0.001; // scale up to match old JS behavior

    // linear falloff attraction
    vel += normDelta * strength * (1.0 - dist / radius);

    //short-range repulsion
    if (dist < minDist) {
      let repel = -normDelta * repelStrength * (1.0 - dist / minDist);
      vel += repel;
    }
  }

  // clamp velocity
  let speed = length(vel);
  if (speed > maxSpeed) {
    vel = (vel / speed) * maxSpeed;
  }

  // update positions
  var posX = posA.x + vel.x;
  var posY = posA.y + vel.y;

  // --- Bounce walls instead of wrap ---
  // let boundary = 0.99;

  // if (posX < -boundary) {
  //   posX = -boundary;
  //   vel.x = -vel.x;   // bounce back
  // }
  // if (posX > boundary) {
  //   posX = boundary;
  //   vel.x = -vel.x;
  // }
  // if (posY < -boundary) {
  //   posY = -boundary;
  //   vel.y = -vel.y;
  // }
  // if (posY > boundary) {
  //   posY = boundary;
  //   vel.y = -vel.y;
  // }

  //wrap around edges 
  if (posX < -1.0) { posX = 1.0; } 
  if (posX > 1.0) { posX = -1.0; } 
  if (posY < -1.0) { posY = 1.0; } 
  if (posY > 1.0) { posY = -1.0; }

  // write back to all 4 vertices
  for (var k = 0u; k < 4u; k++) {
    let base = i * 28u + k * 7u;
    particles[base + 0u] = posX;
    particles[base + 1u] = posY;
  }

  // friction
  vel *= 0.9;

  // write back velocity
  velocities[i] = vel;
}
