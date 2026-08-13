# Process overview

## What I built

A single ring road of cars running a real car-following model (Bando et al.'s
optimal-velocity model), with one control: a density slider. Below a critical
density the flow settles to a stable, uniform speed; above it, a stop-and-go
wave spontaneously forms and persists — no car is ever told to brake, no
random trigger, just every driver trying to match the car ahead a little late.
The point is that congestion doesn't need a visible cause.

## The moments that mattered

1. **Scoping before any prototype code.** Neither of my last two weeks'
   `CLAUDE.md`s had ever actually diverged from the template, so this
   assignment was the first real point of harness accretion, not a merge.
   Before writing `index.html`, I wrote the topic boundary, the design
   principles, and an explicit "agent should not" list into `CLAUDE.md`
   ([`67f3bfb`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/67f3bfb)).
   The obvious next step after picking the topic was to start sketching a UI;
   instead that time went into ruling things out in writing — a manual
   click-to-perturb control, multiple lanes — so neither the agent nor I could
   drift back to them under time pressure later.

2. **Probing real parameters instead of guessing or fitting to output.**
   `CLAUDE.md` explicitly forbids tuning the critical-density test thresholds
   to whatever the implementation happens to produce. So before writing
   `spec/phantom-jam.test.ts` or `src/traffic.ts`, throwaway scripts (never
   committed) found density and sensitivity values that put the model in
   known-stable and known-unstable regimes, reasoned from the optimal-velocity
   function's slope, not from watching a running simulation. The test still
   went red once for the right reason afterwards — the first stable-density
   assertion measured *peak* stdev, which caught the seed perturbation's own
   one-step transient rather than settled behaviour — and the fix was to
   assert on settle-time stdev instead
   ([`039ebc5...e8176a2`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/compare/039ebc5...e8176a2)).

3. **Manual verification found a real physics bug every automated check had
   missed.** `CLAUDE.md` requires looking at the rendered page at both
   marking viewports before shipping, not just trusting green checks. Doing
   that with the slider near its maximum showed the state label flip from
   "jam" back to "Free-flowing" at an impossible average speed — 44 cars on a
   200-unit ring, all somehow at max speed, when their spacing alone caps the
   equilibrium speed near 0.1. Tracing `step()` headlessly past the existing
   test's 400-simulated-second window showed why: discrete Euler steps let a
   fast car's one-step advance exceed the gap ahead, passing through the car
   in front instead of catching up to it, which silently "resolved" the jam by
   breaking the ring's ordering. The fix belonged in the implementation, not
   the test: `step()` now caps each car's advance at the gap measured at the
   start of the step, and the no-overlap test was strengthened to run at the
   highest density for long enough to have caught this
   ([`9b05582`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/9b05582)).
   The same pass caught a second bug in that commit: the
   `prefers-reduced-motion` fallback had been slowing the simulation itself,
   not just the redraw rate, so the wave was nearly impossible to see within
   any reasonable wait for a reduced-motion visitor.

4. **A failing test that was wrong, not the app.** Once headless Chromium
   could actually launch (a sandbox missing 27 shared libraries, fixed with
   `sudo`), four of five Playwright tests passed immediately and one —
   keyboard operability — failed. The instinct is to assume the app is
   inaccessible; reading the failure showed the test's own Tab-seeking loop
   compared an element's `id` against the literal string `"INPUT"`, which no
   `id` ever equals, so it tabbed straight past the slider every time
   ([`d756c78`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/d756c78)).

## Before you ship

`pnpm check:evidence` verifies citations resolve to real commits.
