import {
  applyBrake,
  createRoad,
  jamIntensity,
  nearStoppedCount,
  PARAMS,
  probeStability,
  speedStats,
  step,
} from "./src/traffic";
import type { RoadState, SimParams, StabilityZone } from "./src/traffic";

// Simulated time runs faster than wall-clock time so a wave that takes
// minutes of simulated time to fully settle (see PROCESS.md for the probe
// that measured this) is visible within a few seconds of clicking "Trigger
// small brake". This is purely a rendering-cadence choice — step() itself
// has no notion of real time.
const STEPS_PER_TICK = 10;
const JAM_STDEV_THRESHOLD = 0.1;
const SLOW_FRACTION = 0.6; // below this fraction of desired speed, a car counts as part of a jam band
const SVG_NS = "http://www.w3.org/2000/svg";

const VIEW_WIDTH = 900;
const PX_PER_UNIT = VIEW_WIDTH / PARAMS.trackLength;
const LANE_Y = [20, 100, 180];
const LANE_HEIGHT = 60;
const CAR_RADIUS = 6;

// The car "Trigger small brake" always perturbs — the middle lane's lead
// car. Fixed rather than user-clicked, so the core interaction (how a brake
// event propagates) is decoupled from an unrelated hit-testing feature.
const BRAKE_LANE = 1;
const BRAKE_CAR = 0;

const carsGroup = document.querySelector<SVGGElement>("#cars")!;
const jamBandsGroup = document.querySelector<SVGGElement>("#jam-bands")!;

const densityInput = document.querySelector<HTMLInputElement>("#density")!;
const densityValue = document.querySelector<HTMLOutputElement>("#density-value")!;
const delayInput = document.querySelector<HTMLInputElement>("#reaction-delay")!;
const delayValue = document.querySelector<HTMLOutputElement>("#reaction-delay-value")!;
const followingInput = document.querySelector<HTMLInputElement>("#following-distance")!;
const followingValue = document.querySelector<HTMLOutputElement>(
  "#following-distance-value",
)!;
const brakeStrengthInput = document.querySelector<HTMLInputElement>("#brake-strength")!;
const brakeStrengthValue = document.querySelector<HTMLOutputElement>(
  "#brake-strength-value",
)!;

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
    followingDistance: Number(followingInput.value),
    reactionDelay: Number(delayInput.value),
  };
}

let road: RoadState = createRoad(
  Number(densityInput.value),
  PARAMS.laneCount,
  PARAMS.trackLength,
  Number(followingInput.value),
);
let carElements: SVGCircleElement[][] = [];
let simulatedSeconds = 0;
let brakeTriggeredAt: number | null = null;

function rebuildCars(carsPerLane: number): void {
  carsGroup.replaceChildren();
  carElements = Array.from({ length: PARAMS.laneCount }, () =>
    Array.from({ length: carsPerLane }, () => {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", String(CAR_RADIUS));
      circle.setAttribute("class", "car");
      carsGroup.appendChild(circle);
      return circle;
    }),
  );
}

function speedState(fractionOfDesired: number): "green" | "blue" | "yellow" | "red" {
  if (fractionOfDesired >= 0.85) return "green";
  if (fractionOfDesired >= 0.6) return "blue";
  if (fractionOfDesired >= 0.3) return "yellow";
  return "red";
}

// A maximal run of consecutive (circularly) slow cars in one lane, as a
// [start, end] position range (end may exceed trackLength, meaning the run
// wraps past the seam — the renderer splits that into two rects). Car array
// order always matches physical order (no passing is ever possible — see
// step()'s MIN_GAP), so "consecutive index" is exactly "consecutive on the
// road".
function jamBandsForLane(
  speeds: number[],
  positions: number[],
  trackLength: number,
): Array<{ start: number; end: number }> {
  const n = speeds.length;
  const threshold = PARAMS.desiredSpeed * SLOW_FRACTION;
  const slow = speeds.map((s) => s < threshold);
  if (slow.every((s) => !s)) return [];
  if (slow.every((s) => s)) return [{ start: 0, end: trackLength }];

  const startIdx = slow.findIndex((s) => !s);
  const bands: Array<{ start: number; end: number }> = [];
  let i = (startIdx + 1) % n;
  let seen = 0;
  while (seen < n) {
    if (slow[i]) {
      const runStart = i;
      let runEnd = i;
      while (slow[i] && seen < n) {
        runEnd = i;
        i = (i + 1) % n;
        seen++;
      }
      const startPos = positions[runStart];
      const endPos = positions[runEnd];
      bands.push({
        start: startPos,
        end: endPos >= startPos ? endPos : endPos + trackLength,
      });
    } else {
      i = (i + 1) % n;
      seen++;
    }
  }
  return bands;
}

function renderJamBands(): void {
  jamBandsGroup.replaceChildren();
  road.lanes.forEach((lane, laneIndex) => {
    const speeds = lane.cars.map((c) => c.speed);
    const positions = lane.cars.map((c) => c.position);
    const bands = jamBandsForLane(speeds, positions, road.trackLength);
    for (const band of bands) {
      const pieces =
        band.end > road.trackLength
          ? [
              { start: band.start, end: road.trackLength },
              { start: 0, end: band.end - road.trackLength },
            ]
          : [band];
      for (const piece of pieces) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("class", "jam-band");
        rect.setAttribute("x", (piece.start * PX_PER_UNIT).toFixed(1));
        rect.setAttribute(
          "width",
          Math.max(2, (piece.end - piece.start) * PX_PER_UNIT).toFixed(1),
        );
        rect.setAttribute("y", String(LANE_Y[laneIndex]));
        rect.setAttribute("height", String(LANE_HEIGHT));
        jamBandsGroup.appendChild(rect);
      }
    }
  });
}

function render(): void {
  road.lanes.forEach((lane, laneIndex) => {
    lane.cars.forEach((car, carIndex) => {
      const el = carElements[laneIndex][carIndex];
      const x = car.position * PX_PER_UNIT;
      const y = LANE_Y[laneIndex] + LANE_HEIGHT / 2;
      el.setAttribute("cx", x.toFixed(1));
      el.setAttribute("cy", String(y));
      el.dataset.state = speedState(car.speed / PARAMS.desiredSpeed);
      el.classList.toggle("braking", car.brakeFlash > 0);
    });
  });
  renderJamBands();

  const { mean } = speedStats(road);
  const intensity = jamIntensity(road);
  meanSpeedEl.textContent = mean.toFixed(2);
  ghostWaveEl.textContent = `${Math.round(intensity * 100)}%`;
  stoppedCarsEl.textContent = String(nearStoppedCount(road));

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
    Number(followingInput.value),
  );
  rebuildCars(carsPerLane);
  simulatedSeconds = 0;
  brakeTriggeredAt = null;
  render();
  scheduleStabilityProbe();
}

function triggerBrake(): void {
  road = applyBrake(road, BRAKE_LANE, BRAKE_CAR, Number(brakeStrengthInput.value));
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
delayInput.addEventListener("input", () => {
  delayValue.textContent = Number(delayInput.value).toFixed(1);
  scheduleStabilityProbe();
});
followingInput.addEventListener("input", () => {
  followingValue.textContent = followingInput.value;
  scheduleStabilityProbe();
});
brakeStrengthInput.addEventListener("input", () => {
  brakeStrengthValue.textContent = Number(brakeStrengthInput.value).toFixed(2);
});
triggerBrakeButton.addEventListener("click", triggerBrake);
resetButton.addEventListener("click", resetSimulation);

rebuildCars(Number(densityInput.value));
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
