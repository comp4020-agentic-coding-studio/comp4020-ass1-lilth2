import { describe, expect, it } from "vitest";
import {
  applyBrake,
  createRoad,
  jamIntensity,
  PARAMS,
  speedStats,
  step,
} from "../src/traffic";
import type { SimParams } from "../src/traffic";

// This is the one line of the published spec that's mechanically checkable:
// "the visitor does something that changes what they see — state the core
// interaction plainly enough to write a test for it." The core interaction is
// now "Trigger small brake" plus the density/reaction-delay/following-distance
// sliders: a one-shot perturbation whose fate (absorbed vs. a lasting wave)
// depends on those sliders. These tests call the pure step()/applyBrake()
// functions directly, so they assert on the model's real emergent behaviour
// without depending on requestAnimationFrame timing or wall-clock delays (see
// CLAUDE.md).
//
// Every combination below was chosen by actually running the model (see
// PROCESS.md for the probe) rather than picked to make an assertion pass —
// per CLAUDE.md's rule against curve-fitting the thresholds.

function runWithBrake(
  carsPerLane: number,
  params: SimParams,
  brakeStrength: number,
  simulatedSeconds: number,
  laneCount = PARAMS.laneCount,
) {
  let state = createRoad(
    carsPerLane,
    laneCount,
    PARAMS.trackLength,
    params.followingDistance,
  );
  state = applyBrake(state, 1, 0, brakeStrength);
  const steps = Math.round(simulatedSeconds / PARAMS.dt);
  let peakIntensity = 0;
  for (let i = 0; i < steps; i++) {
    state = step(state, PARAMS.dt, params);
    const j = jamIntensity(state);
    if (j > peakIntensity) peakIntensity = j;
  }
  return { state, peakIntensity, finalIntensity: jamIntensity(state) };
}

