import {
  applyBrake,
  createRoad,
  equilibriumSpeed,
  jamIntensity,
  nearStoppedCount,
  PARAMS,
  probeStability,
  spaceMeanSpeed,
  step,
} from "./src/traffic";
import type { RoadState, SimParams, StabilityZone } from "./src/traffic";
import { createWaveView } from "./src/waveView";
import { createRingRoadView } from "./src/ringRoadView";
import { createStraightRoadView } from "./src/straightRoadView";

// Simulated time runs faster than wall-clock time, but only ~6x here (was
// ~30x, i.e. STEPS_PER_TICK=10) — slowed on request so the wave visibly,
// gradually bunches cars together after "Trigger small brake" instead of
// snapping almost instantly to its final state. A probe (throwaway
// `pnpm dlx tsx` script, deleted after use — see PROCESS.md) measured, at the
// fixed params below, how jamIntensity actually rises after a brake at
// density=40: essentially flat (<0.09) through 30 simulated seconds, then a
// clean ramp to full saturation (1.0) by 60 simulated seconds. At ~6x that
// ramp plays out over roughly 5-10 real seconds — long enough to watch the
// bunching happen, not so long the demo drags. This is purely a
// rendering-cadence choice — step() itself has no notion of real time.
const STEPS_PER_TICK = 2;
const JAM_STDEV_THRESHOLD = 0.1;

// The car "Trigger small brake" always perturbs — the lane's lead car.
// Fixed rather than user-clicked, so the core interaction (how a brake event
// propagates) is decoupled from an unrelated hit-testing feature.
const BRAKE_LANE = 0;
const BRAKE_CAR = 0;

// Traffic density is the only slider left live (see CLAUDE.md/PROCESS.md for
// this reversal, the third on this exact point). These three were re-probed
// rather than guessed — the same "known good" combination from the earlier
// narrowing (see PROCESS.md moment 11), which already demonstrated both
// outcomes cleanly across the whole density range — so re-narrowing to them
// doesn't lose the phenomenon.
const FIXED_SIM_PARAMS: SimParams = { followingDistance: 6, reactionDelay: 1.0 };
const FIXED_BRAKE_STRENGTH = 0.2;

// Three renderers, one shared RoadState below — render() calls all three
// every tick, regardless of which demo tab is active, so the Ring road view,
// the Straight road view and the auxiliary Wave view can never drift out of
// sync with each other or with the underlying simulation. Switching tabs only
// toggles which <section> is visible; it never starts a second animation
// loop or a second RoadState.
const waveView = createWaveView(document);
const ringRoadView = createRingRoadView(document);
const straightRoadView = createStraightRoadView(document);

type Mode = "ring" | "straight";
let mode: Mode = "ring";

const tabRing = document.querySelector<HTMLButtonElement>("#tab-ring")!;
const tabStraight = document.querySelector<HTMLButtonElement>("#tab-straight")!;
const ringSection = document.querySelector<HTMLElement>("#ring-road-view")!;
const straightSection = document.querySelector<HTMLElement>("#straight-road-view")!;
const explainerRing = document.querySelector<HTMLElement>('.mode-explainer[data-mode="ring"]')!;
const explainerStraight = document.querySelector<HTMLElement>(
  '.mode-explainer[data-mode="straight"]',
)!;

function setMode(next: Mode): void {
  mode = next;
  const isRing = mode === "ring";
  ringSection.hidden = !isRing;
  straightSection.hidden = isRing;
  explainerRing.hidden = !isRing;
  explainerStraight.hidden = isRing;
  tabRing.setAttribute("aria-selected", String(isRing));
  tabStraight.setAttribute("aria-selected", String(!isRing));
}

tabRing.addEventListener("click", () => setMode("ring"));
tabStraight.addEventListener("click", () => setMode("straight"));

const densityInput = document.querySelector<HTMLInputElement>("#density")!;
const densityValue = document.querySelector<HTMLOutputElement>("#density-value")!;

const triggerBrakeButton = document.querySelector<HTMLButtonElement>("#trigger-brake")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

