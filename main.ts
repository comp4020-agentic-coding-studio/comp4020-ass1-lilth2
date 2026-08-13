import { createRing, PARAMS, speedStats, step } from "./src/traffic";
import type { RingState } from "./src/traffic";

// Simulated time runs faster than wall-clock time so a multi-hundred-second
// wave (see PROCESS.md for how that duration was found) is visible within a
// few seconds of dragging the slider. This is purely a rendering-cadence
// choice — step() itself has no notion of real time.
const STEPS_PER_TICK = 10;
const JAM_STDEV_THRESHOLD = 0.05;
const SVG_NS = "http://www.w3.org/2000/svg";
const CENTER = 200;
const RADIUS = 160;
const CAR_RADIUS = 6;

const carsGroup = document.querySelector<SVGGElement>("#cars")!;
const densityInput = document.querySelector<HTMLInputElement>("#density")!;
const densityValue = document.querySelector<HTMLOutputElement>(
  "#density-value",
)!;
const stateLabel = document.querySelector<HTMLElement>("#state-label")!;
const meanSpeedEl = document.querySelector<HTMLElement>("#mean-speed")!;

let ring: RingState = createRing(Number(densityInput.value));
let carElements: SVGCircleElement[] = [];

function rebuildCars(count: number): void {
  carsGroup.replaceChildren();
  carElements = Array.from({ length: count }, () => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", String(CAR_RADIUS));
    carsGroup.appendChild(circle);
    return circle;
  });
}

function speedToColor(fractionOfDesired: number): string {
  const clamped = Math.max(0, Math.min(1, fractionOfDesired));
  const hue = clamped * 120; // 0 = red (stopped), 120 = green (free-flowing)
  return `hsl(${hue} 70% 45%)`;
}

function render(state: RingState): void {
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const theta = (car.position / state.trackLength) * Math.PI * 2 - Math.PI / 2;
    const x = CENTER + RADIUS * Math.cos(theta);
    const y = CENTER + RADIUS * Math.sin(theta);
    const el = carElements[i];
    el.setAttribute("cx", x.toFixed(1));
    el.setAttribute("cy", y.toFixed(1));
    el.setAttribute("fill", speedToColor(car.speed / PARAMS.desiredSpeed));
  }

  const { mean, stdev } = speedStats(state);
  meanSpeedEl.textContent = mean.toFixed(2);
  const jamming = stdev > JAM_STDEV_THRESHOLD;
  stateLabel.textContent = jamming
    ? "Stop-and-go wave forming"
    : "Free-flowing";
  stateLabel.dataset.state = jamming ? "jam" : "free-flow";
}

function resetRing(): void {
  const count = Number(densityInput.value);
  densityValue.textContent = String(count);
  ring = createRing(count);
  rebuildCars(count);
  render(ring);
}

function advance(): void {
  for (let i = 0; i < STEPS_PER_TICK; i++) {
    ring = step(ring);
  }
}

densityInput.addEventListener("input", resetRing);
resetRing();

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// Simulation stepping always runs on rAF, so the wave forms at the same
// simulated-time rate regardless of motion preference. reduced-motion only
// thins out how often the SVG is *redrawn* — a discrete step-and-redraw
// cadence instead of a continuously animating scene, per CLAUDE.md — rather
// than slowing the physics itself down to the point where the phenomenon
// this page is about never becomes visible.
const REDUCED_MOTION_REDRAW_EVERY = 12;
let frame = 0;

const loop = (): void => {
  advance();
  frame++;
  if (!reducedMotion || frame % REDUCED_MOTION_REDRAW_EVERY === 0) {
    render(ring);
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
