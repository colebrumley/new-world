# <Title>: spec for R-xxxx to R-yyyy

Written by `/plan` on <date>. Status: proposed | approved | built.

**The request, in the owner's words:** one paragraph. What is wrong, or what is wanted, and why.

## Goal

One or two sentences a worker can hold in mind. What the game does when this is done.

## Non-goals

What this deliberately does not do, so that no worker widens it.

## Rules and sources

Every rule this touches, one line each: what the game will do, and where the rule came from (this
game's own choice; the private notes; an open-source project cited as `docs/RULES.md` shows). Where the
sources were silent or disagreed, the choice made and who made it.

## Shared surfaces

Types in `src/engine/state.ts`, actions, the save version, helpers under `test/`, rule tables, theme
tokens: anything more than one item touches. Say which item changes each, and that it goes first.

## Work items

Independent where possible; each small enough for one worker session. Size S is a subagent (an hour's
work or less, few files); M and L are task chips (the owner watches them). An item names the files it
will touch, acceptance bullets a test can check, the tests that prove it (the definition of done), and
what it depends on.

### W1 — <title> (R-xxxx, size S, depends on: nothing)

Files: `src/engine/foo.ts`, `test/unit/engine/foo.test.ts`, `docs/RULES.md` (section <name>)

Acceptance:
- ...
- ...

Verify: `npm test -- test/unit/engine/foo.test.ts`; `npm run check`.

### W2 — <title> (R-yyyy, size M, depends on: W1)

...

## Open questions and decisions

Decisions the owner made during planning, with the alternative rejected. Questions left open, and
what a worker should do if it meets one (the default: build the smaller reading, say so in the PR).
