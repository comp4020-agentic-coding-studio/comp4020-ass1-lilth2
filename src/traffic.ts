// The phantom-jam simulation: several independent lanes of cars, each running
// the Bando et al. (1995) optimal-velocity car-following model, on a ring
// (closed loop, rendered as a straight strip — see main.ts for how the
// wraparound seam is masked). Each car tries to match a desired speed that
// depends only on the gap to the car ahead. Two things stand in for a human
// driver's imperfection: `sensitivity` (closing the gap to the target speed
// at a finite rate, not instantly) and `reactionDelay` (perceiving the gap as
// it was some seconds ago, not right now). No car is ever told to brake by
// the simulation itself; a stop-and-go wave, when one forms, is an emergent
// property of this rule applied identically to every car. The one exception
// is `applyBrake`, a deliberate one-shot user action — see CLAUDE.md for why
// that's now in scope. See CLAUDE.md for the topic boundary this model exists
// to serve.
//
// step() is a pure function of state — no timers, no DOM, no randomness —
// so spec/phantom-jam.test.ts can call it directly and the UI's animation
// loop can call it at whatever real-time pace it wants without changing the
// physics.

export const PARAMS = {
  trackLength: 200,
  desiredSpeed: 2,
  sensitivity: 0.15,
  dt: 0.05,
  laneCount: 3,
} as const;

// The largest reaction delay the UI ever asks for. Each car's gap-history
// buffer is sized to this once, at road-creation time, rather than resized
// whenever the delay slider moves — so a delayed lookup is always
// well-defined and changing the slider takes effect on the very next tick
// with no special-casing in step().
export const MAX_REACTION_DELAY = 2; // seconds
const MAX_DELAY_STEPS = Math.round(MAX_REACTION_DELAY / PARAMS.dt);

export interface SimParams {
  // The gap a driver aims to leave (the OV function's inflection point).
  // Bounded in the UI to [6, 12] — the monotonic "more spacing helps" arm of
  // this model; see CLAUDE.md for why the other arm is deliberately not
  // exposed.
  followingDistance: number;
  // Seconds between a gap actually changing and a driver reacting to it.
  reactionDelay: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  followingDistance: 6,
  reactionDelay: 0.3,
};

export interface Car {
  position: number; // 0..trackLength, wraps around the ring
  speed: number;
  // Seconds remaining to render this car's brake-flash. Sub-zero never
  // happens; 0 means "not flashing". Purely a rendering hint — the physics
  // above never reads it.
  brakeFlash: number;
}

export interface Lane {
  cars: Car[];
  // Per car, the most recent (up to MAX_DELAY_STEPS) gaps-ahead, oldest
  // first. Used only to compute the *perceived* gap for the speed-target
  // calculation; the no-passing position cap always uses the real, current
  // gap (see step()) so delay can make a driver misjudge when to respond but
  // can never let cars overlap.
  gapHistory: number[][];
}

export interface RoadState {
  lanes: Lane[];
  trackLength: number;
}

// The optimal-velocity function: the speed a driver settles toward for a
// given gap to the car ahead. tanh gives it the right shape — near zero for
// tight gaps, saturating at desiredSpeed for open road — without ever going
// negative.
export function optimalVelocity(
  gap: number,
  desiredSpeed: number = PARAMS.desiredSpeed,
  followingDistance: number = DEFAULT_SIM_PARAMS.followingDistance,
): number {
  return (
    (desiredSpeed / 2) *
    (Math.tanh(gap - followingDistance) + Math.tanh(followingDistance))
  );
}

function gapAhead(cars: Car[], i: number, trackLength: number): number {
  const ahead = (i + 1) % cars.length;
  let gap = cars[ahead].position - cars[i].position;
  if (gap < 0) gap += trackLength;
  return gap;
}

// The gap `delaySteps` ticks ago, as recorded in `history` (oldest first,
// newest last, length up to MAX_DELAY_STEPS). delaySteps = 0 means "no
// delay" — use the current gap directly, skipping history entirely. If the
// simulation hasn't been running long enough to have that much history yet,
// fall back to the oldest gap on record (equivalent to assuming nothing
// changed before the simulation started).
function delayedGap(
  history: number[],
  currentGap: number,
  delaySteps: number,
): number {
  if (delaySteps <= 0) return currentGap;
  const idx = history.length - delaySteps;
  if (idx >= 0) return history[idx];
  return history.length > 0 ? history[0] : currentGap;
}