const stateLabel = document.querySelector<HTMLElement>("#state-label")!;
const stabilityZoneEl = document.querySelector<HTMLElement>("#stability-zone")!;
const meanSpeedEl = document.querySelector<HTMLElement>("#mean-speed")!;
const jamIntensityEl = document.querySelector<HTMLElement>("#jam-intensity")!;
const stoppedCarsEl = document.querySelector<HTMLElement>("#stopped-cars")!;
const waveDirectionEl = document.querySelector<HTMLElement>("#wave-direction")!;
const explanationEl = document.querySelector<HTMLElement>("#explanation")!;

let road: RoadState = createRoad(
  Number(densityInput.value),
  PARAMS.laneCount,
  PARAMS.trackLength,
  FIXED_SIM_PARAMS.followingDistance,
);
let simulatedSeconds = 0;
let brakeTriggeredAt: number | null = null;

function render(): void {
  // This density/spacing combination's own free-flow speed — not a fixed
  // constant — is the yardstick "is this car unusually slow" (and, via
  // jamIntensity below, "how jammed is the whole road") is judged against.
  // Recomputed every tick since density can move it; see traffic.ts's
  // equilibriumSpeed and PROCESS.md for the bug this fixed.
  const referenceSpeed = equilibriumSpeed(
    Number(densityInput.value),
    PARAMS.trackLength,
    FIXED_SIM_PARAMS.followingDistance,
  );
  waveView.render(road, referenceSpeed);
  ringRoadView.render(road, referenceSpeed);
  straightRoadView.render(road, referenceSpeed);

  // The space-mean (harmonic) speed, not the plain arithmetic mean — a
  // brake-triggered jam at high density can nonlinearly redistribute cars
  // into a slow platoon plus fast wide-open gaps, and an arithmetic mean can
  // end up *higher* after the jam than before it even though the road is
  // more congested; the harmonic mean doesn't have that paradox (see
  // spaceMeanSpeed in traffic.ts and PROCESS.md for the probe that found it).
  const meanSpeed = spaceMeanSpeed(road);
  const intensity = jamIntensity(road, referenceSpeed);
  meanSpeedEl.textContent = meanSpeed.toFixed(2);
  jamIntensityEl.textContent = `${Math.round(intensity * 100)}%`;
  stoppedCarsEl.textContent = String(nearStoppedCount(road, referenceSpeed));

  const jamming = intensity > JAM_STDEV_THRESHOLD;
  stateLabel.textContent = jamming ? "Stop-and-go wave" : "Free-flowing";
  stateLabel.dataset.state = jamming ? "jam" : "free-flow";
  // Every car here travels in the same direction (see traffic.ts), so a wave,
  // whenever one exists, is always moving upstream relative to traffic — that
  // is the thesis itself, not a computed direction. "None" when there's
  // nothing to report a direction for, rather than fabricating one.
  waveDirectionEl.textContent = jamming ? "Backward (upstream)" : "None";

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
    FIXED_SIM_PARAMS.followingDistance,
  );
  waveView.rebuildCars(carsPerLane);
  ringRoadView.rebuildVehicles(carsPerLane);
  straightRoadView.rebuildVehicles(carsPerLane);
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
  for (let i = 0; i < STEPS_PER_TICK; i++) {
    road = step(road, PARAMS.dt, FIXED_SIM_PARAMS);
  }
  simulatedSeconds += STEPS_PER_TICK * PARAMS.dt;
}

const ZONE_LABEL: Record<StabilityZone, string> = {
  stable: "likely stable",
  borderline: "borderline",
  unstable: "likely unstable",
};

let stabilityProbeTimer: ReturnType<typeof setTimeout> | undefined;

// A real, independent probe run against the current density (not a lookup
// table) — debounced so dragging the slider doesn't run a ~20ms simulation on
// every single `input` event. See probeStability() in src/traffic.ts and
// PROCESS.md for why it's a standardised nudge rather than reusing
// FIXED_BRAKE_STRENGTH.
function scheduleStabilityProbe(): void {
  clearTimeout(stabilityProbeTimer);
  stabilityProbeTimer = setTimeout(() => {
    const zone = probeStability(Number(densityInput.value), FIXED_SIM_PARAMS);
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
ringRoadView.rebuildVehicles(Number(densityInput.value));
straightRoadView.rebuildVehicles(Number(densityInput.value));
setMode("ring");
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
