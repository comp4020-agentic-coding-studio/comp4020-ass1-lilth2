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
  const { stdev: finalStdev } = speedStats(state);
  return { state, peakStdev, finalStdev };
}

describe("phantom traffic jam: core interaction", () => {
  it("stays a uniform, stable flow at low density", () => {
    // Well below the known-stable side of the transition (empirically
    // verified — see the density probe cited in PROCESS.md): headway stays
    // large enough that the optimal-velocity function's slope never
    // approaches the model's sensitivity, so the seed perturbation damps out
    // rather than growing. Checked at settle time, not peak-over-the-run —
    // the perturbation itself causes a trivial one-step transient that isn't
    // the phenomenon under test.
    const { finalStdev } = runFor(15, 200);
    expect(finalStdev).toBeLessThan(0.01);
  });

  it("spontaneously forms a stop-and-go wave above the critical density, and it stays — with no car ever told to brake", () => {
    // Well above the transition. No car in this simulation is ever told to
    // brake; the wave is an emergent property of everyone individually
    // trying to match the car ahead with a delayed (sensitivity-limited)
    // response. Checked both as a clear peak within the growth window AND
    // as a settled stdev late in a much longer run — this used to
    // (incorrectly) decay back to a uniform-max-speed state past ~300
    // simulated seconds, because Euler integration let cars numerically pass
    // through each other at this density; see step()'s no-passing
    // constraint. CLAUDE.md's thesis is specifically that the wave "stays",
    // so a test that only checked the early peak would have missed that bug.
    const { peakStdev } = runFor(42, 400);
    expect(peakStdev).toBeGreaterThan(0.3);
    const { finalStdev: lateStdev } = runFor(46, 900);
    expect(lateStdev).toBeGreaterThan(0.3);
  });

  it("never lets two cars occupy the same position (no unphysical overlap), even long after the wave forms", () => {
    // Long enough, at the slider's maximum density, to run well past the
    // ~300-simulated-second point where cars used to numerically pass
    // through each other (see the test above and step()'s MIN_GAP).
    let state = createRing(46, PARAMS.trackLength);
    for (let i = 0; i < 20_000; i++) {
      state = step(state, PARAMS.dt);
    }
    const positions = state.cars.map((c) => c.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      const next = positions[(i + 1) % positions.length];
      let gap = next - positions[i];
      if (gap < 0) gap += state.trackLength;
      expect(gap).toBeGreaterThan(0);
    }
  });
});
