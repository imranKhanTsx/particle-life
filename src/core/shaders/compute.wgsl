struct Particle {
  pos : vec2f,
  color : vec3f,
  localOffset : vec2f,
};
struct Params {
  deltaT : f32,
  ruleRadius : f32,
  particleCount : f32, 
  numSpecies : f32,    
  friction : f32,
  maxSpeed : f32,   
  repelStrength : f32, 
  minDistance : f32, 
  strengthFactor : f32, 
};

@group(0) @binding(0) var<storage, read_write> particles : array<f32>;  // your packed particleData
@group(0) @binding(1) var<storage, read_write> velocities : array<vec2f>;
@group(0) @binding(2) var<uniform> params : Params;

@group(0) @binding(3) var<storage, read_write> interactionMatrix : array<f32>; // flattened interaction matrix
@group(0) @binding(4) var<storage, read_write> speciesIds : array<u32>; // species id for each particle

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) id : vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&velocities)) {
    return;
  }

  var vel = velocities[i]; // local copy
  let posA = vec2f(particles[i * 28 + 0], particles[i * 28 + 1]);
  let colorA = vec3f(particles[i * 28 + 2], particles[i * 28 + 3], particles[i * 28 + 4]);

  let radius = params.ruleRadius;
  let minDist = params.minDistance;      // “personal space” distance
  let maxSpeed = params.maxSpeed;     // limit velocity
  let repelStrength = params.repelStrength; // repulsion scaling

  let speciesA : u32 = speciesIds[i];

  for (var j = 0u; j < arrayLength(&velocities); j++) {
    if (i == j) { continue; }

    let posB = vec2f(particles[j * 28 + 0], particles[j * 28 + 1]);
    let colorB = vec3f(particles[j * 28 + 2], particles[j * 28 + 3], particles[j * 28 + 4]);

    var delta = posB - posA;
    let distSqr = dot(delta, delta);
    if (distSqr > radius * radius || distSqr <= 0.0001) { continue; }

    let dist = sqrt(distSqr);
    let normDelta = delta / dist;

    let speciesB : u32 = speciesIds[j];
    let strength = interactionMatrix[speciesA * u32(params.numSpecies) + speciesB] * params.strengthFactor;

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
  vel *= params.friction;

  // write back velocity
  velocities[i] = vel;
}
