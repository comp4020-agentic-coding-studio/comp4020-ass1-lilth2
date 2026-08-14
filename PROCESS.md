# Process overview

## What I built

A single ring lane of cars running a real car-following model (Bando et al.'s
optimal-velocity model) with a reaction-delay term, now presented through two
switchable demo modes — **Ring road** (cars looping a closed circular track)
and **Straight road** (the same cars in a line) — plus a small always-visible
**Wave view** (the original abstract dots). Four live sliders (density,
reaction delay, following distance, perturbation strength) act on whichever
demo is active; a "Trigger small brake" button perturbs one fixed car, and a
Reset button restores the exact uniform starting state, both driving the one
shared `RoadState` underneath all three views regardless of which tab is
visible. The uniform state is an exact fixed point of the model — nothing
destabilizes on its own — so the whole interaction is: dial in a density and
spacing, trigger a small brake, and watch whether it gets absorbed within a
few car-lengths or ripples into a lasting wave, on whichever demo makes that
outcome easiest to see. No car is ever scripted to jam; the outcome is
decided entirely by `step()` and the parameters already dialled in when the
brake lands. The average-speed readout is the harmonic (space-mean) speed,
not a plain arithmetic mean, so it reads a worsening jam as monotonically
slower rather than paradoxically faster (see moment 14).

This started as a single lane with only a density slider and no perturbation
control (see moment 1 below), was substantially redesigned in moments 5-8
into a three-lane, reaction-delay, brake-trigger version, was narrowed back to
one lane in moment 13 once the extra lanes stopped adding anything the
density/delay/spacing mechanism needed, and gained the Ring road/Straight
road split and its four live sliders back in moment 15 once a single
skeuomorphic view stopped being enough to show both halves of the thesis —
`CLAUDE.md`'s topic boundary was updated to match at each step
([`b83598c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/b83598c),
[`3e888b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/3e888b9),
[`69bcbdc`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/69bcbdc)).

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

