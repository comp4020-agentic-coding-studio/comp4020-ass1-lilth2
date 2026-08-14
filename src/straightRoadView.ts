// Demo B: Straight road — the skeuomorphic top-down visualisation, cars in a
// line. Reads the same RoadState and the same coordinate mapping as
// ringRoadView.ts and waveView.ts (see viewShared.ts) — this is a third
// renderer for one shared simulation, not a second simulation. Every car
// moves in the +x direction (see traffic.ts), so a brake near the front
// ripples backward through the following cars exactly the way the spec's
// "the wave travels backward" framing describes — no rotation is needed
// here, unlike ringRoadView.ts, because "forward" is already a fixed screen
// direction on a straight road.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import {
  LANE_HEIGHT,
  LANE_Y,
  MIN_RENDER_GAP,
  PX_PER_UNIT,
  SLOW_FRACTION,
  buildVehicle,
  declutterCircularPositions,
  renderLinearCometBands,
  vehicleSpeedState,
} from "./viewShared";

export interface StraightRoadView {
  rebuildVehicles(carsPerLane: number): void;
  render(road: RoadState, referenceSpeed: number): void;
}

export function createStraightRoadView(root: ParentNode): StraightRoadView {
  const vehiclesGroup = root.querySelector<SVGGElement>("#straight-vehicles")!;
  const jamBandsGroup = root.querySelector<SVGGElement>("#straight-jam-bands")!;
  let vehicleElements: SVGGElement[][] = [];
  // Per-lane sticky anchor for declutterCircularPositions — see the
  // ANCHOR_STICKY_FLOOR comment in viewShared.ts. Reset alongside the
  // vehicle sprites themselves, since a rebuild means the car count (and
  // thus what index anchorHints[lane].index refers to) may have changed.
  let anchorHints: Array<{ index: number }> = [];

  function rebuildVehicles(carsPerLane: number): void {
    vehiclesGroup.replaceChildren();
    vehicleElements = Array.from({ length: PARAMS.laneCount }, () =>
      Array.from({ length: carsPerLane }, () => {
        const g = buildVehicle();
        vehiclesGroup.appendChild(g);
        return g;
      }),
    );
    anchorHints = Array.from({ length: PARAMS.laneCount }, () => ({ index: -1 }));
  }

  function render(road: RoadState, referenceSpeed: number): void {
    road.lanes.forEach((lane, laneIndex) => {
      // Rendered-only positions: see the matching comment in
      // ringRoadView.ts — the same declutter, so the two demo modes never
      // disagree about whether a jam looks like overlapping cars.
      const renderPositions = declutterCircularPositions(
        lane.cars.map((c) => c.position),
        road.trackLength,
        MIN_RENDER_GAP,
        anchorHints[laneIndex],
      );
      lane.cars.forEach((car, carIndex) => {
        const g = vehicleElements[laneIndex][carIndex];
        const x = renderPositions[carIndex] * PX_PER_UNIT;
        const y = LANE_Y[laneIndex] + LANE_HEIGHT / 2;
        g.setAttribute("transform", `translate(${x.toFixed(1)}, ${y})`);
        g.dataset.state = vehicleSpeedState(car.speed / referenceSpeed);
        g.classList.toggle("braking", car.brakeFlash > 0);
      });
    });
    renderLinearCometBands(jamBandsGroup, road, referenceSpeed, SLOW_FRACTION);
  }

  return { rebuildVehicles, render };
}
