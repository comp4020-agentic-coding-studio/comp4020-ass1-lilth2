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

// The Wave view's 4-state colour scale — unchanged, kept only for the
// abstract dots-on-a-strip view (see CLAUDE.md: the Wave view was
// deliberately left in its original style when Ring road/Straight road were
// redesigned to match the reference video, so it still needs its own,
// finer-grained scale).
export function speedState(fractionOfDesired: number): "green" | "blue" | "yellow" | "red" {
  if (fractionOfDesired >= 0.85) return "green";
  if (fractionOfDesired >= 0.6) return "blue";
  if (fractionOfDesired >= 0.3) return "yellow";
  return "red";
}

// Ring road's and Straight road's colour scale: a 3-state dark-blue →
// muted-blue → red gradient, matching the reference video's cars (see
// PROCESS.md). Deliberately coarser than the Wave view's 4-state scale above
// — the two views are no longer required to share a palette, only to share
// it with *each other*.
export function vehicleSpeedState(fractionOfDesired: number): "moving" | "slowing" | "stopped" {
  if (fractionOfDesired >= SLOW_FRACTION) return "moving";
  if (fractionOfDesired >= 0.15) return "slowing";
  return "stopped";
}

const SVG_NS = "http://www.w3.org/2000/svg";
// Sized to fit the *tighter* of the two renderers' own position→pixel scales
// (the Ring road view's, since its circular track has fewer px per
// position-unit than the Straight road view's full-width strip — see
// MIN_RENDER_GAP below) without overlapping even in the worst-case packed
// state declutterCircularPositions() below is asked to resolve. Everything
// inside buildVehicle() below is expressed as a fraction of these two
// constants (not hardcoded pixels), so the sedan's proportions hold if they
// ever change again.
export const VEHICLE_LENGTH = 12; // px along the direction of travel
export const VEHICLE_WIDTH = 8; // px across the lane
// Below this fraction of desired speed, a car counts as part of a jam band —
// shared by the Wave view's and the Straight/Ring road's jam-overlay
// geometry, and by vehicleSpeedState()'s "moving" cutoff above.
export const SLOW_FRACTION = 0.6;

function windowRect(x: number, width: number, inset: number): SVGRectElement {
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("class", "vehicle-window");
  r.setAttribute("x", String(x));
  r.setAttribute("y", String(-VEHICLE_WIDTH / 2 + inset));
  r.setAttribute("width", String(width));
  r.setAttribute("height", String(VEHICLE_WIDTH - inset * 2));
  r.setAttribute("rx", "1");
  return r;
}

function mirror(x: number, y: number, width: number, height: number): SVGRectElement {
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("class", "vehicle-mirror");
  r.setAttribute("x", String(x));
  r.setAttribute("y", String(y - height / 2));
  r.setAttribute("width", String(width));
  r.setAttribute("height", String(height));
  return r;
}

// One cartoon car: a single rounded-rect body with a windshield band and a
// smaller rear-window band (no separate headlight/taillight dots), matching
// the reference video's top-down sedan silhouette — one uniform shape, drawn
// pointing along local +x with the front at +x/2 (see PROCESS.md for the
// redesign this replaced). Both the Straight road view (translate only) and
// the Ring road view (translate + rotate to face the direction of travel)
// place this same markup — that's what guarantees their colour rules can
// never diverge from each other. Every offset below is a fraction of
// VEHICLE_LENGTH/VEHICLE_WIDTH (matched to the original 26×18 sedan's
// proportions) rather than a hardcoded pixel, so shrinking those two
// constants (see PROCESS.md — done to stop rendered cars overlapping during
// a real jam) rescales the whole car instead of distorting its detail.
export function buildVehicle(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "vehicle");

  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("class", "vehicle-body");
  body.setAttribute("x", String(-VEHICLE_LENGTH / 2));
  body.setAttribute("y", String(-VEHICLE_WIDTH / 2));
  body.setAttribute("width", String(VEHICLE_LENGTH));
  body.setAttribute("height", String(VEHICLE_WIDTH));
  body.setAttribute("rx", String((4 / 18) * VEHICLE_WIDTH));

  const mirrorX = VEHICLE_LENGTH / 2 - (8 / 26) * VEHICLE_LENGTH;
  const mirrorOffset = VEHICLE_WIDTH / 2;

  g.append(
    body,
    // windshield, toward the front
    windowRect((-1 / 26) * VEHICLE_LENGTH, (9 / 26) * VEHICLE_LENGTH, (2.5 / 18) * VEHICLE_WIDTH),
    // smaller rear window
    windowRect((-10 / 26) * VEHICLE_LENGTH, (5 / 26) * VEHICLE_LENGTH, (3.5 / 18) * VEHICLE_WIDTH),
    mirror(mirrorX, -mirrorOffset, (2.5 / 18) * VEHICLE_WIDTH, (2 / 18) * VEHICLE_WIDTH),
    mirror(mirrorX, mirrorOffset, (2.5 / 18) * VEHICLE_WIDTH, (2 / 18) * VEHICLE_WIDTH),
  );
  return g;
}

