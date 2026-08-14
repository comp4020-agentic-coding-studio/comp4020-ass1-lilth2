// The original abstract visualisation: one <circle> per car, colour-coded by
// speed, plus red jam-band overlays. Kept alongside the Ring road and
// Straight road views as a shared auxiliary layer — see CLAUDE.md for why.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import {
  LANE_HEIGHT,
  LANE_Y,
  PX_PER_UNIT,
  SLOW_FRACTION,
  renderLinearJamBands,
  speedState,
} from "./viewShared";

const SVG_NS = "http://www.w3.org/2000/svg";
const CAR_RADIUS = 6;

export interface WaveView {
  rebuildCars(carsPerLane: number): void;
  render(road: RoadState, referenceSpeed: number): void;
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

  function render(road: RoadState, referenceSpeed: number): void {
    road.lanes.forEach((lane, laneIndex) => {
      lane.cars.forEach((car, carIndex) => {
        const el = carElements[laneIndex][carIndex];
        const x = car.position * PX_PER_UNIT;
        const y = LANE_Y[laneIndex] + LANE_HEIGHT / 2;
        el.setAttribute("cx", x.toFixed(1));
        el.setAttribute("cy", String(y));
        el.dataset.state = speedState(car.speed / referenceSpeed);
        el.classList.toggle("braking", car.brakeFlash > 0);
      });
    });
    renderLinearJamBands(jamBandsGroup, road, referenceSpeed, SLOW_FRACTION);
  }

  return { rebuildCars, render };
}
