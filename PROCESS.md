# Process overview

## What I built

A single-lane ring/straight-road simulation of the optimal-velocity
car-following model (Bando et al.), with a reaction delay. One live
control — traffic density — decides whether a manually-triggered "small
brake" is absorbed within a few car-lengths or grows into a lasting
stop-and-go wave; everything else is a fixed constant, chosen and
re-chosen only after being probed, never guessed. Two skeuomorphic views
(Ring road, Straight road) plus an abstract Wave view render one shared
`RoadState` every tick, so they can never disagree by construction.

## The moments that mattered

1. **Scoping before any prototype code.** Before writing `index.html`, I
   wrote the topic boundary, design principles, and an explicit "agent
   should not" list into `CLAUDE.md` — ruling out a manual perturb control
   and multiple lanes in writing, so neither the agent nor I could drift
   back to them under time pressure once building started
   ([`67f3bfb`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/67f3bfb)).

2. **Trusting the render over the green suite found the actual bug.**
   Every mechanical check was green — physics unit tests, build, lint, a
   full Playwright suite at both marking viewports — and I nearly called
   it done. Only sitting and watching the page at near-max density long
   enough showed the state label flip from "jam" back to "Free-flowing" at
   a speed the cars' own spacing makes impossible. Tracing `step()` by
   hand past the existing test's time window found it: coarse Euler steps
   let a fast car's one-step advance exceed the gap ahead, numerically
   passing through it and silently "resolving" the jam. The fix went into
   `step()` itself — capping each car's advance at its start-of-step gap —
   not into loosening a test threshold
   ([`9b05582`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/9b05582)).

3. **Re-raising a scope boundary as a question instead of quietly
   expanding it.** At the finished single-lane prototype's stable
   equilibrium there was nothing left to watch happen. Rather than add a
   perturb button and extra lanes unilaterally — both explicitly ruled out
   in `CLAUDE.md`'s original boundary — I proposed the redesign as a
   question with a sharpened thesis, got two follow-up design questions
   resolved before any code changed, then rewrote `CLAUDE.md` to reverse
   only what that answer justified
   ([`b83598c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/b83598c)).
   The same discipline held on the way back down: later requests to
   re-narrow the sliders and the lane count were each re-raised as
   explicit questions rather than silently applied, and each is recorded
   in `CLAUDE.md` as a labelled reversal, not hidden as if only one
   direction ever happened
   ([`15560ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/15560ef)).

4. **A paradox a probe found, not a UI glitch.** A bug report noted
   average speed could read as *faster* right after a jam got worse. A
   throwaway probe confirmed it: after a triggered brake at high density,
   `speedStats().mean` rose from 0.24 to 0.82 while `jamIntensity` kept
   climbing — the arithmetic mean was dominated by cars sitting in the
   model's wide-open gaps, not the many barely-moving ones. Traffic
   engineering's answer is the harmonic ("space-mean") speed, which one
   stopped car pulls toward zero regardless of how many others are fast.
   Added `spaceMeanSpeed()` alongside — not replacing — `speedStats()`, so
   every existing jam-intensity threshold stayed untouched, and encoded
   the fix as a regression test rather than a one-off
   ([`6493c40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/6493c40)).

## Before you ship

`pnpm check:evidence` verifies citations resolve to real commits.
