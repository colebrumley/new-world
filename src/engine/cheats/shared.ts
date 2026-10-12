// What every group of cheats shares: the refusal, the outcome, and readers that take the parsed
// arguments of a spec apart (R-1058). The types of the grammar itself live in ../cheats.ts.
import type { CheatArgValue } from '../cheats';
import type { CongressEvent } from '../congress';
import { CHEATS } from '../data/cheats';
import type { IndependenceEvent } from '../independence';
import type { GameState } from '../state';

export type CheatErrorCode =
  /** The power named is not one a cheat can be for. */
  | 'cheatPower'
  /** A number is not whole, or outside what the cheat takes. */
  | 'cheatAmount'
  /** The result would be less than nothing. */
  | 'cheatBelowZero'
  /** The thing named does not exist, is not this power's, or cannot take this cheat. */
  | 'cheatTarget'
  /** The square is off the map, or will not do. */
  | 'cheatSquare'
  | 'cheatUnknown';

export type CheatCheck = { readonly ok: true } | { readonly ok: false; readonly code: CheatErrorCode; readonly message: string };

/** What the game's own code reports while a cheat runs through it. */
export type CheatSideEvent = CongressEvent | IndependenceEvent;
export interface CheatSink {
  push(...events: CheatSideEvent[]): unknown;
}

/** The state after a cheat, and the sentence that says what it did (figures in plain digits). */
export interface CheatOutcome {
  readonly state: GameState;
  readonly summary: string;
}

export const CHEAT_OK: CheatCheck = { ok: true };
export const refuse = (code: CheatErrorCode, message: string): CheatCheck => ({ ok: false, code, message });

/** A whole number of zero or more, small enough to add to anything. */
export const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** A count after an amount is added to it, taken from it or put in its place; null when the amount or the result is no whole number. */
export function amountAfter(current: number, amount: { readonly set: boolean; readonly value: number } | undefined): number | null {
  if (typeof amount?.value !== 'number' || !Number.isSafeInteger(amount.value)) return null;
  const after = amount.set ? amount.value : current + amount.value;
  return Number.isSafeInteger(after) ? after : null;
}

/** Would a cheat leave a count past the most it may write? A count already past it may still come down. */
export const pastMost = (current: number, after: number): boolean => after > Math.max(CHEATS.most, current);

export const onMap = (state: GameState, x: number, y: number): boolean => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;

type Args = Readonly<Record<string, CheatArgValue | undefined>>;
const wrong = (name: string, kind: string): never => {
  throw new TypeError(`cheat argument "${name}" is not ${kind}`);
};

// A spec's build() is handed what the parser made of each argument, by name; an optional one left
// out is undefined. These say what a build expects and fail loudly on anything else.

export function numberArg(args: Args, name: string): number | undefined {
  const v = args[name];
  return v === undefined ? undefined : typeof v === 'number' ? v : wrong(name, 'a number');
}

export function wordArg(args: Args, name: string): string | undefined {
  const v = args[name];
  return v === undefined ? undefined : typeof v === 'string' ? v : wrong(name, 'a word');
}

/** An argument that may be one of several kinds: which alternative matched ('word' for a fixed word) and what it read. */
export function choiceArg(args: Args, name: string): { readonly kind: string; readonly value: CheatArgValue } | undefined {
  const v = args[name];
  if (v === undefined) return undefined;
  return typeof v === 'object' && 'value' in v && 'kind' in v && !('set' in v) ? { kind: v.kind, value: v.value } : wrong(name, 'one of its alternatives');
}

export function amountArg(args: Args, name: string): { readonly set: boolean; readonly value: number } | undefined {
  const v = args[name];
  if (v === undefined) return undefined;
  return typeof v === 'object' && 'set' in v ? { set: v.set, value: v.value } : wrong(name, 'an amount');
}

export function squareArg(args: Args, name: string): { readonly x: number; readonly y: number } | undefined {
  const v = args[name];
  if (v === undefined) return undefined;
  return typeof v === 'object' && 'x' in v && 'y' in v ? { x: v.x, y: v.y } : wrong(name, 'a square');
}