// The smallest position-unit gap declutterCircularPositions() below will ever
// enforce between two rendered (adjacent, circularly) vehicles. Sized against
// the Ring road view's own scale — the tighter of the two renderers' — 110
// (RING_RADIUS in ringRoadView.ts) px of track radius means
// 2π·110/200 ≈ 3.456 px per position-unit there, vs. 900/200 = 4.5 on the
// Straight road view; the same unit-gap always renders with *more* pixel
// margin on the looser Straight road scale, so sizing against the Ring road
// view covers both. At VEHICLE_LENGTH=12px that's 12/3.456 ≈ 3.47 units of
// gap needed just to stop the bodies touching; 4 leaves a visible sliver of
// daylight even between two cars pushed to the minimum. This is a floor on
// carsPerLane, not just a constant: declutterCircularPositions() can only
// satisfy every adjacent pair at once when
// carsPerLane * MIN_RENDER_GAP <= trackLength — true with room to spare at
// this app's max density (40 * 4 = 160 <= 200) — see PROCESS.md for the probe
// that picked these numbers.
export const MIN_RENDER_GAP = 4;

// Nudges a lane's true simulated positions apart, for rendering only, so no
// two adjacent (circularly) vehicles are ever drawn closer than
// MIN_RENDER_GAP position-units — without this, a real, sustained jam drives
// the model's true gap toward step()'s MIN_GAP (an epsilon-scale numerical
// floor with no notion of vehicle length; see traffic.ts), which reads as
// cars crashing into each other rather than a tightly-packed queue (see
// PROCESS.md for the bug report and the probe showing the true gap converges
// to ~0.001 units and stays there indefinitely once a jam is fully formed).
// Car array order always matches physical order (no passing is ever
// possible), so a single forward sweep suffices — but which car it starts
// from matters: starting at the single largest true gap (the road's roomiest
// open stretch) guarantees the sweep never needs more slack than the loop
// actually has, however unevenly a real jam has bunched the rest of the cars
// (an arbitrary starting point, e.g. always car 0, can fail this even when
// carsPerLane * minGap <= trackLength, if the jam happens to straddle car 0).
//
// `anchorHint`, if passed, is a caller-owned ref the sweep's start car index
// is read from and written back to every call — this is what stops the
// entire rendered lane from jumping en masse (see PROCESS.md, bug report:
// "每次车驶出拥堵状态时 整个处于拥堵状态的车流会整体前移"). Once a jam
// saturates (see traffic.ts's tanh saturation), every gap converges to
// nearly the same value, so re-picking "the single largest gap" fresh every
// frame is numerically unstable: whichever gap is *currently* larger by a
// hair of floating-point noise flips at random, snapping the sweep's anchor
// to a different physical car and shifting every rendered position by a full
// lap-offset at once (a probe reproduced ~59-unit jumps at density 40, ~208s
// after a brake, with every gap within 0.02 units of the next).
//
// A margin-based hysteresis (only switch if some other gap beats the current
// anchor's gap by more than a fixed margin) was tried and rejected: gaps
// drift continuously as a jam evolves, so any fixed margin eventually gets
// crossed legitimately, and the underlying instability (comparing two noisy
// values to decide which is "larger") is still there right up to the
// threshold. What actually matters is not whether some other gap is
// currently a hair bigger, but whether the current anchor's own gap is still
// good enough to serve as one — so the sweep instead keeps the previous
// anchor as long as its gap stays at or above ANCHOR_STICKY_FLOOR, an
// absolute threshold well clear of the noise floor, and only falls back to
// the true global-max gap once the anchor has genuinely degraded past it.
// That decouples "should I switch" from noisy pairwise comparisons entirely.
// A probe sweeping this against the app's live density range confirmed zero
// anchor jumps at the app's default density (25) over a 300s run, with no
// regression to the (separate, pre-existing) minGap edge case at extreme
// density (40) sustained past 250s.
//
// Returns positions in the same order as the input (by original car index),
// mod trackLength — never touches RoadState/step(), so the simulation and
// every existing test against it are unaffected.
const ANCHOR_STICKY_FLOOR = MIN_RENDER_GAP * 2;

