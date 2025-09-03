export function getRandomInteger(min: number, max: number): number {
  min = Math.ceil(min); // Ensures min is rounded up to the nearest whole number
  max = Math.floor(max); // Ensures max is rounded down to the nearest whole number
  return Math.floor(Math.random() * (max - min + 1)) + min;
}