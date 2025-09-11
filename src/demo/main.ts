import { ParticleLife } from "../core/ParticalLife";

const canvas = document.querySelector("canvas")!;
const min = Math.min(window.innerWidth, window.innerHeight);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
console.log("canvas", canvas.height / canvas.width);

const particleLife = new ParticleLife(canvas, {
    particleCount: 2000, species: 4, interactionRadius: 0.05, distribution: [0.25, 0.25, 0.25, 0.25],
    intersectionMatrix: [
        [0.5, -0.2, 0.7, 0.3],
        [0.0, 0.5, 0.1, -0.1],
        [-0.4, 0.1, 0.5, 0.2],
        [0.2, -0.1, -0.3, 0.5],
    ],
    speciesColors: {
        0: [1, 0, 0],
        1: [0, 1, 0],
        2: [0, 0, 1],
        3: [1, 1, 0],
    },
    particleSize: 0.003,
});
await particleLife.init();
particleLife.start();