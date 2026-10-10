---
name: plan
description: Turn a bug report, a problem description or a feature idea into a spec under docs/specs/ with work items that /build dispatches to workers. The planning seat; run it at high effort. Use at the start of any new piece of work on this repository.
argument-hint: <the bug, problem or feature, in a sentence or a pasted report>
---

# Plan

You are planning, not building. The output is `docs/specs/<slug>.md` (from `docs/specs/TEMPLATE.md`),
one backlog line per work item in `REQUIREMENTS.md`, and a merged pull request holding both. Workers at
a cheaper model then build each item from the spec alone, so the spec must stand on its own.

## 1. Place

Work in a worktree of your own (CLAUDE.md, rule 1); the guard hook refuses commits anywhere else. Run
`npm run board` and read the notes: someone may be in the files you are about to plan around.

## 2. Understand before writing

- **Bug** (the game does something it should not): find the code path, name the test file and what the
  failing assertion would say, and state the root cause. Usually one item of size S.
- **Problem** (a felt gap, a confusing screen, a balance complaint): read the modules involved
  (`docs/ARCHITECTURE.md`), the rules they implement (`docs/RULES.md`, `docs/FIDELITY.md`), and the
  tests that pin them, then decide what change answers it.
- **Feature**: the same reading, plus the rule question. The order for any rule the game lacks or
  changes is in CLAUDE.md (the private notes under `ref/`, then the open-source projects
  `docs/RULES.md` cites, then the owner). Where the request leaves a fork that changes what gets built,
  ask the owner now, in one `AskUserQuestion` call with at most three questions, each with a
  recommended option. Do not interview beyond that; for a large or vague feature, run the
  `requirements` skill at tier small or medium instead.

Say in the spec which rules came from where. Never name another game or say a rule or a look was
taken from one, anywhere in the spec or the backlog line (CLAUDE.md, public-repo rule).

## 3. Write the spec

Copy `docs/specs/TEMPLATE.md` to `docs/specs/<slug>.md` and fill every section. Work items:

- independent of one another wherever the code allows; a shared surface (a type in `state.ts`, an
  action, the save version, a test helper, a theme token) is changed by one item that goes first;
- each small enough for one worker session: S (subagent: an hour or less, a few files), M or L (task
  chip, the owner watches it);
- each names its files, acceptance bullets a test can check, the tests that are its definition of done,
  and what it depends on. Write the acceptance as the game's behaviour, not as code.

Allocate R-numbers after the highest in `REQUIREMENTS.md` and add one line per item under
`## Phase 12 — Planned work`:
`- [ ] **R-xxxx <title>** — docs/specs/<slug>.md, item W1, size S.`
The worker ticks that line in its own pull request; nobody else edits it.

For a spec of size L or with more than four items, run `/critique --depth quick docs/specs/<slug>.md`
and fold in what it finds.

## 4. Hand it over

Show the owner the goal, the item list with sizes, and the decisions and open questions, in a short
message. On their go: commit as `R-xxxx..R-yyyy: plan <slug>`, push, open the pull request, merge it
(a spec needs no review pass), post a board note naming the spec and the shared surfaces, then run
`/build docs/specs/<slug>.md`. If the owner changes the plan, change the spec first.