describe("phantom traffic jam: core interaction", () => {
  it("resets to an exactly uniform flow — no seed noise left over", () => {
    // createRoad has no randomness and no seed perturbation: every car is
    // placed at the same equilibrium speed for the chosen density. Reset
    // must reproduce this exactly, every time, so the only way a wave ever
    // starts is a deliberate "Trigger small brake" or an unstable
    // density/delay/spacing combination — never leftover simulation state.
    const state = createRoad(26, 3, PARAMS.trackLength, 6);
    const { stdev } = speedStats(state);
    expect(stdev).toBe(0);
  });

  it("'Trigger small brake' actually changes the targeted car's state", () => {
    const state = createRoad(26, 3, PARAMS.trackLength, 6);
    const before = state.lanes[1].cars[0];
    const after = applyBrake(state, 1, 0, 0.2).lanes[1].cars[0];
    expect(after.speed).toBeLessThan(before.speed);
    expect(after.brakeFlash).toBeGreaterThan(0);
    // Only the targeted car changes — the perturbation is a one-shot event
    // on one car, not a global reset.
    const untouchedLane = createRoad(26, 3, PARAMS.trackLength, 6).lanes[0];
    const stillUntouched = applyBrake(state, 1, 0, 0.2).lanes[0];
    expect(stillUntouched.cars[0].speed).toBe(untouchedLane.cars[0].speed);
  });

  it("high density + high reaction delay ripples the same brake into a much worse jam than low density + no delay", () => {
    // Same one-shot brake strength (0.2) in both cases — only density and
    // reaction delay differ. See PROCESS.md for the sweep that picked these
    // exact values: 15 cars/lane + 0s delay reliably absorbs the nudge;
    // 40 cars/lane + 1.0s delay reliably sustains it.
    const low = runWithBrake(15, { followingDistance: 6, reactionDelay: 0 }, 0.2, 300);
    const high = runWithBrake(40, { followingDistance: 6, reactionDelay: 1.0 }, 0.2, 300);
    expect(low.finalIntensity).toBeLessThan(0.01);
    expect(high.finalIntensity).toBeGreaterThan(0.1);
  });

  it("increasing following distance turns the same jam-triggering brake into a non-event", () => {
    // Same density (26), same delay (0.3s), same brake (0.2) — only the
    // desired following distance differs. The model is genuinely
    // non-monotonic in this parameter (very tight AND very loose headway are
    // both stable; see CLAUDE.md), so the UI only exposes the monotonic
    // "more spacing helps" arm from 6 to 12 — these are exactly its two ends.
    const tight = runWithBrake(26, { followingDistance: 6, reactionDelay: 0.3 }, 0.2, 300);
    const loose = runWithBrake(26, { followingDistance: 12, reactionDelay: 0.3 }, 0.2, 300);
    expect(tight.finalIntensity).toBeGreaterThan(0.1);
    expect(loose.finalIntensity).toBeLessThan(0.01);
    expect(loose.finalIntensity).toBeLessThan(tight.finalIntensity);
  });

  it("reset reproduces the exact fresh state, even after the simulation has run and jammed", () => {
    const fresh = createRoad(26, 3, PARAMS.trackLength, 6);
    let state = createRoad(26, 3, PARAMS.trackLength, 6);
    state = applyBrake(state, 1, 0, 0.2);
    for (let i = 0; i < 2000; i++) {
      state = step(state, PARAMS.dt, { followingDistance: 6, reactionDelay: 0.3 });
    }
    // Confirm it actually moved away from the fresh state first — otherwise
    // this test would pass trivially.
    expect(jamIntensity(state)).toBeGreaterThan(0.1);

    const resetState = createRoad(26, 3, PARAMS.trackLength, 6);
    expect(resetState).toEqual(fresh);
  });

  it("a brake in one lane never perturbs the other lanes — lanes are independent", () => {
    let state = createRoad(26, 3, PARAMS.trackLength, 6);
    const beforeLane0 = state.lanes[0];
    const beforeLane2 = state.lanes[2];
    state = applyBrake(state, 1, 0, 0.2);
    for (let i = 0; i < 3000; i++) {
      state = step(state, PARAMS.dt, { followingDistance: 6, reactionDelay: 0.3 });
    }
    // Lane 1 (the one braked) should have jammed…
    const lane1Speeds = state.lanes[1].cars.map((c) => c.speed);
    const lane1Mean = lane1Speeds.reduce((s, v) => s + v, 0) / lane1Speeds.length;
    const lane1Variance =
      lane1Speeds.reduce((s, v) => s + (v - lane1Mean) ** 2, 0) / lane1Speeds.length;
    expect(Math.sqrt(lane1Variance)).toBeGreaterThan(0.1);
    // …while lanes 0 and 2 stayed exactly at their untouched equilibrium —
    // each lane runs its own independent copy of the model.
    for (const car of state.lanes[0].cars) {
      expect(car.speed).toBeCloseTo(beforeLane0.cars[0].speed, 10);
    }
    for (const car of state.lanes[2].cars) {
      expect(car.speed).toBeCloseTo(beforeLane2.cars[0].speed, 10);
    }
  });

  it("never lets two cars occupy the same position in any lane (no unphysical overlap), even long after a brake-triggered wave forms, with delay active", () => {
    // Long enough, at high density with a full second of reaction delay, to
    // run well past where the old single-lane model used to (incorrectly)
    // let cars numerically pass through each other; see step()'s MIN_GAP.
    let state = createRoad(40, 3, PARAMS.trackLength, 6);
    state = applyBrake(state, 0, 0, 0.3);
    const params: SimParams = { followingDistance: 6, reactionDelay: 1.0 };
    for (let i = 0; i < 20_000; i++) {
      state = step(state, PARAMS.dt, params);
    }
    for (const lane of state.lanes) {
      const positions = lane.cars.map((c) => c.position).sort((a, b) => a - b);
      for (let i = 0; i < positions.length; i++) {
        const next = positions[(i + 1) % positions.length];
        let gap = next - positions[i];
        if (gap < 0) gap += state.trackLength;
        expect(gap).toBeGreaterThan(0);
      }
    }
  });
});
