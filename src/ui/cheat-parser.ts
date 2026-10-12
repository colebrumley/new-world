// The cheat console's grammar (R-1061; docs/RULES.md "Cheats"): a typed line becomes a `cheat`
// action, a half-typed one its completions, and the specs a help sheet. Pure text and state, no DOM.
// Nothing here knows any one cheat: a line is read against a spec's arguments by their kinds alone,
// so a cheat added to CHEAT_SPECS is parsed, completed and listed with no change to this file.
import type { Action } from '../engine/actions';
import { CHEAT_SPECS, type CheatArg, type CheatArgKind, type CheatArgValue, type CheatSpec } from '../engine/cheats';
import { BUILDING_IDS, BUILDINGS } from '../engine/data/buildings';
import { FATHER_IDS, FATHERS } from '../engine/data/fathers';
import { GOOD_IDS, GOOD_NAMES } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { PROFESSION_IDS, PROFESSIONS } from '../engine/data/professions';
import { RESOURCE_IDS, RESOURCES } from '../engine/data/resources';
import { TERRAIN, TERRAIN_IDS } from '../engine/data/terrain';
import { CAPITAL_NAME, TECH_LEVELS, TRIBE_IDS, TRIBES } from '../engine/data/tribes';
import { UNIT_TYPE_IDS, UNIT_TYPES } from '../engine/data/units';
import type { GameState, PlayerId, UnitId } from '../engine/state';
import { unitLabel } from './unit-text';

/** Who is at the console: the power the cheats are for unless the line says `as`, and the active unit and its square. */
export interface CheatContext {
  readonly player: PlayerId;
  readonly here: { readonly x: number; readonly y: number } | null;
  readonly active: UnitId | null;
}

export type CheatParse = { readonly ok: true; readonly action: Action } | { readonly ok: false; readonly message: string };
export interface CheatHelpEntry { readonly usage: string; readonly about: string; readonly example: string }

// ---- words ----

interface Word { readonly text: string; readonly quoted: boolean }

/** One word of a line: what stands between double quotes (closed or not), or a run with no space or quote in it. */
const WORD = /"([^"]*)("?)|([^\s"]+)/g;

/** Split a line at its spaces, keeping what stands between double quotes as one word; a quote always begins a word. */
function split(text: string): { words: Word[]; open: boolean; trailing: boolean } {
  const words: Word[] = [];
  let open = false;
  for (const m of text.matchAll(WORD)) {
    const quoted = m[3] === undefined;
    words.push({ text: (quoted ? m[1] : m[3]) as string, quoted });
    open = quoted && m[2] === '';
  }
  return { words, open, trailing: !open && (words.length === 0 || /\s$/.test(text)) };
}

const quote = (s: string): string => (/\s/.test(s) ? `"${s}"` : s);
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// ---- the things a word can name ----

type NameKind = Exclude<CheatArgKind, 'amount' | 'count' | 'percent' | 'square' | 'place' | object>;

/** One thing a word may name: its id, the names it answers to, the word completion offers for it. */
interface Thing {
  readonly id: string;
  readonly names: readonly string[];
  /** Belongs to the power the cheat is for; such a thing is preferred when a word fits several. */
  readonly own: boolean;
  readonly offer: string;
  /** How it reads in a list of candidates. */
  readonly label: string;
}

const NOUNS = {
  colony: 'colony', unit: 'unit', good: 'good', unitType: 'kind of unit', profession: 'profession', father: 'Founding Father',
  building: 'building', tribe: 'tribe', settlement: 'settlement', power: 'power', terrain: 'terrain', resource: 'resource',
} as const satisfies Record<NameKind, string>;

const listed = <Id extends string>(ids: readonly Id[], name: (id: Id) => string): Thing[] => ids.map((id) => ({ id, names: [name(id)], own: false, offer: id, label: id }));

