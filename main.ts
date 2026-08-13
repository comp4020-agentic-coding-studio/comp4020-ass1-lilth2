import {
  applyBrake,
  createRoad,
  equilibriumSpeed,
  jamIntensity,
  nearStoppedCount,
  PARAMS,
  probeStability,
  speedStats,
  step,
} from "./src/traffic";
import type { RoadState, SimParams, StabilityZone } from "./src/traffic";
import { createWaveView } from "./src/waveView";
import { createRealRoadView } from "./src/realRoadView";

// Simulated time runs faster than wall-clock time so a wave that takes
// minutes of simulated time to fully settle (see PROCESS.md for the probe
// that measured this) is visible within a few seconds of clicking "Trigger
// small brake". This is purely a rendering-cadence choice — step() itself
// has no notion of real time.
const STEPS_PER_TICK = 10;
const JAM_STDEV_THRESHOLD = 0.1;

// The car "Trigger small brake" always perturbs — the lane's lead car.
// Fixed rather than user-clicked, so the core interaction (how a brake event
// propagates) is decoupled from an unrelated hit-testing feature.
const BRAKE_LANE = 0;
const BRAKE_CAR = 0;

// Traffic density is the only slider left — reaction delay, following
// distance and brake strength are pinned to the combination a density sweep
// (see PROCESS.md) showed reliably demonstrates BOTH ends of the density
// slider: 8-20 cars/lane absorbs this brake, 24-40 sustains a lasting jam.
// The 1.0s reaction delay is chosen for the thesis ("just reaction delay"),
// not because it's numerically load-bearing here — the same sweep found the
// absorbed/jam crossover barely moves between 0s and 1.0s of delay at this
// following distance; density and spacing dominate the threshold.
const FIXED_FOLLOWING_DISTANCE = 6;
const FIXED_REACTION_DELAY = 1.0;
const FIXED_BRAKE_STRENGTH = 0.2;

// Two renderers, one shared RoadState below — render() calls both every
// tick so the abstract Wave view and the skeuomorphic Real road view can
// never drift out of sync with each other.
const waveView = createWaveView(document);
const realRoadView = createRealRoadView(document);

const densityInput = document.querySelector<HTMLInputElement>("#density")!;
const densityValue = document.querySelector<HTMLOutputElement>("#density-value")!;

const triggerBrakeButton = document.querySelector<HTMLButtonElement>("#trigger-brake")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

const stateLabel = document.querySelector<HTMLElement>("#state-label")!;
const stabilityZoneEl = document.querySelector<HTMLElement>("#stability-zone")!;
const meanSpeedEl = document.querySelector<HTMLElement>("#mean-speed")!;
const ghostWaveEl = document.querySelector<HTMLElement>("#ghost-wave")!;
const stoppedCarsEl = document.querySelector<HTMLElement>("#stopped-cars")!;
const explanationEl = document.querySelector<HTMLElement>("#explanation")!;

function currentSimParams(): SimParams {
  return {
    followingDistance: FIXED_FOLLOWING_DISTANCE,
    reactionDelay: FIXED_REACTION_DELAY,
  };
}

let road: RoadState = createRoad(
  Number(densityInput.value),
  PARAMS.laneCount,
  PARAMS.trackLength,
  FIXED_FOLLOWING_DISTANCE,
);
let simulatedSeconds = 0;
let brakeTriggeredAt: number | null = null;

