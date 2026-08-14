// Demo A: Ring road — cars looping a closed circular track, no start or end.
// This is what makes "no bottleneck, no intersection, still a jam" visually
// obvious: there is nothing on the page a jam could be blamed on except the
// cars themselves. Reads the same RoadState and reuses the same vehicle
// markup and vehicleSpeedState() colour scale as straightRoadView.ts (see
// viewShared.ts) — this is a second renderer for one shared simulation, not
// a second simulation. Unlike the straight road, "forward" rotates as a car
// goes around the ring, so each vehicle is rotated to face tangent to its
// direction of travel (see ringPoint in viewShared.ts) — that's what gives
// this view a visible sense of direction, not just position. A translucent
// green "traffic snake" band (renderRingCometBands, see viewShared.ts) marks
// any jammed stretch, following the ring's circumference.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import {
  MIN_RENDER_GAP,
  SLOW_FRACTION,
  buildVehicle,
  declutterCircularPositions,
  renderRingCometBands,
  ringPoint,
  vehicleSpeedState,
} from "./viewShared";

// Must match the <circle class="ring-track"> geometry drawn in index.html —
// the vehicles ride the middle of that track, not a value computed from it,
// since the track itself is static markup, not generated here.
export const RING_CENTER = { x: 150, y: 150 };
export const RING_RADIUS = 110;
// The ring track spans radius 90-130 (see index.html); the jam overlay's
// half-width is slightly inside that so it never bleeds past the track edge.
const RING_JAM_HALF_WIDTH = 18;

export interface RingRoadView {
  rebuildVehicles(carsPerLane: number): void;
  render(road: RoadState, referenceSpeed: number): void;
}

export function createRingRoadView(root: ParentNode): RingRoadView {
  const vehiclesGroup = root.querySelector<SVGGElement>("#ring-vehicles")!;
  const jamBandsGroup = root.querySelector<SVGGElement>("#ring-jam-bands")!;
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
      // Rendered-only positions: the true simulated positions, nudged apart
      // just enough that no two adjacent cars are drawn overlapping (see
      // declutterCircularPositions in viewShared.ts) — a real jam can pack
      // the true positions far closer than any visible car body.
      const renderPositions = declutterCircularPositions(
        lane.cars.map((c) => c.position),
        road.trackLength,
        MIN_RENDER_GAP,
        anchorHints[laneIndex],
      );
      lane.cars.forEach((car, carIndex) => {
        const g = vehicleElements[laneIndex][carIndex];
        const { x, y, rotateDeg } = ringPoint(
          renderPositions[carIndex],
          road.trackLength,
          RING_CENTER.x,
          RING_CENTER.y,
          RING_RADIUS,
        );
        g.setAttribute(
          "transform",
          `translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rotateDeg.toFixed(1)})`,
        );
        g.dataset.state = vehicleSpeedState(car.speed / referenceSpeed);
        g.classList.toggle("braking", car.brakeFlash > 0);
      });
    });
    renderRingCometBands(
      jamBandsGroup,
      road,
      referenceSpeed,
      SLOW_FRACTION,
      RING_CENTER.x,
      RING_CENTER.y,
      RING_RADIUS,
      RING_JAM_HALF_WIDTH,
    );
  }

  return { rebuildVehicles, render };
}