/** What a kind's word is chosen from: the state for colonies, units and settlements, the data tables for the rest. */
const THINGS = {
  colony: (state, player) => Object.values(state.colonies).map((c) => ({ id: c.id, names: [c.name], own: c.owner === player, offer: quote(c.name), label: quote(c.name) })),
  unit: (state, player) => Object.values(state.units).map((u) => ({ id: u.id, names: [unitLabel(u)], own: u.owner === player, offer: u.id, label: `${u.id} (${unitLabel(u)})` })),
  settlement: (state) => Object.values(state.settlements).map((s) => {
    const tribe = TRIBES[s.tribe];
    const name = `${tribe.adjective} ${s.capital ? CAPITAL_NAME.settlement : TECH_LEVELS[tribe.tech].settlement}`;
    return { id: s.id, names: [name], own: false, offer: s.id, label: `${s.id} (${name} at ${s.x},${s.y})` };
  }),
  power: (state) => state.players.filter((p) => !p.withdrawn && p.id !== state.crownPlayer).map((p) => ({ id: p.id, names: [NATIONS[p.nation].name, p.name, p.nation], own: false, offer: quote(NATIONS[p.nation].name), label: quote(NATIONS[p.nation].name) })),
  good: () => listed(GOOD_IDS, (id) => GOOD_NAMES[id]),
  unitType: () => listed(UNIT_TYPE_IDS, (id) => UNIT_TYPES[id].name),
  // as the game offers them in play: no profession a colonist cannot hold, no building left unused
  profession: () => listed(PROFESSION_IDS.filter((id) => PROFESSIONS[id].colonist), (id) => PROFESSIONS[id].name),
  building: () => listed(BUILDING_IDS.filter((id) => !BUILDINGS[id].unused), (id) => BUILDINGS[id].name),
  father: () => listed(FATHER_IDS, (id) => FATHERS[id].name),
  tribe: () => listed(TRIBE_IDS, (id) => TRIBES[id].name),
  terrain: () => listed(TERRAIN_IDS, (id) => TERRAIN[id].name),
  resource: () => listed(RESOURCE_IDS, (id) => RESOURCES[id].name),
} as const satisfies Record<NameKind, (state: GameState, player: PlayerId) => Thing[]>;

const isNameKind = (kind: CheatArgKind): kind is NameKind => typeof kind === 'string' && kind in THINGS;

/**
 * Does the text begin the thing's id, one of its names, or one of a name's words (reading on from
 * that word, so that quoted text of several words fits too)? `lower` is already lower case.
 */
function begins(thing: Thing, lower: string): boolean {
  if (thing.id.toLowerCase().startsWith(lower)) return true;
  return thing.names.some((name) => {
    const n = name.toLowerCase();
    return n.startsWith(lower) || [...n.matchAll(/[\s-]+/g)].some((gap) => n.startsWith(lower, gap.index + gap[0].length));
  });
}

// ---- reading one word as one kind ----

/** A word that will not do: `fatal` when no other reading of the line could save it, `several` when it fits more than one thing. */
interface Miss { readonly ok: false; readonly message: string; readonly fatal?: true; readonly several?: true }
type Read = { readonly ok: true; readonly value: CheatArgValue } | Miss;

const hit = (value: CheatArgValue): Read => ({ ok: true, value });
const miss = (message: string): Miss => ({ ok: false, message });
const NO_ACTIVE_HERE = miss('there is no active unit, so "here" is nowhere: give a square as x,y');
const nowhere = (): Miss => ({ ...NO_ACTIVE_HERE, fatal: true });