11. **Narrowing three free sliders to one, on request, without losing the
    phenomenon.** Asked to keep only density adjustable and pin the rest to
    "whatever demonstrates it best," the risk was picking those fixed values
    by feel. Instead, a throwaway probe (never committed) swept density
    8-40 at several fixed following-distance/reaction-delay/brake-strength
    combinations and found one, already close to the "known good" values
    used in `spec/phantom-jam.test.ts` (followingDistance=6, reactionDelay=1.0,
    brakeStrength=0.2), where the *entire* density range still cleanly
    demonstrates both outcomes: 8-20 always absorbs the one-shot brake
    (final jam intensity ≈0), 24-40 always sustains it (final intensity
    0.35-1.0), with a sharp transition around density≈22 — nothing in the
    middle reads as ambiguous. The same sweep showed reaction delay barely
    moves that crossover (0s and 1.0s land within a few percent of each
    other), so keeping it at 1.0s is a thematic choice ("just reaction
    delay"), not a numerically load-bearing one — recorded here rather than
    implied. Removed the three now-fixed `<input>`s and their listeners from
    `index.html`/`main.ts`, updated `e2e/phantom-jam.spec.ts`'s control lists
    and the "sustain a jam" test (density alone now suffices), and rewrote
    `CLAUDE.md`'s core-interaction and topic-boundary sections to describe
    the narrower control set instead of the four-slider design it
    superseded. `spec/phantom-jam.test.ts` needed no changes — it drives
    `step()`/`applyBrake()` directly with explicit params, independent of
    the UI. Verified with `pnpm check` (18/18), `pnpm test:e2e` (9/9), and a
    direct browser check confirming exactly one `<input type="range">`
    remains and that density=40/density=12 still diverge into jam/free-flow
    as predicted
    ([`15560ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/15560ef)).

12. **A third bug report, and this one wasn't a bug — genuine floating-point-
    seeded instability.** "At first only the middle lane jams, later all
    three lanes show changes — check for a bug or give me a reason." Direct
    code reading ruled out the obvious suspects first, not by recalling
    moment 10 but by re-reading `src/traffic.ts` fresh: `createRoad`/`step`/
    `applyBrake` build every lane via `.map()`/`Array.from` with no shared
    references across lanes, and both `waveView.ts` and `realRoadView.ts`
    colour each car from `car.speed / referenceSpeed` alone — a single
    density-derived constant computed once in `main.ts`, never a
    dynamically-recomputed road-wide statistic — so neither lane coupling
    nor a shared colour-normalisation range could explain lanes 0 and 2
    changing.

    The actual mechanism sits between two earlier findings. Moment 10
    already showed the model's linear-stability sensitivity peaks at
    particular headways, and moment 11's density sweep (at the now-fixed
    followingDistance=6) had already classified densities 24-40 as
    "unstable," not "stable" or "borderline." A throwaway probe (never
    committed) ran a single, permanently untouched lane — zero deliberate
    perturbation, ever — at densities 20/24/26/32/40 for 20,000 simulated
    seconds, tracking its own speed stdev. Density 20 and 40 stayed at
    machine epsilon (~2e-16 to ~8e-17) for the entire run — genuinely
    stable, matching moment 10's prediction. Density 24 grew slightly then
    plateaued around 1e-13, matching the "harmless, plateaus at ~1e-14"
    note moment 10 already recorded — same phenomenon, same conclusion.
    But density 26 and 32 did not plateau: stdev grew from machine epsilon
    to a full jam (0.72-0.94, on the same scale as the deliberately-braked
    jam intensity) within 2200-2400 and 400-600 simulated seconds
    respectively — roughly 70-90 and 15-20 real seconds at this app's ~30x
    simulated/real-time ratio (`STEPS_PER_TICK=10` at `dt=0.05`, ~60fps),
    well inside how long a visitor plausibly leaves the page open.

    So moment 10's "harmless, never grows" conclusion was real but
    incomplete: true for the density and duration tested there
    (`probeStability`'s own 150-simulated-second default window), not for
    every density or for the length of time a visitor might actually watch.
    At densities where the uniform equilibrium is linearly unstable,
    floating-point rounding is itself a real, nonzero seed perturbation, and
    it eventually wins — with no lane-1 brake, no coupling, and no code
    defect involved. It's the same emergent mechanism the whole prototype
    demonstrates (delayed reactions plus unstable spacing turning an
    arbitrarily small nudge into a wave), just happening independently in
    lanes 0 and 2 from numerical noise instead of lane 1's deliberate brake.
    No code changed — `CLAUDE.md`'s fixed-point claim, which previously
    implied this could never happen at all, was corrected to say so
    honestly instead
    ([`0f43457`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/0f43457)).

13. **Narrowing three lanes back to one, once the "lanes interacting" report
    from moment 12 turned into a request to reduce lane count.** Given a
    choice between explaining the floating-point finding and cutting the
    lane count, the user picked cutting it — the extra lanes weren't
    demonstrating anything density/delay/spacing alone didn't already cover,
    and one lane removes the "is this a bug" question at its root instead of
    just documenting the answer. `RoadState.lanes` was already a generic
    array — `createRoad`/`step`/`applyBrake`/`speedStats`/`jamIntensity`/
    `nearStoppedCount` and both view modules all iterate it with `.map()`/
    `.flatMap()`/`Array.from({length: PARAMS.laneCount}, ...)`, so the only
    changes were `PARAMS.laneCount: 3 -> 1` in `src/traffic.ts` and the
    call-sites that hardcoded a lane index or count: `main.ts`'s
    `BRAKE_LANE: 1 -> 0`, and `spec/phantom-jam.test.ts`'s `createRoad`/
    `applyBrake` calls. One genuine geometry gap surfaced doing this: the
    static SVG markup in `index.html` (three `<rect class="lane">`s, two
    `<line class="lane-line">` dividers) is a second, parallel
    representation of lane layout that isn't generated from
    `src/viewShared.ts`'s `LANE_Y`/`LANE_HEIGHT` constants (the actual
    source both view modules read from) — reducing the lane count required
    editing both, by hand, and nothing would have caught a mismatch between
    them short of looking at the rendered page. `LANE_Y`/`LANE_HEIGHT`
    collapsed to a single lane filling the same 10px-margined road surface
    the old three-lane layout used; the two divider `<line>`s and the now-
    dead `.lane-line` CSS rule were deleted; both view `aria-label`s dropped
    "Three-lane" for "Single-lane". `spec/phantom-jam.test.ts`'s "lanes are
    independent" test was deleted outright (there's only one lane to be
    independent from), and its "only the targeted car changes" test was
    rewritten to check an adjacent car in the *same* lane instead of a
    separate one. One test broke doing this: the "resets to an exactly
    uniform flow" test's `expect(stdev).toBe(0)` failed with
    `2.220446049250313e-16` — the exact-zero assertion had only held for the
    old 78-car (3x26) total by floating-point coincidence, not as a true
    invariant (the same rounding phenomenon moment 12 already documented,
    surfacing here in a stats calculation instead of the physics) — fixed by
    asserting `toBeLessThan(1e-9)` instead, with a comment explaining why.
    Verified with `pnpm check` (18/18), `pnpm test:e2e` (9/9, no e2e file
    changes needed), and Playwright screenshots at 1920x1080 and 390x844 in
    both free-flow and triggered-jam states confirming correct single-lane
    rendering, jam-band overlay, and car colour transitions in both views
    ([`3e888b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/3e888b9)).

14. **A fourth bug report, and this one was real: the average-speed readout
    could rise after a jam got worse.** "At high density, speed used to be
    low from congestion — after Trigger small brake it got *faster* —
    that's not fixed, fix it or explain it." A throwaway probe (never
    committed) ran density=40 with a real reaction delay, applied the brake,
    and logged `speedStats().mean` every 20 simulated seconds: it rose from
    0.2384 to 0.8177 over ~200 seconds while `jamIntensity` climbed past 0.5
    over the same window — genuinely more congested by the model's own
    disruption measure, reading as faster by the readout's. The mechanism:
    the optimal-velocity model's nonlinearity can redistribute a too-tight
    high-density equilibrium into a few near-stopped platoons separated by
    wide-open gaps close to `desiredSpeed`, and a plain arithmetic mean over
    all cars' speeds gets dominated by however many of them landed in the
    open gaps — exactly backwards from what "average speed" should mean
    when some cars are stopped. This is a real conceptual bug, not a UI
    glitch: traffic engineering answers this with the harmonic ("space-
    mean") speed, `N / sum(1/speed_i)`, which one stopped car pulls toward
    zero regardless of how many others are moving fast. Added
    `spaceMeanSpeed()` in `src/traffic.ts` alongside — not replacing —
    `speedStats()`, specifically so `jamIntensity`'s existing pairing with
    `speedStats()`'s arithmetic mean/stdev (and every threshold already
    tuned against it) stayed untouched; switched only `main.ts`'s
    `#mean-speed` readout to the new function. Re-ran the same density=40
    scenario against `spaceMeanSpeed` and confirmed it stays monotonically
    below the pre-brake equilibrium instead of rising, and encoded that as a
    new spec test rather than leaving it as a one-off probe. Verified with
    `pnpm check` (18/18, including the new test), `pnpm test:e2e` (9/9), and
    a browser check at density=40 post-jam showing "Average speed 0.19" — a
    plausible, non-paradoxical low reading
    ([`6493c40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/6493c40)).

15. **Matching a reference video exactly, on an explicit repeated request,
    rather than treating it as inspiration.** The user supplied a video of a
    ghost-traffic-jam demo (a ring and a straight-road segment) and asked for
    Ring road/Straight road to look "一模一样" (exactly identical) to it —
    elements, animation, model, design — repeating the emphasis rather than
    leaving it as a loose stylistic nudge. Four concrete design ambiguities
    were resolved by asking rather than guessing before any code changed:
    whether the jam indicator should become the video's green tapered
    "swoosh" (yes, replacing the red rectangle), whether cars should switch
    to the video's blue→red gradient (yes, replacing the 4-state
    green/blue/yellow/red palette), whether the abstract Wave view should be
    restyled to match too (no — left as-is, since it's a deliberately
    different abstraction, not part of the video's own visual vocabulary),
    and whether to add van/truck variety (no — one uniform sedan silhouette).

    Two things had to be traced from the code, not guessed, to get the result
    right: which end of a jam band is the "head" versus the "tail" for the
    comet shape's taper (`gapAhead()`'s `(i + 1) % cars.length` in
    `src/traffic.ts` confirmed higher car-array index = further ahead, so the
    band's `end` is the downstream head and its `start` is the upstream tail
    growing into fresh traffic — the taper points the wrong way if this is
    guessed instead of traced), and the ring track's actual colour (an
    earlier, lower-resolution frame read as light grey; re-sampling a
    higher-resolution extracted frame corrected it to a sage/olive green,
    `#93a97e`, before it was committed anywhere).

    The redesign was kept confined to the rendering layer on purpose: a
    single generic `buildCometPath()` (parameterised by abstract
    `centerAt(t)`/`normalAt(t)` functions) drives both the linear (Straight
    road) and circular-arc (Ring road) comet shapes, mirroring how
    `buildVehicle()`/`ringPoint()` already share logic across those two
    views, so the redesign didn't quietly reopen the "shared code guarantees
    the two demos stay visually identical" invariant moment 9 established.
    `viewShared.ts` deliberately ended up with two parallel tracks instead of
    one — `speedState()`/`renderLinearJamBands()` (4-state, red band, kept
    for Wave view only) alongside the new `vehicleSpeedState()`/
    `renderRingCometBands()`/`renderLinearCometBands()` (3-state, green
    comet, used by Ring road and Straight road) — rather than a single
    function branching on caller, so Wave view's explicit "leave it alone"
    requirement couldn't be accidentally broken by a future edit to the
    shared path. `src/traffic.ts` was not touched at all — this was a
    rendering-only change, verified before committing by grepping for every
    test's dependency on the old vocabulary
    (`speedState`/`.vehicle-headlight`/`.vehicle-taillight`) and confirming
    none existed beyond `.vehicle-body`'s `rx` and `.vehicle.braking`'s
    presence, both preserved. `pnpm check` and `pnpm test:e2e` passed on the
    first run after the full edit, and Playwright screenshots of both views
    post-brake confirmed the new sprite, palette, road colours, and green
    comet band all render as intended
    ([`01caff8`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/01caff8),
    [`dd0a4df`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-lilth2/commit/dd0a4df)).

## Before you ship

`pnpm check:evidence` verifies citations resolve to real commits.
