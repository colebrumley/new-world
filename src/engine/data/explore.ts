// The Explore order (R-1066; docs/RULES.md "Exploring"): how far out of its way an exploring scout
// goes for a rumour or a chief nobody has spoken with, how far an exploring ship goes to keep to
// the coast, and how much a turn's walk may plan.
export const EXPLORE = {
  /** A scout prefers a rumour or an unvisited chief whose path costs at most this many moves more than the nearest plain target's. */
  preferWithin: 3,
  /** A ship prefers a target beside land it has seen whose path costs at most this many moves more than the nearest open-sea target's. */
  coastWithin: 4,
  /** Steps one unit may take under the order in one go (a guard; a turn never needs this many). */
  maxSteps: 64,
  /** Attitude level (0 content .. 3 angry) at and above which an exploring scout does not speak with a chief. */
  chiefAttitudeBelow: 3,
} as const satisfies Record<string, number>;
