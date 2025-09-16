import { updateRepulsion, updateParticleCount, setParticleSize, updateInteractionRadius, updateFriction, updateMaxSpeed, updateMinDistance, updateStrengthFactor } from "../core/control";
import { ParticleLife } from "../core/ParticalLife";

const canvas = document.querySelector("canvas")!;
const min = Math.min(window.innerWidth, window.innerHeight);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;


const particleLife = new ParticleLife(canvas, {
    particleCount: 2000, species: 4, interactionRadius: 0.05, distribution: [0.25, 0.25, 0.25, 0.25],
    intersectionMatrix: [
        [-0.5, 0.4, 0.3, 0.2],
        [0.4, -0.5, 0.3, -0.2],
        [0.1, 0.2, -0.5, 0.1],
        [-0.4, 0.2, 0.3, -0.5],
    ],
    speciesColors: {
        0: [1, 0, 0],
        1: [0, 1, 0],
        2: [0, 0, 1],
        3: [1, 1, 0],
    },
    particleSize: 0.005,
    maxSpeed:0.0001
});
await particleLife.init();
particleLife.start();
const repelStrengthSlider = document.getElementById("repelStrength") as HTMLInputElement;
const numberOfParticlesSlider = document.getElementById("numParticles") as HTMLInputElement;
const particalSize = document.getElementById("particleSize") as HTMLInputElement;
const interactionRadius = document.getElementById("interactionRadius") as HTMLInputElement;
const friction = document.getElementById("friction") as HTMLInputElement;
const maxSpeed = document.getElementById("maxSpeed") as HTMLInputElement;
const minDistance = document.getElementById("minDistance") as HTMLInputElement;
const strengthFactor = document.getElementById("strengthFactor") as HTMLInputElement;

// Event listeners



repelStrengthSlider.addEventListener("input", (e) => {
    const repelStrengthValue = parseFloat(repelStrengthSlider.value);
    updateRepulsion(particleLife, repelStrengthValue);
});
numberOfParticlesSlider.addEventListener("input", (e) => {
    const numParticlesValue = parseInt(numberOfParticlesSlider.value);
    updateParticleCount(particleLife, numParticlesValue);
});
particalSize.addEventListener("input", (e) => {
    const particalSizeValue = parseFloat(particalSize.value);
    setParticleSize(particleLife, particalSizeValue);
});

interactionRadius.addEventListener("input", (e) => {
    const interactionRadiusValue = parseFloat(interactionRadius.value);
    updateInteractionRadius(particleLife, interactionRadiusValue);
});

friction.addEventListener("input", (e) => {
    const frictionValue = parseFloat(friction.value);
    updateFriction(particleLife, frictionValue);
});

maxSpeed.addEventListener("input", (e) => {
    const maxSpeedValue = parseFloat(maxSpeed.value);
    updateMaxSpeed(particleLife, maxSpeedValue);
});
minDistance.addEventListener("input", (e) => {
    const minDistanceValue = parseFloat(minDistance.value);
    updateMinDistance(particleLife, minDistanceValue);
});
strengthFactor.addEventListener("input", (e) => {
    const strengthFactorValue = parseFloat(strengthFactor.value);
    updateStrengthFactor(particleLife, strengthFactorValue);
});
