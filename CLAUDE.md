# CLAUDE.md — autonomous build loop

This repo is New World, a browser strategy game of founding colonies and leading them to independence. The backlog is
[REQUIREMENTS.md](REQUIREMENTS.md). Work through it hands-off using the protocol below.

## One iteration

1. **Pick.** Open REQUIREMENTS.md. Choose the first `[ ]` or `[~]` requirement in the lowest
   phase that still has open items. Skip `[!]` items unless their stated blocker is now resolved.
   Do exactly one requirement per iteration (R-1009 may spawn sub-items; treat each as one).
2. **Mark `[~]`** and commit that one-line change: `R-xxx: start`.
3. **Read before writing.** Read the requirement, its appendix rows, `docs/FIDELITY.md`, and the
   files you will touch. Do not re-read the whole backlog. If the rule tables in `src/engine/data/*`
   and the appendix disagree, fix the appendix in the same commit.
4. **Implement** the smallest change that satisfies every acceptance bullet. Put rule numbers in
   `src/engine/data/*`, never inline. Write the tests named in the **Verify** line first or
   alongside; they are the definition of done.
5. **Verify.** While you work, run only the tests for what you are touching:
   `npm test -- test/unit/engine/colony/food.test.ts`, or `npm run test:e2e -- colony` for one
   spec. Before the commit, run `npm run check` (lint, typecheck, unit tests, build) once. Run
   `npm run test:e2e` only if the Verify line names e2e or you changed `src/ui` or `src/app`, and
   `SIM=1 npm test` only if it names sim tests. All previously passing tests must still pass. Fix
   regressions before anything else.
6. **Record fidelity.** For every `[VERIFY]` value you implemented, add a row to
   `docs/FIDELITY.md` (value used, source, confidence). If unresolved, use the backlog value and
   move on.
7. **Mark `[x]`** in REQUIREMENTS.md and commit everything: `R-xxx: <title>` with a 2–5 line body
   listing what was built and which tests cover it.
8. **Report** in one short paragraph: what was done, test counts, anything flagged. Then start
   the next iteration if the session budget allows.

## Blocking rules

- Three failed attempts at the same acceptance bullet → mark the item `[!] <one-line reason>`,
  commit, and move on. Never leave a `[~]` item without a commit describing its state.
- If a requirement contradicts a constraint in REQUIREMENTS.md §0, the constraint wins; note the
  conflict under the item and implement the constraint-compatible subset.
- Never add a runtime dependency unless the requirement names it. Dev dependencies are fine if
  they serve a Verify line.
- Never include or fetch anyone else's game assets or text (constraint C1). If a test needs art, draw it procedurally.
- Do not ask the user questions. Make the choice a careful engineer would make, write it in the
  commit body, and continue.

## Sharing the machine

Many sessions work on this repo at once, and the full suites are the main cost. Keep them rare.

- Work in a git worktree of your own, never in a checkout another session is using.
- Do not re-run a whole suite to look at one failure; re-run the one file or the one test.
- A test that times out when the machine is busy and passes alone is not a regression. Check
  `uptime` before chasing it, and do not raise timeouts or write a second Playwright config.
- Each Playwright run builds and serves its own copy on its own port; never start a preview
  server for tests by hand. The time budgets in `test/e2e/budget.spec.ts` run in CI, or with `BUDGET=1`.
- The balance simulation (`SIM=1 npm test -- balance`) takes minutes of every core. Run it for
  R-1009 only.
- If a test command is killed or times out, run `npm run sweep` so its workers and browsers do
  not go on running.

## Conventions

- TypeScript strict, ESM, no default exports from engine modules, no classes in `GameState`.
- Engine functions are pure: `(state, ...args) => newState | result`. Side effects only in `src/ui` and `src/app`.
- Every rule table is a `const ... as const satisfies Record<...>` with a snapshot test.
- Test files mirror source paths: `src/engine/colony/food.ts` → `test/unit/engine/colony/food.test.ts`.
- Commit messages: `R-xxx: imperative summary`. One requirement per commit except for trivial
  follow-up fixes (`R-xxx: fix <what>`).
- Keep `docs/ARCHITECTURE.md` current when you add a top-level module; one paragraph per module.

## Commands

```bash
npm run check          # lint + typecheck + unit tests + build (must pass before every commit)
npm run test:e2e       # playwright, chromium
npm run sweep          # end test workers, browsers and servers left by a killed run
SIM=1 npm test         # slow headless simulations
npm run dev            # local dev server
```

## Status snapshot

Phases are ordered 0 → 10. Do not start Phase N+1 while Phase N has `[ ]` items, except that
Phase 10's R-1006 (visual pass) and R-1009 (balance) are deferred until everything else is `[x]` or `[!]`.