function pushHistory(history: number[], gap: number): number[] {
  const next = history.length >= MAX_DELAY_STEPS ? history.slice(1) : history.slice();
  next.push(gap);
  return next;
}

// The free-flow speed every car in a lane settles to when nothing has ever
// perturbed it — density and desired following gap determine this, not a
// fixed constant. At high density this can be far below `desiredSpeed` (e.g.
// ~12% of it at density=40 with default spacing; see PROCESS.md for the
// probe) — that is a correct, physical consequence of crowding, not a bug.
// Used both to seed createRoad's uniform start and, in main.ts, as the
// yardstick "is this car slower than *this road's own* free flow" instead of
// a fixed one — see nearStoppedCount and the callers of viewShared's
// speedState for why that distinction matters.
export function equilibriumSpeed(
  carsPerLane: number,
  trackLength: number = PARAMS.trackLength,
  followingDistance: number = DEFAULT_SIM_PARAMS.followingDistance,
): number {
  const headway = trackLength / carsPerLane;
  return optimalVelocity(headway, PARAMS.desiredSpeed, followingDistance);
}

// Evenly spaces `carsPerLane` cars around each of `laneCount` independent
// lanes at the equilibrium speed for that density — perfectly uniform, no
// seed perturbation. Reset must reproduce this exact state every time (see
// spec/phantom-jam.test.ts); the only way a wave now starts is a deliberate
// "Trigger small brake" or a density/delay/spacing combination past the
// model's own stability threshold.
export function createRoad(
  carsPerLane: number,
  laneCount: number = PARAMS.laneCount,
  trackLength: number = PARAMS.trackLength,
  followingDistance: number = DEFAULT_SIM_PARAMS.followingDistance,
): RoadState {
  const headway = trackLength / carsPerLane;
  const speed = equilibriumSpeed(carsPerLane, trackLength, followingDistance);
  const lanes: Lane[] = Array.from({ length: laneCount }, (_, laneIndex) => {
    // Purely cosmetic phase offset so lanes don't render as an identical
    // stack of cars directly on top of one another.
    const phase = (laneIndex * headway) / laneCount;
    const cars: Car[] = Array.from({ length: carsPerLane }, (_, i) => ({
      position: (i * trackLength) / carsPerLane + phase,
      speed,
      brakeFlash: 0,
    }));
    return { cars, gapHistory: cars.map(() => []) };
  });
  return { lanes, trackLength };
}

// The smallest gap a car is ever allowed to close to. Without this, discrete
// Euler steps let a fast car's one-step advance exceed the gap ahead at high
// density, passing through the car in front instead of catching up to it —
// numerically "solving" the jam by breaking the road's physical ordering.
// Capping each car's advance at (gap at the start of the step) keeps this
// impossible, and it always uses the *current* gap — never the delayed one —
// so reaction delay can only ever make a driver misjudge *when* to slow
// down, not let it violate physics.
const MIN_GAP = 1e-3;

const BRAKE_FLASH_DURATION = 0.6; // seconds a car renders as "just braked"

export function step(
  state: RoadState,
  dt: number = PARAMS.dt,
  params: SimParams = DEFAULT_SIM_PARAMS,
): RoadState {
  const delaySteps = Math.min(
    MAX_DELAY_STEPS,
    Math.max(0, Math.round(params.reactionDelay / dt)),
  );
  const lanes = state.lanes.map((lane) => {
    const { cars, gapHistory } = lane;
    const currentGaps = cars.map((_, i) => gapAhead(cars, i, state.trackLength));
    const newSpeeds = cars.map((car, i) => {
      const perceived = delayedGap(gapHistory[i], currentGaps[i], delaySteps);
      const target = optimalVelocity(
        perceived,
        PARAMS.desiredSpeed,
        params.followingDistance,
      );
      const speed = car.speed + PARAMS.sensitivity * (target - car.speed) * dt;
      return Math.max(0, speed);
    });
    const newCars = cars.map((car, i) => {
      const maxAdvance = Math.max(0, currentGaps[i] - MIN_GAP);
      const advance = Math.min(car.speed * dt, maxAdvance);
      return {
        position: (car.position + advance + state.trackLength) % state.trackLength,
        speed: newSpeeds[i],
        brakeFlash: Math.max(0, car.brakeFlash - dt),
      };
    });
    const newHistory = currentGaps.map((gap, i) => pushHistory(gapHistory[i], gap));
    return { cars: newCars, gapHistory: newHistory };
  });
  return { lanes, trackLength: state.trackLength };
}

