---
name: bughunt
description: Find real bugs in the engine or the UI, each with a concrete reproduction, write them up as a spec of size-S items, and dispatch the fixes with /build. Run it on Opus 5.5 at medium effort, not on the planning model. Use when the owner asks for a bug hunt or a sweep of an area.
argument-hint: [area, such as src/engine/diplomacy.ts or "the colony screen"]
---

# Bug hunt

1. Pick the area: the one given, or the module least recently touched by a bug fix
   (`git log --format=%s -- src/engine | grep -c Fix` per file is a fair guide). Read it with its
   callers, its rules in `docs/RULES.md`, its invariants (`src/engine/invariants.ts`) and its tests.
2. Hunt for what is reachable and wrong: an action that throws instead of failing validation, an
   invariant a sequence of legal actions breaks, a rule the code and `docs/RULES.md` disagree on, state
   left behind when something is removed, a test that passes for the wrong reason. `/critique --depth
   quick <file>` is a good opening move. Confirm each bug with a failing test or a written-out sequence of
   actions; a suspicion is not a finding.
3. Write `docs/specs/bugs-<area>-<date>.md` from the template: one size-S item per confirmed bug, each
   with the reproduction as the test to write, the root cause, and the smallest fix. Add the backlog
   lines, commit, push, merge the spec, post a board note.
4. Run `/build` on it. Report the bugs found, the ones fixed and merged, and any left open.
