struct Particle {
  pos : vec2<f32>,      // position
  vel : vec2<f32>,      // velocity
  color : vec3<f32>,    // color (unused in compute but stored)
  species : u32,        // type/species id
};

struct SimParams {
  deltaT : f32,         // time step
  ruleRadius : f32,     // interaction radius
  ruleStrength : f32,   // interaction strength
  width : f32,          // canvas width
  height : f32,         // canvas height
  particleCount : u32,  // total particles
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : SimParams;

@compute @workgroup_size(64) // must match JS dispatch
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
  let index = id.x;
  if (index >= params.particleCount) {
    return;
  }

  var self = particles[index];
  var force = vec2<f32>(0.0, 0.0);

  // naive O(n^2) interaction (can optimize later with grid / tiling)
  for (var i : u32 = 0u; i < params.particleCount; i = i + 1u) {
    if (i == index) { continue; }

    let other = particles[i];
    let dir = other.pos - self.pos;
    let dist = length(dir);

    if (dist > 0.0 && dist < params.ruleRadius) {
      let dirNorm = dir / dist;

      // simple attraction/repulsion rule based on species
      var strength = params.ruleStrength;
      if (self.species != other.species) {
        strength = -strength; // repel if different
      }

      force += dirNorm * strength / dist;
    }
  }

  // integrate velocity
  self.vel += force * params.deltaT;

  // damping
  self.vel *= 0.98;

  // update position
  self.pos += self.vel * params.deltaT;

  // wrap around screen edges
  if (self.pos.x < 0.0) { self.pos.x += params.width; }
  if (self.pos.x > params.width) { self.pos.x -= params.width; }
  if (self.pos.y < 0.0) { self.pos.y += params.height; }
  if (self.pos.y > params.height) { self.pos.y -= params.height; }

  // write back
  particles[index] = self;
}