// A deliberate, one-shot user action — not part of the per-tick physics.
// Cuts one car's speed by `brakeStrength` (0..1) and marks it to flash.
// Whether this ripples backward into a lasting wave, or just gets absorbed,
// depends entirely on the *existing* model (density/delay/spacing) — this
// function only ever perturbs, it never decides the outcome.
export function applyBrake(
  state: RoadState,
  laneIndex: number,
  carIndex: number,
  brakeStrength: number,
): RoadState {
  const lanes = state.lanes.map((lane, li) => {
    if (li !== laneIndex) return lane;
    const cars = lane.cars.map((car, ci) => {
      if (ci !== carIndex) return car;
      return {
        ...car,
        speed: Math.max(0, car.speed * (1 - brakeStrength)),
        brakeFlash: BRAKE_FLASH_DURATION,
      };
    });
    return { ...lane, cars };
  });
  return { ...state, lanes };
}

export function speedStats(state: RoadState): { mean: number; stdev: number } {
  const speeds = state.lanes.flatMap((lane) => lane.cars.map((c) => c.speed));
  const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  const variance =
    speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length;
  return { mean, stdev: Math.sqrt(variance) };
}

// A single number summarising "how jammed is this, right now" — 0 is
// perfectly uniform flow, 1 is maximally spread out (some cars stopped,
// others at full speed). Speed variance relative to `referenceSpeed` — this
// density and spacing's own equilibriumSpeed, not the fixed `desiredSpeed`
// constant — for the same reason as `nearStoppedCount` below: a fixed
// denominator compresses the achievable range at high density, so the exact
// same absolute disruption reads as a much smaller fraction there than it
// really is. Probing confirmed this isn't just a display nicety: at a
// destabilizing density=40 setting, the relative measure reaches full
// saturation by the same simulated time `probeStability` checks at, while
// the old fixed-desiredSpeed version was still only borderline — i.e. the
// fixed scale was under-reporting a severe, high-density jam as merely
// borderline (see PROCESS.md).
export function jamIntensity(state: RoadState, referenceSpeed: number): number {
  const { stdev } = speedStats(state);
  return Math.max(0, Math.min(1, stdev / referenceSpeed));
}

// How many cars, across all lanes, are close enough to stopped to read as
// "stuck in the jam" rather than "just going a bit slower". `referenceSpeed`
// must be *this density and spacing's own* equilibriumSpeed, not a fixed
// constant — otherwise every car in a naturally-slow-but-untouched
// high-density lane misreads as "stopped" purely because of density, not
// because anything actually jammed there (see PROCESS.md for the bug this
// fixed: at density=40 every one of 120 cars counted as stopped before any
// brake was ever triggered).
export function nearStoppedCount(
  state: RoadState,
  referenceSpeed: number,
  thresholdFraction = 0.15,
): number {
  const threshold = referenceSpeed * thresholdFraction;
  return state.lanes.reduce(
    (sum, lane) => sum + lane.cars.filter((c) => c.speed < threshold).length,
    0,
  );
}

export type StabilityZone = "stable" | "borderline" | "unstable";

// A fast, independent probe: runs a single-lane simulation forward with a
// small standardised nudge (not the user's own brake-strength slider, so
// this reads the *model's* sensitivity to the current density/delay/spacing
// settings, not whatever brake strength happens to be dialled in) and
// classifies where the final jam intensity lands. Deliberately not a
// lookup table — it's the same step()/applyBrake() the rest of the page
// uses, just run at simulated speed instead of animation speed. Callers
// should debounce this (~150ms) rather than invoke it on every slider
// `input` event; a single call is a few tens of milliseconds of real work.
export function probeStability(
  carsPerLane: number,
  params: SimParams,
  simulatedSeconds = 150,
): StabilityZone {
  let state = createRoad(carsPerLane, 1, PARAMS.trackLength, params.followingDistance);
  state = applyBrake(state, 0, 0, 0.15);
  const referenceSpeed = equilibriumSpeed(carsPerLane, PARAMS.trackLength, params.followingDistance);
  const steps = Math.round(simulatedSeconds / PARAMS.dt);
  for (let i = 0; i < steps; i++) {
    state = step(state, PARAMS.dt, params);
  }
  const intensity = jamIntensity(state, referenceSpeed);
  if (intensity < 0.05) return "stable";
  if (intensity > 0.2) return "unstable";
  return "borderline";
}
