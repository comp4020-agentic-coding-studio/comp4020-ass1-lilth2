// The phantom-jam simulation: a ring road of cars following the Bando et al.
// (1995) optimal-velocity car-following model. Each car tries to match a
// desired speed that depends only on the gap to the car ahead, closing the
// difference at a fixed rate (`sensitivity`) — a stand-in for finite human
// reaction time. No car is ever told to brake; a stop-and-go wave, when one
// forms, is an emergent property of this rule applied identically to every
// car. See CLAUDE.md for the topic boundary this model exists to serve.
//
// step() is a pure function of state — no timers, no DOM, no randomness —
// so spec/phantom-jam.test.ts can call it directly and the UI's animation
// loop can call it at whatever real-time pace it wants without changing the
// physics.

export const PARAMS = {
  trackLength: 200,
  desiredSpeed: 2,
  safeHeadway: 6,
  sensitivity: 0.15,
  dt: 0.05,
} as const;

export interface Car {
  position: number; // 0..trackLength, wraps around the ring
  speed: number;
}

export interface RingState {
  cars: Car[];
  trackLength: number;
}

// The optimal-velocity function: the speed a driver settles toward for a
// given gap to the car ahead. tanh gives it the right shape — near zero for
// tight gaps, saturating at desiredSpeed for open road — without ever going
// negative.
export function optimalVelocity(
  gap: number,
  desiredSpeed = PARAMS.desiredSpeed,
  safeHeadway = PARAMS.safeHeadway,
): number {
  return (
    (desiredSpeed / 2) *
    (Math.tanh(gap - safeHeadway) + Math.tanh(safeHeadway))
  );
}

function gapAhead(cars: Car[], i: number, trackLength: number): number {
  const ahead = (i + 1) % cars.length;
  let gap = cars[ahead].position - cars[i].position;
  if (gap < 0) gap += trackLength;
  return gap;
}

// Evenly spaces `carCount` cars around the ring at the equilibrium speed for
// that density, then nudges one car's speed down slightly. Real traffic is
// never perfectly uniform; this is the smallest possible seed for whichever
// behaviour the density actually produces — grows into a wave above the
// critical density, damps out below it.
export function createRing(
  carCount: number,
  trackLength: number = PARAMS.trackLength,
  seedPerturbation = 0.9,
): RingState {
  const headway = trackLength / carCount;
  const equilibriumSpeed = optimalVelocity(headway);
  const cars: Car[] = Array.from({ length: carCount }, (_, i) => ({
    position: (i * trackLength) / carCount,
    speed: i === 0 ? equilibriumSpeed * seedPerturbation : equilibriumSpeed,
  }));
  return { cars, trackLength };
}

// The smallest gap a car is ever allowed to close to. Without this, discrete
// Euler steps let a fast car's one-step advance exceed the gap ahead at high
// density, passing through the car in front instead of catching up to it —
// numerically "solving" the jam by breaking the ring's physical ordering.
// Capping each car's advance at (gap at the start of the step) keeps this
// impossible: the car ahead only ever moves forward, so a trailing car that
// never advances past where the leading car *started* can never end up past
// where it *ends up* either.
const MIN_GAP = 1e-3;

export function step(state: RingState, dt: number = PARAMS.dt): RingState {
  const { cars, trackLength } = state;
  const gaps = cars.map((_, i) => gapAhead(cars, i, trackLength));
  const newSpeeds = cars.map((car, i) => {
    const target = optimalVelocity(gaps[i]);
    const speed = car.speed + PARAMS.sensitivity * (target - car.speed) * dt;
    return Math.max(0, speed);
  });
  const newCars = cars.map((car, i) => {
    const maxAdvance = Math.max(0, gaps[i] - MIN_GAP);
    const advance = Math.min(car.speed * dt, maxAdvance);
    return {
      position: (car.position + advance + trackLength) % trackLength,
      speed: newSpeeds[i],
    };
  });
  return { cars: newCars, trackLength };
}

export function speedStats(state: RingState): { mean: number; stdev: number } {
  const speeds = state.cars.map((c) => c.speed);
  const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  const variance =
    speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length;
  return { mean, stdev: Math.sqrt(variance) };
}
