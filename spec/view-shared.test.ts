import { describe, expect, it } from "vitest";
import { applyBrake, createRoad, PARAMS, step } from "../src/traffic";
import type { SimParams } from "../src/traffic";
import { MIN_RENDER_GAP, declutterCircularPositions } from "../src/viewShared";

// Bug report: "当trigger时 车子会有重叠" — after "Trigger small brake", vehicle
// sprites visually overlap during a real jam instead of reading as tightly
// packed congestion. A probe (throwaway `pnpm dlx tsx` script, deleted after
// use — see PROCESS.md) found the true simulated gap between adjacent cars
// converges to ~0.001 units (step()'s MIN_GAP, an epsilon with no notion of
// vehicle length) and stays there indefinitely once a jam fully forms —
// nowhere near enough room for any visible car body, regardless of how small
// it's drawn. declutterCircularPositions() is the render-only fix: these
// tests assert its actual output, not the renderers that call it, since it's
// pure and headless.
function gaps(positions: number[], trackLength: number): number[] {
  const n = positions.length;
  return positions.map((p, i) => {
    const next = positions[(i + 1) % n];
    let gap = next - p;
    if (gap < 0) gap += trackLength;
    return gap;
  });
}

describe("declutterCircularPositions", () => {
  it("leaves already-spread-out positions untouched (no unnecessary nudging)", () => {
    const trackLength = 200;
    const positions = Array.from({ length: 8 }, (_, i) => (i * trackLength) / 8);
    const result = declutterCircularPositions(positions, trackLength, MIN_RENDER_GAP);
    for (let i = 0; i < positions.length; i++) {
      expect(result[i]).toBeCloseTo(positions[i], 9);
    }
  });

  it("never leaves two adjacent rendered positions closer than minGap, even when every car starts bunched at one point", () => {
    // The worst case for a naive fixed-anchor sweep: every car packed at
    // (near) the same position, with all the slack in one big gap elsewhere.
    const trackLength = 200;
    const n = 40;
    const positions = Array.from({ length: n }, (_, i) => i * 1e-4);
    const result = declutterCircularPositions(positions, trackLength, MIN_RENDER_GAP);
    for (const g of gaps(result, trackLength)) {
      expect(g).toBeGreaterThanOrEqual(MIN_RENDER_GAP - 1e-9);
    }
  });

  it("never leaves two adjacent rendered positions closer than minGap when the jam straddles index 0 (the naive fixed-anchor failure case)", () => {
    // Two separate near-zero clusters, one of which wraps across the seam at
    // car index 0 — this is exactly the shape a fixed-anchor-at-0 sweep can
    // get wrong (see the comment on declutterCircularPositions).
    const trackLength = 12;
    const positions = [11.9, 0.1, 6, 6.05];
    const result = declutterCircularPositions(positions, trackLength, 2);
    for (const g of gaps(result, trackLength)) {
      expect(g).toBeGreaterThanOrEqual(2 - 1e-9);
    }
  });

  it("preserves the true positions' total span around the loop (sum of gaps still equals trackLength)", () => {
    const trackLength = 200;
    const positions = [0, 0.001, 0.002, 50, 50.1, 150];
    const result = declutterCircularPositions(positions, trackLength, MIN_RENDER_GAP);
    const total = gaps(result, trackLength).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(trackLength, 6);
  });

  it("resolves an actual brake-triggered jam's true positions at the app's max density (40) with no overlap left", () => {
    const density = 40;
    const params: SimParams = { followingDistance: 6, reactionDelay: 1.0 };
    let state = createRoad(density, 1, PARAMS.trackLength, params.followingDistance);
    state = applyBrake(state, 0, 0, 0.2);
    for (let i = 0; i < Math.round(150 / PARAMS.dt); i++) {
      state = step(state, PARAMS.dt, params);
    }
    const positions = state.lanes[0].cars.map((c) => c.position);
    // Confirm this really is a severely packed jam, not a no-op — otherwise
    // the assertion below would pass trivially.
    expect(Math.min(...gaps(positions, state.trackLength))).toBeLessThan(0.01);

    const result = declutterCircularPositions(positions, state.trackLength, MIN_RENDER_GAP);
    for (const g of gaps(result, state.trackLength)) {
      expect(g).toBeGreaterThanOrEqual(MIN_RENDER_GAP - 1e-9);
    }
  });

  // Bug report: "每次车驶出拥堵状态时 整个处于拥堵状态的车流会整体前移" — once
  // a jam saturates, every gap converges to nearly the same value, so
  // re-picking "the single largest gap" fresh every frame (no anchorHint)
  // flips at random between near-tied candidates, snapping the whole
  // rendered lane to a different lap-offset at once even though the true
  // simulated positions barely moved. Threading an anchorHint ref across
  // frames (as every real caller does — see ringRoadView.ts/
  // straightRoadView.ts) keeps the anchor sticky and cuts this way down.
  // This test drives a real, long-sustained max-density jam (the exact
  // regime a probe found the un-hinted anchor flip in) and counts how many
  // frames see any single car's rendered position snap by more than a
  // couple of car-lengths, with vs without the hint.
  //
  // At this app's actual default density (25) a probe found the fix
  // eliminates the jump entirely over a full 300s run. At the extreme edge
  // of density 40 sustained past 250s, one residual jump remains even with
  // the hint — a separate, deeper, pre-existing limitation of the
  // "single largest gap" sweep itself (a saturated jam can split into
  // multiple simultaneous tight clusters that one anchor gap can't always
  // absorb; see PROCESS.md), not something this fix claims to fully close.
  // So this test asserts the fix's real, validated effect — far fewer jump
  // frames than the un-hinted baseline — rather than a false "never jumps"
  // guarantee at this extreme, sustained-duration edge case.
  it("cuts anchor-jump frames way down in a sustained max-density jam when an anchorHint is threaded, vs recomputing the anchor fresh every frame", () => {
    const density = 40;
    const params: SimParams = { followingDistance: 6, reactionDelay: 1.0 };
    let state = createRoad(density, 1, PARAMS.trackLength, params.followingDistance);
    state = applyBrake(state, 0, 0, 0.2);

    // Same-car frame-to-frame displacement, on the circle (shortest distance)
    // rather than raw difference — a legitimate single-frame advance is at
    // most a couple of units, nowhere near a lap-offset snap.
    const circularDelta = (a: number, b: number, trackLength: number): number => {
      let d = Math.abs(a - b) % trackLength;
      return Math.min(d, trackLength - d);
    };
    const JUMP_THRESHOLD = 20;

    const hint = { index: -1 };
    let prevHinted = declutterCircularPositions(
      state.lanes[0].cars.map((c) => c.position),
      state.trackLength,
      MIN_RENDER_GAP,
      hint,
    );
    let prevFresh = prevHinted;
    let jumpFramesFresh = 0;
    let jumpFramesHinted = 0;

    for (let i = 0; i < Math.round(300 / PARAMS.dt); i++) {
      state = step(state, PARAMS.dt, params);
      const rawPositions = state.lanes[0].cars.map((c) => c.position);

      const fresh = declutterCircularPositions(rawPositions, state.trackLength, MIN_RENDER_GAP);
      const hinted = declutterCircularPositions(
        rawPositions,
        state.trackLength,
        MIN_RENDER_GAP,
        hint,
      );

      const jumped = (result: number[], prev: number[]): boolean =>
        result.some((p, c) => circularDelta(p, prev[c], state.trackLength) > JUMP_THRESHOLD);
      if (jumped(fresh, prevFresh)) jumpFramesFresh++;
      if (jumped(hinted, prevHinted)) jumpFramesHinted++;

      prevFresh = fresh;
      prevHinted = hinted;
    }

    // Confirms this scenario really does reproduce the reported bug when the
    // anchor is recomputed fresh every frame — otherwise the improvement
    // asserted below would be meaningless.
    expect(jumpFramesFresh).toBeGreaterThanOrEqual(3);
    // The hint should leave at most one residual jump (the separate,
    // pre-existing multi-cluster limitation noted above) — a clear,
    // substantial improvement over the un-hinted baseline.
    expect(jumpFramesHinted).toBeLessThanOrEqual(1);
    expect(jumpFramesHinted).toBeLessThan(jumpFramesFresh);
  });
});