function render(): void {
  // This density's own free-flow speed — not a fixed constant — is the
  // yardstick "is this car unusually slow" (and, via jamIntensity below, "how
  // jammed is the whole road") is judged against. Recomputed every tick
  // (rather than only on density change) since density is now the only
  // slider that can move it; see traffic.ts's equilibriumSpeed and
  // PROCESS.md for the bug this fixed.
  const referenceSpeed = equilibriumSpeed(
    Number(densityInput.value),
    PARAMS.trackLength,
    FIXED_FOLLOWING_DISTANCE,
  );
  waveView.render(road, referenceSpeed);
  realRoadView.render(road, referenceSpeed);

  const { mean } = speedStats(road);
  const intensity = jamIntensity(road, referenceSpeed);
  meanSpeedEl.textContent = mean.toFixed(2);
  ghostWaveEl.textContent = `${Math.round(intensity * 100)}%`;
  stoppedCarsEl.textContent = String(nearStoppedCount(road, referenceSpeed));

  const jamming = intensity > JAM_STDEV_THRESHOLD;
  stateLabel.textContent = jamming ? "Stop-and-go wave" : "Free-flowing";
  stateLabel.dataset.state = jamming ? "jam" : "free-flow";

  updateExplanation(intensity);
}

function updateExplanation(intensity: number): void {
  if (brakeTriggeredAt === null) {
    explanationEl.textContent =
      "Every car is holding a steady, uniform gap. Try Trigger small brake.";
    return;
  }
  const since = simulatedSeconds - brakeTriggeredAt;
  if (since < 3) {
    explanationEl.textContent =
      "A small brake near car #1 just rippled backward through the following traffic.";
  } else if (intensity > 0.1) {
    explanationEl.textContent =
      "That small brake never faded — this density, delay and spacing can't recover, so the wave just keeps circulating.";
  } else if (intensity < 0.02) {
    explanationEl.textContent =
      "That small brake got absorbed within a few car-lengths — this spacing has enough slack to recover.";
  } else {
    explanationEl.textContent =
      "Still spreading — give it a few more seconds to see whether it settles or grows.";
  }
}

function resetSimulation(): void {
  const carsPerLane = Number(densityInput.value);
  road = createRoad(
    carsPerLane,
    PARAMS.laneCount,
    PARAMS.trackLength,
    FIXED_FOLLOWING_DISTANCE,
  );
  waveView.rebuildCars(carsPerLane);
  realRoadView.rebuildVehicles(carsPerLane);
  simulatedSeconds = 0;
  brakeTriggeredAt = null;
  render();
  scheduleStabilityProbe();
}

function triggerBrake(): void {
  road = applyBrake(road, BRAKE_LANE, BRAKE_CAR, FIXED_BRAKE_STRENGTH);
  brakeTriggeredAt = simulatedSeconds;
  render();
}

function advance(): void {
  const params = currentSimParams();
  for (let i = 0; i < STEPS_PER_TICK; i++) {
    road = step(road, PARAMS.dt, params);
  }
  simulatedSeconds += STEPS_PER_TICK * PARAMS.dt;
}

const ZONE_LABEL: Record<StabilityZone, string> = {
  stable: "likely stable",
  borderline: "borderline",
  unstable: "likely unstable",
};

let stabilityProbeTimer: ReturnType<typeof setTimeout> | undefined;

// A real, independent probe run against the current slider settings (not a
// lookup table) — debounced so dragging a slider doesn't run a ~20ms
// simulation on every single `input` event. See probeStability() in
// src/traffic.ts and PROCESS.md for why it's a standardised nudge rather
// than reusing the user's own brake-strength slider.
function scheduleStabilityProbe(): void {
  clearTimeout(stabilityProbeTimer);
  stabilityProbeTimer = setTimeout(() => {
    const zone = probeStability(Number(densityInput.value), currentSimParams());
    stabilityZoneEl.textContent = ZONE_LABEL[zone];
    stabilityZoneEl.dataset.zone = zone;
  }, 150);
}

densityInput.addEventListener("input", () => {
  densityValue.textContent = densityInput.value;
  resetSimulation();
});
triggerBrakeButton.addEventListener("click", triggerBrake);
resetButton.addEventListener("click", resetSimulation);

waveView.rebuildCars(Number(densityInput.value));
realRoadView.rebuildVehicles(Number(densityInput.value));
render();
scheduleStabilityProbe();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    render();
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
