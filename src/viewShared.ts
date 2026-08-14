// Coordinate mapping, colour scale, and car/jam-band markup shared by every
// renderer (Ring road view, Straight road view, Wave view) — defined once so
// none of them can drift out of sync with each other or with the underlying
// RoadState. No renderer owns this; all three read it.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";

export const VIEW_WIDTH = 900;
export const PX_PER_UNIT = VIEW_WIDTH / PARAMS.trackLength;
// A single lane filling the road surface (10-250 in the 0-260 viewBox) with
// the same 10px margin the old three-lane layout left at each shoulder.
export const LANE_Y = [20];
export const LANE_HEIGHT = 220;

export function speedState(fractionOfDesired: number): "green" | "blue" | "yellow" | "red" {
  if (fractionOfDesired >= 0.85) return "green";
  if (fractionOfDesired >= 0.6) return "blue";
  if (fractionOfDesired >= 0.3) return "yellow";
  return "red";
}

const SVG_NS = "http://www.w3.org/2000/svg";
export const VEHICLE_LENGTH = 26; // px along the direction of travel
export const VEHICLE_WIDTH = 18; // px across the lane
// Below this fraction of desired speed, a car counts as part of a jam band —
// shared by the Wave view and the Straight road view's jam-band overlays.
export const SLOW_FRACTION = 0.6;

function lightCircle(cx: number, cy: number, cls: string): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("class", cls);
  c.setAttribute("cx", String(cx));
  c.setAttribute("cy", String(cy));
  c.setAttribute("r", "1.6");
  return c;
}

// One cartoon car: a rounded-rect body, windshield, headlights and
// brake-reacting taillights, drawn pointing along local +x with the front at
// +x/2. Both the Straight road view (translate only) and the Ring road view
// (translate + rotate to face the direction of travel) place this same
// markup — that's what guarantees their colour/brake-light rules can never
// diverge from each other.
export function buildVehicle(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "vehicle");

  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("class", "vehicle-body");
  body.setAttribute("x", String(-VEHICLE_LENGTH / 2));
  body.setAttribute("y", String(-VEHICLE_WIDTH / 2));
  body.setAttribute("width", String(VEHICLE_LENGTH));
  body.setAttribute("height", String(VEHICLE_WIDTH));
  body.setAttribute("rx", "4");

  const windshield = document.createElementNS(SVG_NS, "rect");
  windshield.setAttribute("class", "vehicle-windshield");
  windshield.setAttribute("x", "-3");
  windshield.setAttribute("y", String(-VEHICLE_WIDTH / 2 + 2));
  windshield.setAttribute("width", "8");
  windshield.setAttribute("height", String(VEHICLE_WIDTH - 4));

  const front = VEHICLE_LENGTH / 2 - 2;
  const rear = -front;
  const lightOffset = VEHICLE_WIDTH / 2 - 3;

  g.append(
    body,
    windshield,
    lightCircle(front, -lightOffset, "vehicle-headlight"),
    lightCircle(front, lightOffset, "vehicle-headlight"),
    lightCircle(rear, -lightOffset, "vehicle-taillight"),
    lightCircle(rear, lightOffset, "vehicle-taillight"),
  );
  return g;
}

// A maximal run of consecutive (circularly) slow cars in one lane, as a
// [start, end] position range (end may exceed trackLength, meaning the run
// wraps past the seam — the renderer splits that into two rects). Car array
// order always matches physical order (no passing is ever possible — see
// step()'s MIN_GAP), so "consecutive index" is exactly "consecutive on the
// road". `referenceSpeed` is this density/spacing's own equilibrium speed
// (see traffic.ts), not a fixed constant — a lane sitting untouched at a
// naturally-slow high-density equilibrium must never read as a jam band.
export function jamBandsForLane(
  speeds: number[],
  positions: number[],
  trackLength: number,
  referenceSpeed: number,
  slowFraction: number,
): Array<{ start: number; end: number }> {
  const n = speeds.length;
  const threshold = referenceSpeed * slowFraction;
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

// Renders the jam-band rects for every lane of a linear (Straight road /
// Wave) view into `group`, splitting any band that wraps past the seam into
// two rects. Shared so the Straight road view's bands and the Wave view's
// bands are computed and drawn identically.
export function renderLinearJamBands(
  group: SVGGElement,
  road: RoadState,
  referenceSpeed: number,
  slowFraction: number,
): void {
  group.replaceChildren();
  road.lanes.forEach((lane, laneIndex) => {
    const speeds = lane.cars.map((c) => c.speed);
    const positions = lane.cars.map((c) => c.position);
    const bands = jamBandsForLane(speeds, positions, road.trackLength, referenceSpeed, slowFraction);
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
        group.appendChild(rect);
      }
    }
  });
}

// Maps a car's position on the (single-lane) ring to a point on a circular
// track of the given centre/radius, plus the rotation (degrees) that makes a
// vehicle drawn pointing along local +x face tangent to the direction of
// travel at that point. Position 0 is placed at the top of the circle,
// travelling clockwise as position increases — this is what gives Ring road
// cars a visible facing direction (spec requirement), not just a position.
export function ringPoint(
  position: number,
  trackLength: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; rotateDeg: number } {
  const thetaDeg = (position / trackLength) * 360 - 90;
  const thetaRad = (thetaDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(thetaRad),
    y: cy + radius * Math.sin(thetaRad),
    rotateDeg: thetaDeg + 90,
  };
}
