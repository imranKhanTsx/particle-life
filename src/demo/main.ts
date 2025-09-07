import { ParticleLife } from "../core/ParticalLife";

const canvas = document.querySelector("canvas")!;
const min = Math.min(window.innerWidth, window.innerHeight);
canvas.width = min;
canvas.height = min;

const particleLife = new ParticleLife(canvas, { particleCount: 2000, species: 3, interactionRadius: 0.1, distribution:[0.3333, 0.3333, 0.3333] });
await particleLife.init();
particleLife.start()
