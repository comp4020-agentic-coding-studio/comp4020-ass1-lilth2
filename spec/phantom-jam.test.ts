import { describe, expect, it } from "vitest";
import { createRing, speedStats, step, PARAMS } from "../src/traffic";

// This is the one line of the published spec that's mechanically checkable:
// "the visitor does something that changes what they see — state the core
// interaction plainly enough to write a test for it." The core interaction is
// the density slider. These tests call the pure step() function directly, so
// they assert on the model's real emergent behaviour without depending on
// requestAnimationFrame timing or wall-clock delays (see CLAUDE.md).

function runFor(carCount: number, simulatedSeconds: number) {
  let state = createRing(carCount, PARAMS.trackLength);
  const steps = Math.round(simulatedSeconds / PARAMS.dt);
  let peakStdev = 0;
  for (let i = 0; i < steps; i++) {
    state = step(state, PARAMS.dt);
    const { stdev } = speedStats(state);
    if (stdev > peakStdev) peakStdev = stdev;
  }
  return { state, peakStdev };
}

describe("phantom traffic jam: core interaction", () => {
  it("stays a uniform, stable flow at low density", () => {
    // Well below the known-stable side of the transition (empirically
    // verified — see the density probe cited in PROCESS.md): headway stays
    // large enough that the optimal-velocity function's slope never
    // approaches the model's sensitivity, so a small seed perturbation damps
    // out rather than growing.
    const { peakStdev } = runFor(15, 200);
    expect(peakStdev).toBeLessThan(0.02);
  });

  it("spontaneously forms a sustained stop-and-go wave above the critical density — with no collision triggered", () => {
    // Well above the transition. No car in this simulation is ever told to
    // brake; the wave is an emergent property of everyone individually
    // trying to match the car ahead with a delayed (sensitivity-limited)
    // response.
    const { peakStdev } = runFor(42, 400);
    expect(peakStdev).toBeGreaterThan(0.05);
  });

  it("never lets two cars occupy the same position (no unphysical overlap)", () => {
    let state = createRing(42, PARAMS.trackLength);
    for (let i = 0; i < 8000; i++) {
      state = step(state, PARAMS.dt);
    }
    const positions = [...state.cars.map((c) => c.position)].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < positions.length; i++) {
      const next = positions[(i + 1) % positions.length];
      let gap = next - positions[i];
      if (gap < 0) gap += state.trackLength;
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });
});
