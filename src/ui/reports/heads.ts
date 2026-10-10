// The head of each report (R-1015): the seal its adviser closes it with, and the sentence or two
// the adviser opens with. The seal is one of four marks (ui/pixel-art.ts) in the adviser's own
// colour of wax; the opening is set under the title with a drop capital.
import { INK, type InkId, type SealGlyph } from '../pixel-art';

export interface ReportHead {
  readonly glyph: SealGlyph;
  /** The colour of the adviser's wax, from the map's palette. */
  readonly wax: InkId;
  readonly lead: string;
}

export const REPORT_HEADS = {
  terrain: { glyph: 'wheat', wax: INK.forest, lead: 'Here is every kind of country our surveyors have put a name to, and what a colonist may hope to win from it. The figures are for land as it is found, before axe or plough has touched it.' },
  religion: { glyph: 'cross', wax: INK.purple, lead: 'Faith fills ships. The more crosses our churches raise, the sooner the restless of Europe take passage to join us, and the more missions we may keep among our neighbours.' },
  congress: { glyph: 'quill', wax: INK.blue, lead: 'These are the minds that have joined our cause, and the one we are courting next. Every bell rung in our colonies brings the next seat nearer, and wears the patience of the Crown thinner.' },
  labor: { glyph: 'wheat', wax: INK.earth, lead: 'A tally of our people by their trades, and of the colonies where each trade is followed. Choose a line to be shown on the map where the most of them live.' },
  economy: { glyph: 'anchor', wax: INK.yellow, lead: 'The state of our purse, and of the market across the ocean. Prices there bend to what we sell and what we buy, so no figure below will hold for long.' },
  colonies: { glyph: 'wheat', wax: INK.red, lead: 'Each of our colonies in a line: its people, its temper, and what its carpenters have in hand. What lies in the warehouse of each follows below.' },
  naval: { glyph: 'anchor', wax: INK.sea, lead: 'Every ship that sails under our flag: where she lies, where she is bound, and what is in her hold. A ship in the yards is listed with the turns she still needs there.' },
  foreign: { glyph: 'quill', wax: INK.darkGrey, lead: 'How the powers of Europe stand toward one another in the New World. Peace here is seldom more than a pause, so it is as well to know who is fighting whom.' },
  indians: { glyph: 'quill', wax: INK.wood, lead: 'The peoples who held this land before we came, so far as we have met them, and how they look on our coming. A settlement pushed too far will not wait for its chiefs to act.' },
  score: { glyph: 'quill', wax: INK.red, lead: 'The account that history will keep of us. People, learning, wealth and liberty all weigh in it, and a war for independence won weighs most of all.' },
  hall: { glyph: 'quill', wax: INK.purple, lead: 'The governors who came before, set down in the order of their renown. Every game played to its end earns a line here.' },
} as const satisfies Record<string, ReportHead>;

export type ReportId = keyof typeof REPORT_HEADS;

/** The head for a report, by its id; a report nobody has written a head for is sealed in plain red and opens without a word. */
export function reportHead(id: string): ReportHead {
  return Object.hasOwn(REPORT_HEADS, id) ? REPORT_HEADS[id as ReportId] : { glyph: 'quill', wax: INK.red, lead: '' };
}
