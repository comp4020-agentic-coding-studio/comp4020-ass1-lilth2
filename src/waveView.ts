// The original abstract visualisation: one <circle> per car, colour-coded by
// speed, plus red jam-band overlays. Moved verbatim out of main.ts (no logic
// changes) when the Real road view was added alongside it — see PROCESS.md.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import { LANE_HEIGHT, LANE_Y, PX_PER_UNIT, speedState } from "./viewShared";

const SVG_NS = "http://www.w3.org/2000/svg";
const CAR_RADIUS = 6;
const SLOW_FRACTION = 0.6; // below this fraction of desired speed, a car counts as part of a jam band

export interface WaveView {
  rebuildCars(carsPerLane: number): void;
  render(road: RoadState): void;
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

export function createWaveView(root: ParentNode): WaveView {
  const carsGroup = root.querySelector<SVGGElement>("#wave-cars")!;
  const jamBandsGroup = root.querySelector<SVGGElement>("#jam-bands")!;
  let carElements: SVGCircleElement[][] = [];

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

  function renderJamBands(road: RoadState): void {
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

  function render(road: RoadState): void {
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
    renderJamBands(road);
  }

  return { rebuildCars, render };
}
