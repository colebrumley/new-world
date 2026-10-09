# Balance report (R-1009)

Written by `SIM=1 npm test -- balance` (`test/sim/balance.test.ts`): twenty full games on generated
worlds, seeds 101 to 120, between four computer powers playing the policy of `src/ai/european.ts`,
from 1492 to the scoring in 1800, on Conquistador. Do not edit by hand; run the simulation again.

There is no human in these games, so nothing here measures a War of Independence: computer powers
are granted independence by colonist support instead (0 grants in the twenty games).
A "native war" is counted once for each people and power in open war: the people's attitude at the pitch
of war, a colony burned, or a settlement destroyed. Raids by a single angry settlement are listed apart.

## Against the target ranges

| Metric | Target (Appendix L) | Measured over 20 seeds x 4 powers | Verdict |
|---|---|---|---|
| First colony, turn | every power by turn 8 | 1–7 (mean 2.6); 0 of 80 later than turn 8 | within range |
| Colonies per power at 1600 | 3–8 | 4–8 (mean 5.4); 0 of 80 outside | within range |
| Colonies per power at 1700 | 5–14 | 6–10 (mean 8.1); 0 of 80 outside | within range |
| Colonies per power at 1800 | 6–20 | 6–10 (mean 8.2); 0 of 80 outside | within range |
| Colonies in all at 1800 | at most 48 | 25–35 (mean 32.9) | within range |
| Native wars per game | 1–6 | 1–5 (mean 3.2); 0 of 20 games outside | within range |
| Settlements destroyed by 1800, % | 5–40 | 6–26 (mean 14.9); 0 of 20 games outside | within range |
| Seeds in which a computer power reaches 50% rebel sentiment | at least 30% | 85% (best per game 41–76 (mean 64.3)) | within range |
| Games scored at 1800 | 100% | 100% | within range |
| Slowest single power's turn | under 2000 ms | 37 ms | within range |

Every metric is within its range on these twenty seeds.

## Other observations (no target range)

- Peoples and powers that exchanged raids without open war, per game: 1–10 (mean 5.3).
- Raids on colonies per game: 1–90 (mean 43.6); colonies burned per game: 0–6 (mean 1.3).
- Gifts from native settlements to colonies per game: 412–959 (mean 726.8).
- Scores at 1800 per power: 122–365 (mean 232.8).

## Game by game

| Seed | First colony (E/F/S/N) | Colonies 1600 | 1700 | 1800 | Native wars | Settlements destroyed | Independence granted | Best rebel sentiment | Scores |
|---|---|---|---|---|---|---|---|---|---|
| 101 | 2/2/5/4 | 5/7/5/6 | 8/8/8/8 | 9/8/8/9 | 3 | 9 of 52 | 0 | 72% | 224/257/201/226 |
| 102 | 1/2/2/3 | 4/5/5/5 | 8/8/8/8 | 9/8/9/7 | 4 | 12 of 51 | 0 | 46% | 241/254/259/214 |
| 103 | 3/2/1/7 | 5/6/5/5 | 6/7/6/6 | 7/6/6/6 | 3 | 3 of 53 | 0 | 48% | 179/190/195/122 |
| 104 | 2/6/1/3 | 4/6/5/6 | 8/8/8/8 | 8/8/8/8 | 3 | 7 of 50 | 0 | 62% | 274/246/227/182 |
| 105 | 2/3/3/2 | 5/6/5/5 | 8/8/8/8 | 8/8/8/8 | 1 | 9 of 51 | 0 | 69% | 281/186/264/231 |
| 106 | 2/1/2/3 | 5/6/5/6 | 9/8/9/8 | 9/8/9/8 | 2 | 4 of 50 | 0 | 63% | 242/256/235/173 |
| 107 | 2/3/5/3 | 4/7/5/6 | 8/8/9/8 | 8/8/9/8 | 3 | 12 of 50 | 0 | 76% | 201/212/332/212 |
| 108 | 2/2/1/2 | 5/6/5/6 | 9/8/8/8 | 9/8/8/8 | 4 | 6 of 48 | 0 | 41% | 236/180/231/215 |
| 109 | 2/2/2/2 | 4/7/4/6 | 8/8/9/9 | 8/8/10/9 | 5 | 11 of 50 | 0 | 73% | 257/185/310/227 |
| 110 | 2/2/2/3 | 4/6/5/6 | 8/8/8/8 | 8/8/8/8 | 3 | 6 of 52 | 0 | 54% | 236/159/194/227 |
| 111 | 5/5/2/2 | 4/8/5/6 | 8/10/8/8 | 8/10/8/9 | 5 | 5 of 43 | 0 | 71% | 185/264/263/365 |
| 112 | 2/5/6/3 | 5/7/5/5 | 8/8/8/8 | 9/8/10/8 | 4 | 11 of 47 | 0 | 62% | 252/207/267/250 |
| 113 | 3/1/1/2 | 4/6/5/5 | 8/8/8/9 | 8/8/8/9 | 3 | 5 of 50 | 0 | 65% | 273/261/218/280 |
| 114 | 2/2/3/3 | 4/7/5/6 | 8/9/9/8 | 8/9/9/8 | 3 | 6 of 53 | 0 | 70% | 248/287/232/190 |
| 115 | 1/4/2/3 | 4/6/6/6 | 8/8/8/9 | 8/8/8/9 | 3 | 5 of 37 | 0 | 76% | 168/230/157/355 |
| 116 | 2/4/2/3 | 4/6/5/5 | 8/8/8/8 | 8/8/9/8 | 3 | 7 of 46 | 0 | 70% | 248/227/212/275 |
| 117 | 2/3/4/2 | 4/7/5/5 | 8/8/8/8 | 8/8/8/8 | 4 | 5 of 47 | 0 | 70% | 267/187/208/249 |
| 118 | 1/1/2/4 | 5/6/5/6 | 8/8/8/9 | 8/8/8/9 | 3 | 4 of 49 | 0 | 57% | 207/192/224/250 |
| 119 | 2/3/2/2 | 5/6/5/5 | 8/8/8/8 | 8/8/8/8 | 1 | 5 of 49 | 0 | 67% | 233/220/258/223 |
| 120 | 2/3/1/2 | 5/6/6/6 | 8/8/9/8 | 9/8/9/8 | 4 | 14 of 53 | 0 | 75% | 212/229/261/319 |
