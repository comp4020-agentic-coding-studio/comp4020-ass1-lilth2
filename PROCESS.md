# Process overview

## What I built

Three independent ring lanes of cars running a real car-following model (Bando
et al.'s optimal-velocity model), each with a reaction-delay term. Sliders
control density, reaction delay, and following distance; a "Trigger small
brake" button perturbs one fixed car, and a Reset button restores the exact
uniform starting state. The uniform state is an exact fixed point of the
model — nothing destabilizes on its own — so the whole interaction is: dial in
a regime, trigger a small brake, and watch whether it gets absorbed within a
few car-lengths or ripples into a lasting, circulating wave. No car is ever
scripted to jam; the outcome is decided entirely by `step()` and the sliders
already dialled in when the brake lands.

This started as a single lane with only a density slider and no perturbation
control (see moment 1 below) and was substantially redesigned in moments 5-8
into the three-lane, reaction-delay, brake-trigger version described above —
`CLAUDE.md`'s topic boundary was updated to match
([`b83598c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/b83598c)).

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

5. **Re-raising the "one lane, no perturbation" boundary instead of quietly
   expanding it.** Sitting at the finished single-lane prototype's stable
   equilibrium, there was nothing left to *watch happen* — the density
   slider's spontaneous-onset threshold was the only way to see a wave form,
   and reaching it meant dragging a slider to its extreme rather than
   observing a mechanism. Rather than add a perturb button and multiple lanes
   unilaterally (`CLAUDE.md`'s original "agent should not" list explicitly
   named both), the redesign was proposed as a question first, with a
   sharpened thesis ("the jam is not caused by an obstacle; it is caused by
   delayed reactions and unstable spacing") and a pre-implementation summary
   for sign-off before any code changed. Two follow-up questions were asked
   and answered before building: whether to expose the model's non-monotonic
   following-distance range or bound the slider to the monotonic arm only
   (bounded), and whether "Trigger small brake" should target a fixed car or
   a user-clicked one (fixed, to keep the core interaction decoupled from an
   unrelated hit-testing feature). `CLAUDE.md`'s boundary was then rewritten
   to match, reversing exactly the two exclusions this contradicted and
   nothing else
   ([`b83598c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/b83598c)).

6. **Probing the redesigned model before writing thresholds, again.** The
   same rule from moment 2 applied to three new dimensions at once (reaction
   delay, following distance, brake strength) plus three lanes. Throwaway
   `pnpm dlx tsx` scripts (four of them, each deleted immediately after
   extracting results) found: that the perfectly uniform `createRoad` state
   is an exact fixed point of the model, so no combination of
   density/delay/spacing ever spontaneously destabilizes without the
   deliberate brake; concrete slider defaults and ranges that reliably
   separate an absorbed outcome (final jam intensity ~0.00001) from a
   sustained one (~0.35); and that the divergence between those two outcomes
   becomes visible within a few real seconds at the chosen simulated-time
   rate, which is what the test thresholds and the 30-second comprehension
   goal are both built on
   ([`2bb9937`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/2bb9937)).

7. **An honest asymmetry the probes surfaced, kept in the copy rather than
   smoothed over.** The same probing found that increasing following
   distance reliably *prevents* a triggered brake from becoming a sustained
   wave, but does not reliably *cure* one that has already fully formed —
   jam intensity stayed essentially flat for 150 simulated seconds after
   loosening spacing mid-jam. It would have been easy to leave the "What
   makes it disappear?" copy vague enough to imply symmetry; instead it
   states the asymmetry directly
   ([`2bb9937`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/2bb9937)),
   matching `CLAUDE.md`'s rule against curve-fitting the *story* to the
   implementation any more than the test thresholds.

8. **A verification script that only ran from the right directory.** Writing
   a standalone Playwright script outside the repo (to screenshot both
   viewports, a triggered jam, keyboard focus, a throttled load, and a no-JS
   baseline) failed twice on `ERR_MODULE_NOT_FOUND` for `@playwright/test` —
   first importing the wrong package name, then failing again under
   `NODE_PATH` because Node's ESM resolver doesn't walk `NODE_PATH` the way
   `require()` does. Running the same script from inside the repo's own
   directory (where `node_modules` resolves normally) worked immediately;
   the fix was about *where* the script ran, not what it imported. All eight
   screenshots then confirmed no overflow or control overlap at either
   marking viewport, a legible red congestion-band overlay in the jammed
   state, a visible focus ring on "Trigger small brake", and no layout
   breakage under a throttled load or with JavaScript disabled — checking
   the actual rendered UI built in
   ([`9e3d98c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/9e3d98c))
   rather than trusting the Playwright suite
   ([`2d91201`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/2d91201))
   alone.

9. **Adding a second view without letting the first one's requirements slip.**
   The Wave view's abstraction (cars as dots) reads clearly as a system-level
   pattern but doesn't look like traffic, so a skeuomorphic "Real road view"
   (car-shaped vehicles, headlights/taillights, lane-marked road) was added
   alongside it — never replacing it, and never behind a toggle, since a
   toggle would mean only one view is ever checked against `CLAUDE.md`'s
   requirements at a time. Both are driven from the same `RoadState` inside
   one `render()` tick
   ([`979e043`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/979e043)),
   so "the two views agree" is structural, not something to verify by eye.
   Re-reading `CLAUDE.md` against the new view (per the standing instruction
   to check every step, not just the plan) surfaced two real gaps before
   shipping, not after: the edge-fade wraparound masking and the
   reduced-motion brake-indicator fallback had both been written with only
   the Wave view in mind, and neither applied automatically to the new one.
   Both were added to match
   ([`f995c6b`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/f995c6b)),
   and `CLAUDE.md` itself was updated to say "every view" instead of
   describing a single view's requirements
   ([`c6ff576`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/c6ff576)).
   Manual verification also caught a near-miss the other way: a full-page
   screenshot of the Real road view at 390×844 looked like a solid packed
   blob, which could easily have been read as a legibility bug. A separate
   zoomed/clipped capture at actual resolution showed individual car bodies,
   windshields, and taillights were clearly distinguishable — the blob was a
   screenshot-thumbnail downscaling artifact, not a rendering defect, and no
   code changed as a result. `pnpm check` and `pnpm test:e2e` (including the
   three new dual-view-specific tests) passed on the first run after every
   edit this round — no red-to-green cycle was needed
   ([`a3832a7`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/a3832a7)).

10. **A bug report split into two, and one real defect plus one real
    non-bug.** "Other lanes sometimes look affected, and high density
    congests faster than before — check for other bugs too." Two separate
    claims, each checked by actually running the model rather than assumed:

    The first was a real defect, not lane coupling. Lanes are and remain
    fully independent — an existing test already proved this, and direct
    code reading confirmed `step()`/`applyBrake()` never touch another
    lane's state. The actual cause: the stopped-car count and speed colour
    both judged "how slow is this car" against the fixed `desiredSpeed`
    constant instead of *this density and spacing's own* free-flow
    equilibrium, which drops far below `desiredSpeed` at high density
    (~12% of it at density=40 with default spacing). So an untouched,
    perfectly uniform lane at high density rendered red and counted as
    "stopped" — probing found all 120 cars misclassified this way before any
    brake was ever triggered — creating the illusion that the brake had
    spread. Fixed by introducing `equilibriumSpeed()` and threading a
    `referenceSpeed` through the colour mapping and the stopped-car count,
    recomputed every render tick
    ([`e31fbc4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/e31fbc4)).

    The second turned out to be partly real physics and partly the same bug
    class again. The optimal-velocity model's linear-stability sensitivity
    (`V' ∝ sech²(gap − followingDistance)`) peaks when headway is close to
    followingDistance, not at either density extreme — so density=32
    (headway close to followingDistance=6's own peak) genuinely destabilizes
    fastest, and "higher density can jam faster" is real, correct,
    non-monotonic behaviour, not a bug. But density=40 also measured
    *slower* to cross the jam-intensity threshold than density=26 in
    absolute simulated time, which `V'` does not predict (40's `V'` is
    higher than 26's). Tracing raw stdev against equilibrium speed over time
    showed why: `jamIntensity` and `probeStability` still compared variance
    to the fixed `desiredSpeed`, same bug as above. At density=40 the
    achievable absolute speed range is compressed, so reaching a fixed
    absolute stdev of 0.1 took disproportionately longer even though the
    disruption relative to that density's own equilibrium was already
    several times its equilibrium speed by the same simulated time. Fixed
    the same way, reusing `equilibriumSpeed()`
    ([`0e9093f`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/0e9093f)).
    Every existing `finalIntensity`/`peakIntensity` threshold in the spec
    (0.01, 0.1) still held unchanged after this — density=26, which most of
    those tests use, has an equilibrium close enough to `desiredSpeed` that
    the fix mainly changes behaviour at the extremes, where it should.

    Both fixes were verified the same way: a numeric before/after (120/120
    vs. 0/120 stopped cars; a previously-borderline density=40 stability
    read now correctly landing on "unstable"), the full spec and e2e suites
    green throughout, and a direct check of the running page's
    `#stability-zone` readout at density=40. Nothing else turned up in the
    proactive sweep this report asked for — `applyBrake`'s strength is
    already relative to the car's own current speed, not a fixed constant,
    and the floating-point phase-offset noted in an earlier moment remains
    harmless (plateaus at ~1e-14, never grows).

## Before you ship

`pnpm check:evidence` verifies citations resolve to real commits.
