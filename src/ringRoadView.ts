// Demo A: Ring road — cars looping a closed circular track, no start or end.
// This is what makes "no bottleneck, no intersection, still a jam" visually
// obvious: there is nothing on the page a jam could be blamed on except the
// cars themselves. Reads the same RoadState and reuses the same vehicle
// markup and speedState() colour scale as straightRoadView.ts (see
// viewShared.ts) — this is a second renderer for one shared simulation, not
// a second simulation. Unlike the straight road, "forward" rotates as a car
// goes around the ring, so each vehicle is rotated to face tangent to its
// direction of travel (see ringPoint in viewShared.ts) — that's what gives
// this view a visible sense of direction, not just position.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import { buildVehicle, ringPoint, speedState } from "./viewShared";

// Must match the <circle class="ring-track"> geometry drawn in index.html —
// the vehicles ride the middle of that track, not a value computed from it,
// since the track itself is static markup, not generated here.
export const RING_CENTER = { x: 150, y: 150 };
export const RING_RADIUS = 110;

export interface RingRoadView {
  rebuildVehicles(carsPerLane: number): void;
  render(road: RoadState, referenceSpeed: number): void;
}

export function createRingRoadView(root: ParentNode): RingRoadView {
  const vehiclesGroup = root.querySelector<SVGGElement>("#ring-vehicles")!;
  let vehicleElements: SVGGElement[][] = [];

  function rebuildVehicles(carsPerLane: number): void {
    vehiclesGroup.replaceChildren();
    vehicleElements = Array.from({ length: PARAMS.laneCount }, () =>
      Array.from({ length: carsPerLane }, () => {
        const g = buildVehicle();
        vehiclesGroup.appendChild(g);
        return g;
      }),
    );
  }

  function render(road: RoadState, referenceSpeed: number): void {
    road.lanes.forEach((lane, laneIndex) => {
      lane.cars.forEach((car, carIndex) => {
        const g = vehicleElements[laneIndex][carIndex];
        const { x, y, rotateDeg } = ringPoint(
          car.position,
          road.trackLength,
          RING_CENTER.x,
          RING_CENTER.y,
          RING_RADIUS,
        );
        g.setAttribute(
          "transform",
          `translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rotateDeg.toFixed(1)})`,
        );
        g.dataset.state = speedState(car.speed / referenceSpeed);
        g.classList.toggle("braking", car.brakeFlash > 0);
      });
    });
  }

  return { rebuildVehicles, render };
}