/** A whole number of zero or more that can be counted by ones, or null. */
function whole(digits: string): number | null {
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

function named(kind: NameKind, word: Word, state: GameState, player: PlayerId): Read {
  const noun = NOUNS[kind];
  const lower = word.text.toLowerCase();
  if (lower === '') return miss(`a ${noun} needs a name`);
  const things = THINGS[kind](state, player);
  // an exact id wins outright, then an exact full name; otherwise whatever the word begins
  const byId = things.filter((t) => same(t.id, lower));
  const exact = byId.length > 0 ? byId : things.filter((t) => t.names.some((n) => same(n, lower)));
  const found = exact.length > 0 ? exact : things.filter((t) => begins(t, lower));
  if (found.length === 0) return miss(`there is no ${noun} "${word.text}"`);
  const own = found.filter((t) => t.own);
  const among = own.length > 0 ? own : found;
  if (among.length === 1) return hit((among[0] as Thing).id);
  return { ok: false, several: true, message: `"${word.text}" could be any of these: ${among.map((t) => t.label).join(', ')}` };
}

function squareOf(word: Word, context: CheatContext): { readonly x: number; readonly y: number } | Miss | null {
  if (same(word.text, 'here')) return context.here ? { x: context.here.x, y: context.here.y } : nowhere();
  const m = /^(\d+),(\d+)$/.exec(word.text);
  const x = m ? whole(m[1] as string) : null;
  const y = m ? whole(m[2] as string) : null;
  return x === null || y === null ? null : { x, y };
}

function read(kind: CheatArgKind, word: Word, state: GameState, context: CheatContext): Read {
  const text = word.text;
  if (typeof kind === 'object') {
    if ('oneOf' in kind) {
      const fixed = kind.oneOf.find((w) => same(w, text));
      return fixed === undefined ? miss(`"${text}" is not ${kind.oneOf.length === 1 ? '' : 'one of '}${kind.oneOf.join(', ')}`) : hit(fixed);
    }
    // the first alternative the word fits; failing all, the one it fitted too well, or else all of them
    let several: Miss | null = null;
    for (const alternative of kind.anyOf) {
      const r = read(alternative, word, state, context);
      if (r.ok) return typeof alternative === 'object' && 'anyOf' in alternative ? r : hit({ kind: typeof alternative === 'string' ? alternative : 'word', value: r.value });
      if (r.fatal) return r;
      if (r.several) several ??= r;
    }
    return several ?? miss(`"${text}" is not ${describe(kind)}`);
  }
  switch (kind) {
    case 'amount': {
      const m = /^([+\-=]?)(\d+)$/.exec(text);
      const n = m ? whole(m[2] as string) : null;
      if (!m || n === null) return miss(`"${text}" is not an amount: 500 or +500 adds, -200 takes, =1000 sets`);
      return hit({ set: m[1] === '=', value: m[1] === '-' ? -n : n });
    }
    case 'count': {
      const n = whole(text);
      return n === null ? miss(`"${text}" is not a count: a whole number of zero or more`) : hit(n);
    }
    case 'percent': {
      const n = whole(text);
      return n === null || n > 100 ? miss(`"${text}" is not a percent: a whole number from 0 to 100`) : hit(n);
    }
    case 'square': {
      const at = squareOf(word, context);
      if (at === null) return miss(`"${text}" is not a square: x,y or here`);
      return 'ok' in at ? at : hit(at);
    }
    case 'place': {
      const at = squareOf(word, context);
      if (at !== null) return 'ok' in at ? at : hit({ kind: 'square', x: at.x, y: at.y });
      if (same(text, 'europe')) return hit({ kind: 'europe' });
      const colony = named('colony', word, state, context.player);
      if (colony.ok) return hit({ kind: 'colony', colonyId: colony.value as string });
      return colony.several ? colony : miss(`"${text}" is not a place: a square as x,y, here, europe or a colony`);
    }
    case 'unit':
      if (same(text, 'active')) return context.active === null ? { ...miss('there is no active unit'), fatal: true } : hit(context.active);
      return named(kind, word, state, context.player);
    default:
      return named(kind, word, state, context.player);
  }
}

// ---- usage ----

/** A kind as the help sheet writes it: `<good>`, `on|off`, `<good>|all`. */
function describe(kind: CheatArgKind, name?: string): string {
  if (typeof kind === 'string') return `<${name ?? kind}>`;
  return 'oneOf' in kind ? kind.oneOf.join('|') : kind.anyOf.map((k) => describe(k)).join('|');
}

function usageOfArg(arg: CheatArg): string {
  if (!arg.optional) return describe(arg.kind, arg.name);
  return typeof arg.kind === 'string' ? `[${arg.name}]` : `[${describe(arg.kind)}]`;
}

const usageOf = (spec: CheatSpec): string => [spec.name, ...spec.args.map(usageOfArg)].join(' ');

/** The help sheet: every cheat's usage, what it does and an example, in the specs' order. */
export function cheatHelp(specs: readonly CheatSpec[] = CHEAT_SPECS): CheatHelpEntry[] {
  return specs.map((spec) => ({ usage: usageOf(spec), about: spec.about, example: spec.example }));
}

// ---- a line against a spec ----

type Filled = { readonly ok: true; readonly values: Record<string, CheatArgValue | undefined>; readonly next: number } | { readonly ok: false; readonly message: string };

/**
 * Give each word to the spec's arguments in order. A word that does not fit an optional argument
 * leaves it out and is tried on the next. With `complete` false the line is still being typed: running
 * out of words is no fault, and `next` is the first argument the next word could be for.
 */
function fill(spec: CheatSpec, words: readonly Word[], state: GameState, context: CheatContext, complete: boolean): Filled {
  const values: Record<string, CheatArgValue | undefined> = {};
  // what the word in hand has already been refused as, by optional arguments passed over
  let passed: { readonly arg: CheatArg; readonly miss: Miss }[] = [];
  const refusal = (): string => {
    const several = passed.find((p) => p.miss.several);
    if (several) return several.miss.message;
    if (passed.length === 1) return (passed[0] as (typeof passed)[number]).miss.message;
    return `"${(words[w] as Word).text}" will not do for ${passed.map((p) => usageOfArg(p.arg)).join(' or ')}`;
  };
  let w = 0;
  let next = 0;
  for (const [i, arg] of spec.args.entries()) {
    const word = words[w];
    if (word === undefined) {
      if (!complete) break;
      if (!arg.optional) return { ok: false, message: `${spec.name} needs ${usageOfArg(arg)}: ${usageOf(spec)}` };
      continue;
    }
    const r = read(arg.kind, word, state, context);
    if (r.ok) {
      values[arg.name] = r.value;
      w++;
      next = i + 1;
      passed = [];
      continue;
    }
    if (r.fatal) return r;
    passed.push({ arg, miss: r });
    if (!arg.optional) return { ok: false, message: refusal() };
  }
  if (w < words.length) {
    if (passed.length > 0) return { ok: false, message: refusal() };
    return { ok: false, message: `"${(words[w] as Word).text}" is one word too many: ${usageOf(spec)}` };
  }
  if (complete) {
    // a place left out is where the active unit stands
    for (const arg of spec.args) {
      if (arg.kind !== 'place' || !arg.optional || values[arg.name] !== undefined) continue;
      if (!context.here) return { ok: false, message: `${spec.name} with no place means here, and there is no active unit: give a place` };
      values[arg.name] = { kind: 'square', x: context.here.x, y: context.here.y };
    }
  }
  return { ok: true, values, next };
}

/** The line's `as <power>` taken off its front: the power the cheat is for, and the words after. */
function forPower(words: readonly Word[], state: GameState, context: CheatContext): { readonly ok: true; readonly player: PlayerId; readonly rest: readonly Word[]; readonly as: boolean } | Miss {
  const first = words[0];
  if (!first || first.quoted || !same(first.text, 'as')) return { ok: true, player: context.player, rest: words, as: false };
  const power = words[1];
  if (!power) return miss('as needs a power: as <power> <cheat>');
  const r = named('power', power, state, context.player);
  return r.ok ? { ok: true, player: r.value as string, rest: words.slice(2), as: true } : r;
}

const findSpec = (specs: readonly CheatSpec[], name: string): CheatSpec | undefined => specs.find((s) => same(s.name, name));

/** Turn a typed line into a `cheat` action, or say why it will not do. */
export function parseCheat(text: string, state: GameState, context: CheatContext, specs: readonly CheatSpec[] = CHEAT_SPECS): CheatParse {
  const line = split(text);
  if (line.open) return miss('a quote is left open: close it with "');
  const power = forPower(line.words, state, context);
  if (!power.ok) return miss(power.message);
  const name = power.rest[0];
  if (!name) return miss(`type a cheat: ${specs.map((s) => s.name).join(', ')}`);
  const spec = findSpec(specs, name.text);
  if (!spec) {
    const letter = name.text.charAt(0).toLowerCase();
    const near = specs.filter((s) => letter !== '' && s.name.toLowerCase().startsWith(letter));
    return miss(`there is no cheat "${name.text}": try ${(near.length > 0 ? near : specs).map((s) => s.name).join(', ')}`);
  }
  // the cheat is for the power named, and so are its `own` things
  const filled = fill(spec, power.rest.slice(1), state, { ...context, player: power.player }, true);
  if (!filled.ok) return miss(filled.message);
  try {
    return { ok: true, action: { type: 'cheat', player: power.player, command: spec.build(filled.values) } };
  } catch (error) {
    return miss(error instanceof Error ? error.message : String(error));
  }
}

// ---- completion ----

/** The words of a kind that begin as the text does (`lower`, already lower case). */
function candidates(kind: CheatArgKind, lower: string, state: GameState, context: CheatContext): string[] {
  const fixed = (...words: string[]): string[] => words.filter((w) => w.toLowerCase().startsWith(lower));
  if (typeof kind === 'object') return 'oneOf' in kind ? fixed(...kind.oneOf) : kind.anyOf.flatMap((k) => candidates(k, lower, state, context));
  // `here` and `active` only when there is an active unit for them to mean
  const here = context.here ? ['here'] : [];
  if (kind === 'square') return fixed(...here);
  if (kind === 'place') return [...fixed(...here, 'europe'), ...candidates('colony', lower, state, context)];
  if (!isNameKind(kind)) return [];
  const fitting = THINGS[kind](state, context.player).filter((t) => begins(t, lower));
  // a colony or a unit of the power's own, if any fits; another's can still be typed
  const own = fitting.filter((t) => t.own);
  return [...(kind === 'unit' && context.active !== null ? fixed('active') : []), ...(own.length > 0 ? own : fitting).map((t) => t.offer)];
}

/**
 * The words that could complete the last word of a line being typed: cheat names at the first word,
 * the powers after `as`, and after a cheat's name whatever its next argument takes (and those after
 * it, while the ones before are optional). A name with spaces is offered in quotes.
 */
export function completeCheat(text: string, state: GameState, context: CheatContext, specs: readonly CheatSpec[] = CHEAT_SPECS): string[] {
  const line = split(text);
  const done = line.trailing ? line.words : line.words.slice(0, -1);
  const lower = line.trailing ? '' : (line.words[line.words.length - 1] as Word).text.toLowerCase();
  const unique = (words: string[]): string[] => [...new Set(words)];

  const first = done[0];
  if (first && !first.quoted && same(first.text, 'as') && done.length === 1) return unique(candidates('power', lower, state, context));
  const power = forPower(done, state, context);
  if (!power.ok) return [];
  const name = power.rest[0];
  if (!name) {
    const names = specs.map((s) => s.name).filter((n) => n.toLowerCase().startsWith(lower));
    return unique(!power.as && lower !== '' && 'as'.startsWith(lower) ? [...names, 'as'] : names);
  }
  const spec = findSpec(specs, name.text);
  if (!spec) return [];
  const mine = { ...context, player: power.player };
  const filled = fill(spec, power.rest.slice(1), state, mine, false);
  if (!filled.ok) return [];
  const out: string[] = [];
  for (const arg of spec.args.slice(filled.next)) {
    out.push(...candidates(arg.kind, lower, state, mine));
    if (!arg.optional) break;
  }
  return unique(out);
}

/**
 * The line with its last word finished as `word` (one of `completeCheat`'s answers) and a space
 * after it, ready for the next; a line that ends between words gains the word.
 */
export function withCompletion(text: string, word: string): string {
  if (split(text).trailing) return `${text}${word} `;
  let start = text.length;
  for (const m of text.matchAll(WORD)) start = m.index;
  return `${text.slice(0, start)}${word} `;
}