export function declutterCircularPositions(
  rawPositions: number[],
  trackLength: number,
  minGap: number,
  anchorHint?: { index: number },
): number[] {
  const n = rawPositions.length;
  if (n <= 1) return rawPositions.slice();

  const gapAfter = (i: number): number => {
    const next = (i + 1) % n;
    let gap = rawPositions[next] - rawPositions[i];
    if (gap < 0) gap += trackLength;
    return gap;
  };

  let maxGap = -Infinity;
  let cutAfter = 0;
  for (let i = 0; i < n; i++) {
    const gap = gapAfter(i);
    if (gap > maxGap) {
      maxGap = gap;
      cutAfter = i;
    }
  }

  const hintIndex = anchorHint?.index;
  if (
    hintIndex !== undefined &&
    hintIndex >= 0 &&
    hintIndex < n &&
    gapAfter(hintIndex) >= ANCHOR_STICKY_FLOOR
  ) {
    cutAfter = hintIndex;
  }
  if (anchorHint) anchorHint.index = cutAfter;

  const start = (cutAfter + 1) % n;
  const order = Array.from({ length: n }, (_, k) => (start + k) % n);

  const unwrapped: number[] = [rawPositions[order[0]]];
  for (let k = 1; k < n; k++) {
    let p = rawPositions[order[k]];
    while (p < unwrapped[k - 1]) p += trackLength;
    unwrapped.push(p);
  }
  const adjusted: number[] = [unwrapped[0]];
  for (let k = 1; k < n; k++) {
    adjusted.push(Math.max(unwrapped[k], adjusted[k - 1] + minGap));
  }

  const result: number[] = Array.from({ length: n });
  for (let k = 0; k < n; k++) {
    result[order[k]] = ((adjusted[k] % trackLength) + trackLength) % trackLength;
  }
  return result;
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

// Fraction of a comet band's length spent ramping its half-width up from a
// point at the tail to the full width, which it then holds until the head —
// see buildCometPath below.
const COMET_TAPER_FRACTION = 0.35;
const COMET_SAMPLES = 24;

function cometHalfWidth(t: number, maxHalfWidth: number): number {
  if (t <= COMET_TAPER_FRACTION) return (t / COMET_TAPER_FRACTION) * maxHalfWidth;
  return maxHalfWidth;
}

// Builds a closed SVG path for a "traffic snake" band: a point at t=0 (the
// tail — the upstream edge of a jam, where the wave is currently eating into
// fresh traffic) widening to a blunt head at t=1 (the front of the jam, where
// the original brake happened) — the tapered, comet-like shape the reference
// video uses to show a jam sweeping backward through traffic, in place of a
// plain rectangle. `centerAt`/`normalAt` parameterise the band's centreline
// and its local across-the-road direction, so the same shape works for a
// straight line (Straight road) and an arc (Ring road) alike.
function buildCometPath(
  centerAt: (t: number) => { x: number; y: number },
  normalAt: (t: number) => { nx: number; ny: number },
  maxHalfWidth: number,
): string {
  const outer: Array<{ x: number; y: number }> = [];
  const inner: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= COMET_SAMPLES; i++) {
    const t = i / COMET_SAMPLES;
    const c = centerAt(t);
    const n = normalAt(t);
    const hw = cometHalfWidth(t, maxHalfWidth);
    outer.push({ x: c.x + n.nx * hw, y: c.y + n.ny * hw });
    inner.push({ x: c.x - n.nx * hw, y: c.y - n.ny * hw });
  }
  const parts: string[] = [`M ${outer[0].x.toFixed(1)} ${outer[0].y.toFixed(1)}`];
  for (let i = 1; i < outer.length; i++) {
    parts.push(`L ${outer[i].x.toFixed(1)} ${outer[i].y.toFixed(1)}`);
  }
  for (let i = inner.length - 1; i >= 0; i--) {
    parts.push(`L ${inner[i].x.toFixed(1)} ${inner[i].y.toFixed(1)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

// Renders the Straight road view's jam overlay as translucent-green comet
// bands (`.jam-comet`) instead of the Wave view's red rects — see
// buildCometPath above and PROCESS.md for why the two views now diverge in
// jam-band style. A band that wraps past the strip's seam is split into two
// independently-tapered pieces, same as renderLinearJamBands does for rects;
// this loses tail/head continuity exactly at the seam, an acceptable
// trade-off since that's a rare edge case, not the common path.
export function renderLinearCometBands(
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
    const y = LANE_Y[laneIndex] + LANE_HEIGHT / 2;
    const maxHalfWidth = LANE_HEIGHT / 2;
    for (const band of bands) {
      const pieces =
        band.end > road.trackLength
          ? [
              { start: band.start, end: road.trackLength },
              { start: 0, end: band.end - road.trackLength },
            ]
          : [band];
      for (const piece of pieces) {
        if (piece.end <= piece.start) continue;
        const x0 = piece.start * PX_PER_UNIT;
        const x1 = piece.end * PX_PER_UNIT;
        const d = buildCometPath(
          (t) => ({ x: x0 + (x1 - x0) * t, y }),
          () => ({ nx: 0, ny: 1 }),
          maxHalfWidth,
        );
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "jam-comet");
        path.setAttribute("d", d);
        group.appendChild(path);
      }
    }
  });
}

// Renders the Ring road view's jam overlay as translucent-green comet bands
// following the ring's circumference — new functionality, not a restyle: the
// Ring road view previously had no jam indicator of its own (see CLAUDE.md's
// former reasoning for that). Unlike the linear version, no seam-splitting is
// needed: a band's position can run past `trackLength` and the angle formula
// below is periodic, so it wraps correctly on its own.
export function renderRingCometBands(
  group: SVGGElement,
  road: RoadState,
  referenceSpeed: number,
  slowFraction: number,
  cx: number,
  cy: number,
  radius: number,
  maxHalfWidth: number,
): void {
  group.replaceChildren();
  road.lanes.forEach((lane) => {
    const speeds = lane.cars.map((c) => c.speed);
    const positions = lane.cars.map((c) => c.position);
    const bands = jamBandsForLane(speeds, positions, road.trackLength, referenceSpeed, slowFraction);
    for (const band of bands) {
      const angleAt = (t: number) => {
        const pos = band.start + (band.end - band.start) * t;
        return ((pos / road.trackLength) * 360 - 90) * (Math.PI / 180);
      };
      const d = buildCometPath(
        (t) => {
          const rad = angleAt(t);
          return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
        },
        (t) => {
          const rad = angleAt(t);
          return { nx: Math.cos(rad), ny: Math.sin(rad) };
        },
        maxHalfWidth,
      );
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", "jam-comet");
      path.setAttribute("d", d);
      group.appendChild(path);
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
