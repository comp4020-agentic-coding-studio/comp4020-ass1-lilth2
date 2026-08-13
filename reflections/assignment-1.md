# Assignment 1 reflection

**The breakthrough.** I trusted the green checks longer than I should have.
Everything mechanical passed — the physics unit tests, the build, the lint,
even a full Playwright suite across both marking viewports — and I nearly
called it done. What actually broke the prototype only showed up when I sat
and watched the rendered page at maximum density for long enough: the
stop-and-go wave I'd built the entire assignment around would form, then
quietly dissolve back into an impossible uniform-max-speed state. No test had
caught it because no test ran long enough to see it. Tracing the simulation by
hand past that window found the real bug — cars numerically passing through
each other under coarse time steps — and the fix went into the model itself,
not into loosening a threshold to make the symptom disappear. The checks told
me the code did what I'd told it to; only looking told me what I'd told it to
do was wrong.

**What this changes.** I've treated "tests pass" and "it works" as nearly the
same claim. They're not — a test only knows what its author thought to ask,
and mine hadn't thought to ask about anything past 400 simulated seconds. Going
forward I want to hold onto the discipline this assignment forced: when a
result is surprising, look at it directly before deciding whether to trust it,
and when a bug surfaces, ask whether my test coverage was blind to that
*class* of problem, not just this one instance of it. A green suite is
evidence, not proof, and the gap between those two is exactly where this bug
was hiding.
