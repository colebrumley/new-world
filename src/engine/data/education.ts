// Schooling and learning on the job (R-310; docs/RULES.md "Education").
import type { ProfessionId } from './professions';
import type { RawGood } from './terrain';

export const EDUCATION = {
  /** Turns a teacher needs per graduate, by the teaching level of his own profession (1, 2, 3). */
  turnsByLevel: [0, 4, 6, 8],
  /** The per-colonist turn counter stops here. */
  counterMax: 15,
  /** Graduations one colony can have in a turn. */
  maxPerTurn: 3,
  /** One schooling moves a pupil one rung: criminal, servant, free colonist, then the teacher's trade. */
  ladder: { pettyCriminal: 'indenturedServant', indenturedServant: 'freeColonist' },
} as const satisfies { ladder: Partial<Record<ProfessionId, ProfessionId>> } & Record<string, unknown>;

export const ON_THE_JOB = {
  /** Field work that can make an expert of an unskilled hand. */
  goods: ['sugar', 'tobacco', 'cotton', 'furs'],
  /** One chance in this many per turn, by who is doing the work. */
  odds: { freeColonist: 100, indenturedServant: 200, pettyCriminal: 300 },
} as const satisfies { goods: readonly RawGood[]; odds: Partial<Record<ProfessionId, number>> };
