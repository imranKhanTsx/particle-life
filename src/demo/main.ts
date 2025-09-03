import { ParticleLife } from "../core/ParticalLife";

const canvas = document.querySelector("canvas")!;
const min = Math.min(window.innerWidth, window.innerHeight);
canvas.width = min;
canvas.height = min;

const particleLife = new ParticleLife(canvas, { particleCount: 1000});
await particleLife.init();
particleLife.start();
