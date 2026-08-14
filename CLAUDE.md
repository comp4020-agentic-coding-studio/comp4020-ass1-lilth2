# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## This week: phantom traffic jams

**Thesis.** Phantom traffic jams happen when small braking events ripple
backward through traffic. The jam is not caused by an obstacle; it is caused
by delayed reactions and unstable spacing. "No crash. No roadworks. Still a
jam." This challenges the intuition that every jam has a visible cause.

**Core interaction (the whole prototype).** One shared `RoadState`, N cars
running a real car-following model (Bando et al.'s optimal-velocity model)
with a reaction delay, presented through **two switchable demo modes** plus
one always-visible auxiliary view:

- **Ring road** — cars looping a closed circular track. There's no
  bottleneck, no intersection, and no start/end to blame a jam on: this is
  what makes "the jam is created by the drivers' reactions, not an obstacle"
  physically obvious.
- **Straight road** — the same cars in a line, left to right. This is what
  makes "the wave travels backward while every car still moves forward"
  physically obvious: a brake near the front and the following cars' braking
  lights step backward one by one.
- **Wave view** — the original abstract dots-on-a-strip rendering, kept as a
  small always-visible auxiliary layer beside/below whichever demo mode is
  active (see the topic boundary below for why it's never the primary view).

A **mode-tabs** segmented control (`role="tablist"`) above the demo area
switches which of Ring road / Straight road is the primary view; switching
tabs never resets the simulation or restarts an animation loop — all three
renderers read the same `RoadState` inside one `render()` tick regardless of
which tab is visible (see "Three synchronized views" below). Four sliders —
**traffic density**, **reaction delay**, **following distance**, and
**perturbation strength** — act on whichever demo is active, because both
demos read the same `SimParams`/`RoadState`. A **"Trigger small brake"**
button perturbs one fixed car (car 0) by the current perturbation strength,
in whichever mode is active. A **Reset** button restores the exact uniform
starting state for whichever demo is active (there is only one `RoadState`,
so this always resets both demos and the metrics at once).

**All four sliders are now live — this reverses an earlier narrowing, on an
explicit user request, not a unilateral change.** An earlier iteration of
this prototype fixed reaction delay/following distance/brake strength as
constants (`FIXED_REACTION_DELAY = 1.0`, `FIXED_FOLLOWING_DISTANCE = 6`,
`FIXED_BRAKE_STRENGTH = 0.2`) because three simultaneous free sliders made it
too easy to land on a combination where nothing demonstrable happened. That
reasoning still holds for a *single* demo. It stopped applying once there
were two demos that need to be **worth switching between**: Ring road and
Straight road tell two different halves of the same thesis, and a visitor
who can't adjust reaction delay or following distance has no way to see *why*
the wave in Straight road grows, or to feel the "no bottleneck needed" point
in Ring road change with spacing. The user asked for this explicitly and in
detail (see `PROCESS.md`), which is the "re-raised as a question" this file
has asked for at every previous reversal — so the sliders came back, and this
paragraph (replacing the old "should not re-expose" language) is that
question's answer, not a silent reversal. The density/following-distance
ranges and defaults from the earlier narrowing (8–40 cars/lane, following
distance bounded to the model's monotonic 6–12 arm) are unchanged.

The uniform starting state produced by `createRoad` is an exact fixed point of
the model in real-number arithmetic — verified by direct probing, not assumed.
**In floating point, that fixed point is only stable at some densities, not
all.** At the two densities in the current 24-40 "sustains a jam" band where
the optimal-velocity model's linear-stability sensitivity is highest (26 and
32, at the fixed following distance of 6), residual floating-point rounding —
present whether or not the brake is ever triggered — is itself a real,
nonzero seed perturbation, and given long enough (roughly 70-90 real seconds
at density 26, roughly 15-20 real seconds at density 32, at this app's ~30x
simulated/real-time ratio) it amplifies into a full jam with no brake ever
triggered. Densities 20 and 40 stay at machine-epsilon noise indefinitely
(genuinely stable). So a visitor who dials to density 26 or 32 and just
leaves the page running, without ever clicking "Trigger small brake", can
watch a full stop-and-go wave form on the single lane on its own — this is
the same mechanism the whole prototype is about (an arbitrarily small nudge,
amplified by unstable spacing), not a bug; see `PROCESS.md` for the probe
that confirmed it (recorded there from when this was still a three-lane
design, but the underlying floating-point finding is the same for one lane).
The only way a wave starts *deliberately* is still the "Trigger small brake"
click; whether that one-shot nudge gets absorbed within a few car-lengths or
ripples into a lasting, circulating wave depends entirely on the density
dialled in (delay and following distance are now fixed — see above).
This is a deliberate, considered change from the original one-slider,
no-perturbation-control design (see below and `PROCESS.md`), not scope creep:
without a perturbation to watch propagate or die out, a visitor arriving at a
page already sitting at its stable equilibrium has nothing to *watch happen*,
and the interaction (dial in a regime, then trigger a nudge and see whether it
sticks) reads far more clearly than waiting for spontaneous onset at a
density slider's extreme.

**Three synchronized views of the one simulation.** The page renders the same
`RoadState` three times every tick, unconditionally, regardless of which mode
tab is active: "Ring road" (`src/ringRoadView.ts`, cars rotated tangent to
their direction of travel around a circular track), "Straight road"
(`src/straightRoadView.ts`, the original linear `translate(x, y)` rendering,
car-shaped vehicles with headlights/taillights on a dark road surface), and
"Wave view" (`src/waveView.ts`, cars as coloured dots — kept because the
ghost-wave shape reads more clearly as an abstraction than as traffic). All
three are driven from inside the same `render()` tick in `main.ts`, never as
independent animation loops — the mode tabs only toggle `hidden`/
`aria-selected` on the Ring road/Straight road `<section>`s, they never start
or stop a renderer. That's what makes "all three views always agree" true by
construction rather than by coincidence, and it's why adding the tabs (see
above) doesn't reopen the old "no toggle between views" concern: a toggle
that *stopped* rendering the hidden view would risk drift; toggling
visibility on a view that keeps rendering underneath cannot. `src/
viewShared.ts` is the single source of truth all three renderers pull their
position→pixel mapping, speed→colour mapping, and cartoon-vehicle markup
from (`buildVehicle()`, `speedState()`, `jamBandsForLane()`), so Ring road and
Straight road are guaranteed to use identical car colours and brake-light
rules by construction, not by convention — the two demos differ only in
`ringPoint()`'s circular placement vs. `straightRoadView.ts`'s linear one.
Ring road and Straight road are two angles on one explainer, not two
isolated pages: they share controls, metrics, and the auxiliary Wave view,
and neither can be reached without the other (there is one `/` page, not a
Ring road page and a Straight road page).

**Topic boundary — this is the whole scope, not a starting point:**

- A manual brake trigger is explicitly in scope (see above) — it was
  re-raised as a question rather than added unilaterally, and the original
  no-perturbation design is documented in `PROCESS.md` alongside why it
  changed. The lane count has itself changed twice, each re-raised as a
  question rather than done unilaterally: the original single ring gained
  two more lanes alongside the brake trigger, then was narrowed back to a
  single lane once a bug report about lanes appearing to interact turned out
  to need explaining rather than fixing and the extra lanes weren't adding
  anything the density/delay/spacing mechanism needed (see `PROCESS.md` for
  both changes). What remains firmly out of scope,
  unchanged from the original boundary: no intersections, no lane-changing, no
  scoring, no sound, no driver "emotions", no traffic-light control, no game
  mechanics of any kind. If a feature doesn't serve the
  density/delay/spacing → wave-propagation-or-absorption mechanism, it doesn't
  belong here — re-raise it as a question instead of building it.
- The simulation must be a real car-following model (e.g. the optimal-velocity /
  Bando-style model, or an IDM variant) with an actual reaction-time term —
  not a random-visual-effect stand-in for one. The point of the piece is that
  the wave is a real emergent property of the model, so faking it defeats the
  thesis. The one deliberate exception is `applyBrake`: a discrete, one-shot
  user-triggered perturbation, modelled as a separate pure function called
  once between `step()` calls rather than folded into the per-tick physics —
  it only ever nudges the model, it never decides whether the nudge sticks.
- Simulation stepping must be a pure function of state (`step(state, dt,
  params) -> state`), independent of `requestAnimationFrame` and wall-clock
  time. Rendering reads simulation state; it never drives it. This is what
  makes the core interaction testable headlessly — a test can call `step()` N
  times and assert on the resulting speed distribution without racing real
  time.
- **Following distance is a live slider (`#following-distance`) bounded to
  6–12, the monotonic arm of its range, defaulting to 6.** The
  optimal-velocity model is non-monotonic in this parameter outside 6–12 —
  very tight spacing can, counterintuitively, be *more* stable than a
  slightly looser one — so 6–12 is the only range ever exposed, in either its
  fixed-constant or live-slider incarnation. If this parameter's exposed
  range is ever widened, it must not cross into the non-monotonic arm below
  6, or say so honestly rather than pretend the full range is well-behaved.
- **Prevention and cure are not symmetric, and the copy says so.** Increasing
  following distance reliably prevents a triggered brake from turning into a
  sustained wave. It does *not* reliably dissipate a wave that has already
  fully formed — probing this showed jam intensity staying essentially flat
  for 150 simulated seconds after loosening spacing mid-jam. The "What makes
  it disappear?" copy states this asymmetry directly instead of implying
  loosening the slider mid-jam will fix it.

**Design principles:**

- Speed is the only channel that needs to read at both marking viewports:
  encode it redundantly (colour **and** a numeric/text readout), never colour
  alone.
- Every view is SVG with a `viewBox`, not a fixed-pixel canvas — each must
  redraw correctly at 1920×1080 and at 390×844 without clipping or overflow.
  The Straight road and Wave views render the ring as a straight strip (a
  linear position → pixel mapping), not a polar layout, so the wraparound
  seam is masked with an edge-fade gradient rather than pretending the strip
  has no ends — **every linear view** needs this masking independently
  (adding the Straight road view, then called the Real road view, without
  its own edge-fade gradients — it needs asphalt-coloured fade stops, not the
  Wave view's page-background-coloured ones — was caught and fixed before
  shipping, not after). The Ring road view instead renders position as an
  actual point on a circle (`ringPoint()` in `src/viewShared.ts`), so it has
  no seam to mask and needs no edge-fade — its own constraint is that the
  circular `<svg viewBox="0 0 300 300">` must stay square and unclipped down
  to 390px wide.
- Resizing mid-simulation re-renders layout only; it must never reset or restart
  the simulation state.
- The unbuilt page (before JS runs, or on a slow connection) must show the
  static road and sliders without layout breakage — animation is an
  enhancement on top of a page that already looks correct.
- The one-line explanation text and all readouts (jam intensity, average
  speed, stopped-car count, wave direction, stability zone) must be derived
  live from simulation state on every render, never hardcoded — they're the
  thing that makes the state legible without staring at car colours, and
  since they're shared across both demo modes, they must read correctly no
  matter which tab is active.
- **The "Average speed" readout is `spaceMeanSpeed` (harmonic mean), not
  `speedStats().mean` (plain arithmetic mean).** A bug report found the
  arithmetic mean could read as *faster* after a brake-triggered jam at high
  density than the road's pre-brake equilibrium — the optimal-velocity
  model's nonlinearity can redistribute a too-tight equilibrium into a slow
  platoon plus wide-open, near-desiredSpeed gaps, and the arithmetic mean can
  end up dominated by the fast gaps even though the road is more congested,
  not less (see `PROCESS.md` for the probe: at density=40, arithmetic mean
  rose 0.2384→0.8177 over ~200 simulated seconds after a brake). The harmonic
  mean doesn't have that paradox — it falls monotonically as a jam worsens,
  which is also the traffic-engineering-correct definition of "average
  speed" (space-mean, not time-mean). `jamIntensity` still uses
  `speedStats().stdev` internally and is unaffected by this — only the
  visible readout changed.

**Accessibility (graded here, not optional):**

- Every slider is a native `<input type="range">` with a `<label>`, and every
  button — including the mode tabs — is a native `<button>`, so keyboard
  control (arrow keys, tab focus, visible focus ring) is free — don't rebuild
  any of it as styled `div`s.
- The mode tabs use `role="tablist"`/`role="tab"`/`aria-selected` and
  `role="tabpanel"` on the two demo `<section>`s, so a screen reader
  announces which demo is active the same way sighted tab-switching does.
- The simulation's state (free flow / stop-and-go wave) must also be announced
  as text, not only shown visually — a `data-testid`/`data-state` attribute or
  ARIA live region text readout, since the wave itself is a purely visual
  signal otherwise.
- Respect `prefers-reduced-motion`: fall back to a discrete step-and-redraw
  mode (e.g. update the SVG every N simulation ticks instead of every
  animation frame) rather than a continuously animating scene — including the
  brake-flash effect, which must fall back to a static fill rather than a
  CSS animation. **Every view with its own brake indicator needs this fallback
  independently** — the Straight road view's taillight-flash animation
  (written when it was still called the Real road view) was found missing a
  reduced-motion fallback while the Wave view's dot brake-flash already had
  one, and was fixed to match before shipping; the Ring road view reuses the
  identical `buildVehicle()` markup and CSS classes, so it inherits the same
  fallback rather than needing its own.

**Test and verification commands for this feature:**

- `pnpm dev` while building; `pnpm check` before every commit (typecheck, build,
  lint, spec/tests all in one).
- `spec/phantom-jam.test.ts` (this week's spec test, alongside the invariants):
  call the pure `step()`/`applyBrake()` functions directly — no DOM, no
  timers — to assert (a) "Trigger small brake" actually changes the targeted
  car's state and only that car's, (b) high density + high reaction delay
  ripples the same brake into a materially worse jam than low density + no
  delay, (c) increasing following distance turns the same jam-triggering
  brake into a non-event, (d) Reset reproduces the exact fresh state even
  after the simulation has run and jammed, (e) no two cars ever occupy the
  same position on the lane, even long after a brake-triggered wave forms
  with delay active, and (f) `spaceMeanSpeed` reads a severe high-density
  jam as slower, never faster, than the pre-brake equilibrium — the
  regression test for the arithmetic-mean paradox below. Every threshold
  here was found by actually running the model (throwaway `pnpm dlx tsx`
  probes, deleted after use — see `PROCESS.md`), not picked to make an
  assertion pass. This is the one line of the published spec that's
  mechanically checkable ("the visitor does something that changes what they
  see"); the rest (scoping, point of view, whether the explanation lands) is
  for the retro, not a test.
- `e2e/phantom-jam.spec.ts`: real-browser checks for both marking viewports —
  no horizontal overflow at either, no control overlapping another at
  390×844, the on-page state label/readouts actually changing when "Trigger
  small brake" is clicked and Reset restoring free-flow, full keyboard
  operability, survival of a resize mid-simulation; plus, for the two-demo
  split specifically: both mode tabs present and switching one actually
  changes the visible primary demo (and its explainer text), Ring road cars
  carry a varying `rotate(...)` transform while Straight road cars don't,
  cars visibly move in both modes, "Trigger small brake" lights up brake
  lights in whichever mode is active, jam intensity reports jamming
  regardless of the active tab (proving the shared-`RoadState` claim, not
  just a shared parameter set), Reset zeroes it from either tab, and no
  horizontal overflow at 390×844 in either mode.
- Manual verification before shipping: 1920×1080 and 390×844 in a real
  browser, in both the default and a triggered-jam state, in **both** demo
  modes (checking that switching tabs mid-jam shows the same jam-intensity
  reading, not just that each mode looks fine in isolation); a keyboard-only
  pass (tab to each control including the mode tabs, operate it, check focus
  rings); a resize mid-simulation; a throttled/slow-network load; and a no-JS
  baseline. A full-page screenshot at 390×844 can make the Straight road
  view's packed vehicles look like a solid blob purely from image
  downscaling — before treating that as a legibility bug, check a
  zoomed/clipped capture at actual resolution first.

**The agent should not:**

- Add any mechanic beyond the four sliders (density, reaction delay,
  following distance, perturbation strength), the two demo-mode tabs, and the
  two buttons already in scope — no scoring, no sound, no lane-changing, no
  intersections, no traffic lights, no driver "emotions", no game mechanics of
  any kind. Re-raise anything beyond that as a question instead of building
  it.
- Narrow reaction delay, following distance, or brake strength back to fixed
  constants without re-raising it as a question first — they were narrowed
  once (see `PROCESS.md`) and deliberately re-exposed as live sliders once a
  second demo mode existed (see "Core interaction" above); un-reversing that
  again is itself a scope decision, not a routine tweak, same as the original
  narrowing was.
- Fake the emergent wave with a scripted animation or a random trigger instead
  of a real car-following calculation. `applyBrake` may perturb a car's speed
  directly, but it must never decide or bias the outcome (absorbed vs.
  sustained) — that has to remain an emergent property of `step()`.
- Couple the simulation's correctness to `requestAnimationFrame` timing, or
  write a test that depends on wall-clock delays.
- Tune test thresholds (jam-intensity cutoffs, density/delay/spacing values)
  to match whatever the current implementation happens to output — find them
  by actually running the model (a throwaway probe script, deleted after use)
  and reasoning about the result, not by curve-fitting to pass.
- Expose the non-monotonic (<6) arm of the following-distance slider, or hide
  the prevent-vs-cure asymmetry in the copy to make the mechanism look tidier
  than it is.
- Give any view (Ring road, Straight road, or Wave view) its own animation
  loop, or make the mode tabs stop a hidden view from rendering. All three
  render every tick from the same `RoadState` inside one `render()` call —
  that's the only thing that guarantees they can never show contradictory
  states. The mode tabs (see "Core interaction" above) only toggle which
  section is visible; this was re-raised as a question and deliberately
  added once there were two skeuomorphic demos worth switching between, but
  the underlying "always render everything, never gate rendering on
  visibility" rule is unchanged and still applies to any future view.
- Turn Ring road and Straight road into separate pages, or let either one be
  reached without the other, the shared controls, or the shared metrics —
  they are two views of one explainer, not two prototypes.
- Commit with `pnpm check` red, or skip the keyboard/reduced-motion
  requirements as "polish for later" — they're graded criteria, not nice-to-haves.
- Switch the "Average speed" readout back to `speedStats().mean` (plain
  arithmetic mean) — it was deliberately changed to `spaceMeanSpeed` (harmonic
  mean) to fix a real paradox where a worsening jam could read as *faster*
  (see above and `PROCESS.md`). If a future change needs the arithmetic mean
  for something else, add a new function rather than repurposing
  `speedStats()`'s pairing with `jamIntensity`.
- Re-expose more than one lane (`PARAMS.laneCount`) without re-raising it as a
  question first — it was deliberately narrowed from three lanes back to one
  (see above and `PROCESS.md`); reversing that again is a scope decision, not
  a routine tweak.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
