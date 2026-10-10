# Rules

Formulas and rules of the game, written in plain words **before** they are implemented. The
engine is then written from this note. Plain rule-table numbers do not belong here; they go in
`src/engine/data/*` and [FIDELITY.md](FIDELITY.md).

## Entry format

```
### <Short rule name> (R-xxx)
**Compare:** <citation>           optional; an open-source project that handles the same rule
**Numbers:** <table constant>     optional; where the numbers live in src/engine/data/*
**Rule:** prose or pseudocode; integer math and rounding stated explicitly.
**Notes:** what we chose and why (also logged in FIDELITY.md).
```

Citation forms:

| Project | Form | Example |
|---|---|---|
| FreeCol | file and element | `FreeCol specification.xml, <building-type id="model.building.stockade">` |
| Revolution Now | doc file | `revolution-now doc/<file>` |

Never paste open-source code here; numbers, names and formulas only.

## Rules

### Sons of Liberty majority announcements (R-306)
**Rule:** during a colony's end-of-turn report, if its Sons of Liberty percentage is at least 50
and the "majority announced" flag is clear, announce it and set the flag. A second, separate flag
does the same at 100.

### Tile yield (R-101)
**Compare:** Revolution Now `config/rcl/production.rcl`.
**Rule:** start from the raw terrain-table value for the terrain row and the good, then in this
order:
1. Fish only, if above 0: by the number of the 8 neighbours that are water, 8 gives -2, 6 or 7
   gives -1, 5 or fewer gives +1 (off-map is not water).
2. Furs only, if above 0: road +1, minor river +1, major river +2. Floor at 0.
3. Let s = colony Sons of Liberty bonus (1 at 50%, 2 at 100%) minus its Tory penalty. If the
   figure is above 0 and s is positive, add s.
4. Expert at this good, figure above 0: farmer and fisherman add 2, plus s again when positive;
   every other expert doubles.
5. Resource: prime cotton/tobacco/sugar double; the others add a fixed amount, twice that for an
   expert, and they add even to a zero figure (Fishery excepted).
6. Silver on a tile with no resource: the result is 1 if there is a road or the worker is a
   silver expert (and the terrain has any silver at all), otherwise 0; step 8 is skipped.
7. Lumber doubles.
8. If above 0, add steps of size c, where c = 2 for lumber and for non-food experts, else 1:
   one step for food; one for a road on furs, lumber, ore, silver, fish; one for plowed land on
   food and the three crops; one for any river; and one more for a major river only if the river
   step is the only one taken.
9. Fish with no Docks is 0. Furs with Hudson double. A convert adds 1 to a nonzero food, crop,
   fur or fish figure.
10. If s is negative, add it to a nonzero figure; floor at 0.
There is no outdoor penalty for servants, criminals or experts off their trade.
**Notes:** an expert fisherman adds 2 rather than doubling. Prime Timber gives an expert +8 and
bare mountains with a road yield 1 silver; Revolution Now differs on both (+4, and no silver).

### Resource terrains and effects (R-101)
**Rule:** Oasis on Desert/Scrub, food +2. Wheat on Plains, food +2. Game on Boreal/Broadleaf, food
+2 and furs +2. Beaver on Mixed, furs +3. Prime Cotton on Prairie, Prime Tobacco on Grassland,
Prime Sugar on Savannah, each x2. Prime Timber on Conifer/Tropical, lumber +2 before the doubling.
Minerals on Tundra/Marsh/Swamp/Wetland/Rain, ore +3 and silver +1. Ore Deposit on Hills, ore +2.
Silver Deposit on Mountains, silver +2. Depleted Mine on Mountains, no bonus but counts as a
resource for the silver rule. Fishery on Ocean (not Sea Lane), fish +3. Additive amounts double
for the matching expert.

### Colony centre tile (R-101, used by R-302)
**Rule:** food is 0 on Arctic, 1 on Desert and Scrub, 2 on Hills, Mountains and every other
forest, 3 elsewhere; +2 on Discoverer, +1 on Explorer; +1 if plowed; +2 with Oasis, Wheat or Game;
plus the SoL bonus. The second product is the largest of sugar, tobacco, cotton, furs, ore, silver
(raw value plus the non-expert resource effect; earliest wins ties; none if all are 0), then +1 on
Discoverer, +1 minor or +2 major river, plus the SoL bonus. Roads, experts, Hudson and Tories do
not affect either figure.
**Notes:** Boreal counts with the other forests at 2 (Revolution Now has 1).

### Deposit depletion (R-101, wired in by R-301)
**Compare:** Revolution Now `doc/depletion.txt`.
**Rule:** each turn a colony sums a weight over its worked tiles: ore on Minerals 1, silver on
Minerals 2, silver on a Silver Deposit 1. For each unit of weight, with probability
(d+1)/(d+2) where d is the difficulty index 0..4, a per-colony counter goes up by one. When it
reaches 50 it drops by 50 and every tile around the colony where an ore or silver miner works
Minerals or a Silver Deposit is depleted: Silver Deposit becomes Depleted Mine, Minerals vanish.

### Sons of Liberty bonus and Tory penalty inputs (R-306)
**Rule:** tories = (population x (100 - SoL%) + 50) / 100 with integer division; penalty =
tories / (10 - difficulty index), integer division; AI colonies have no penalty. Bolivar adds 20
to the SoL% used here, capped at 100.

### Movement (R-201)
**Compare:** Revolution Now `src/mv-calc.cpp`, `src/map-square.cpp`, `src/command-move.cpp`.
**Rule:**
- Movement is kept in thirds of a move; a unit has 3 x its table movement each turn.
- A land step costs 3 x the table move cost of the destination terrain. If both squares have a
  road or a colony it costs 1 third. Otherwise, if both have a river and the step is not
  diagonal, it costs 1 third (minor and major alike). Entering a square with a settlement costs
  at most 3 thirds. All land units pay the same.
- Short of movement: a unit that has spent nothing this turn always makes the step. Otherwise it
  succeeds with probability (thirds left) / (cost); either way it is left with nothing.
- A ship step costs 3 thirds. Ships may enter Ocean and Sea Lane that belong to the main ocean
  (not inland lakes) and their own colonies. Entering a colony ends the ship's turn and wakes
  its passengers; the same goes for a wagon train.
- Moving a ship onto empty land (no settlement, no foreign occupant) offers landfall if a
  passenger still has moves. Accepting wakes all land passengers; the ship neither moves nor
  spends anything. Each passenger then steps ashore itself.
- A step across the shoreline (ship to land, land to ship) ends the unit's turn, unless a colony
  is at one end: stepping from a colony onto a ship alongside costs one move.
- A unit aboard ship may not step onto a square occupied by another power.
- Sentried land units on a ship's square go aboard when the ship moves off, while holds remain.
- Fortify ends the unit's turn; it becomes Fortified at its next turn. A sentry wakes when a
  foreign unit is adjacent.
**Notes:** the river rate applies to every land unit. "Main ocean" is implemented as water
connected to the map edge. Magellan's +1 move for ships is applied with the Founding Fathers
(R-700).

### Europe travel (R-203)
**Compare:** Revolution Now `config/rcl/harbor.rcl`.
**Rule:**
- The question is asked when a ship (a) steps east, north-east or south-east from a Sea Lane
  square onto a Sea Lane square while not under Go To orders, where declining still makes the
  move; or (b) steps off the east or west side of the map, where declining cancels the move.
- A crossing normally has the ship arrive at the start of its owner's second turn after
  leaving. It takes one turn longer when a 1..100 roll is 90 or more, the owner has three or
  more ships, and the owner lacks Magellan. The same timing applies in both directions and from
  either side of the map.
- A returning ship reappears on the square it left from; if that is not a Sea Lane square free
  of foreign units, on the nearest such square, searching outward ring by ring.
- A ship in mid-ocean may be turned around.
**Notes:** the west edge gives no extra time, and Magellan only removes the occasional slow
crossing (Revolution Now uses east 2 / west 4 turns, 2 with Magellan). Turning a ship around in
mid-ocean takes a flat two turns. Europe being closed during the War of Independence is enforced
with R-900.

### Go To Europe (R-205)
**Rule:**
- The Go To menu of a ship lists Europe first, ahead of the colonies, when the water she lies
  in reaches a Sea Lane square. Land units and ships on closed waters are not offered it.
- A ship ordered to Europe makes for the nearest Sea Lane square she can sail to, over as many
  turns as it takes, and is not asked on the way whether to sail. On a Sea Lane square with
  moves in hand she sets sail, carrying all aboard; one that arrives with her last move sails
  at the start of her next turn. A ship already on a Sea Lane sails at once.
- During the War of Independence the order is refused, and one already given is dropped when
  the ship reaches the Sea Lane.
- A manual move cancels the order like any other Go To.

**Notes:** the entry reads "Europe" rather than the name of the power's home port. The squares
on the rim of the map do not count as Sea Lane for this, as for a returning ship.

### Pioneer work (R-204)
**Compare:** Revolution Now `config/rcl/command.rcl`.
**Rule:**
- A road takes N turns, where N is the terrain's improvement value (the forested row for a
  forest). Clearing or plowing takes N + 2. A Hardy Pioneer needs floor(turns / 2). A
  non-expert pioneer is not slowed further.
- Each turn of work ends the unit's turn and adds one to its counter; the job is done when the
  counter reaches the number of turns. The turn the order is given counts as the first, so a
  one-turn job is done at once.
- Twenty tools are used when a job is finished, not when it is ordered. A pioneer left with
  fewer than twenty has none and becomes a plain colonist.
- Clearing a forest only removes the forest; plowing is a second job. Cleared land stays clear.
- A road may be built on any land without one (a colony square counts as having one). Land
  already plowed cannot be plowed again.
- Clearing gives lumber to the owner's nearest colony if it is within 3, measuring distance as
  the longer leg plus half the shorter (rounded down); ties go to the later colony. The amount
  is 20 without a Lumber Mill, or (table lumber of the forest + 1) x 20 with one; doubled for a
  Hardy Pioneer; then limited to the free room in the warehouse, which holds 100 per good plus
  100 for each of Warehouse and Warehouse Expansion.
**Notes:** hills and mountains cannot be plowed (as in Revolution Now). Raising village alarm
and the native-land dialog belong to R-510.

### Founding and joining colonies (R-300)
**Compare:** Revolution Now `colony.rcl`.
**Rule:**
- Any colonist unit except an Indian Convert may found, whatever it is equipped as. Not on
  water, not on Mountains (every other land is allowed), not when a colony of any power is on
  one of the 8 neighbouring squares, and not once independence has been declared.
- There may be 48 colonies in the whole game. A human power with 38 can found no more; that
  is the only place a power's colonies are counted, so colonies taken in war, or inherited in
  the War of Succession, may carry it past 38, and computer powers are held only to the 48.
- Advisory warnings the player may override: no access to the ocean (every level); and on
  Discoverer and Explorer only, fewer than 4 points of land (one point per neighbour that is not
  water, desert or arctic and not held by someone else, one more per special resource) and no
  forest among the neighbours.
- Founding marks the square as a colony and nothing else: no road, no plowing, no clearing.
- A new colony has Town Hall, Carpenter's Shop, Blacksmith's House, Tobacconist's House,
  Weaver's House, Rum Distiller's House and Fur Trader's House, and empty stores apart from the
  founder's own kit (a pioneer's remaining tools, 50 muskets, 50 horses).
- A colony holds at most 32 colonists. Joining hands the unit's kit to the stores.
- With La Salle, a colony that has three or more colonists after someone joins gets a Stockade.
- The player may not take a colony with a Stockade (or better) from three colonists downward,
  and removing the last colonist of any colony is abandoning it.
**Notes:** founding is immediate, so there is no refusal for a colony being built next door.
The first build item (Warehouse, or Docks in a port colony) is set by R-303.

### Indoor production (R-301)
**Compare:** Revolution Now `production.rcl` and `doc/production-bonuses.txt`.
**Rule:**
- Base per worker: 3 for a free colonist or any expert (including one outside his trade), 2 for
  an indentured servant, 1 for a petty criminal, 1 for an Indian convert. Let s be the colony's
  Sons of Liberty bonus less its Tory penalty.
- Distiller, tobacconist, weaver, fur trader, blacksmith, gunsmith: base + s; add the base again
  if the chain has its second building; add half of the running figure (rounded down) if it has
  the third; double for the expert of that trade; never below 0.
- Carpenter: 6 for a Master Carpenter, else the base; plus s; doubled by a Lumber Mill.
- Preacher: 6 for a Firebrand Preacher, else the base; plus s; doubled by a Cathedral (not by a
  Church); half again with William Penn.
- Statesman: base + s, doubled for an Elder Statesman. Teachers produce nothing.
- Each product takes one unit of its raw material, except in a third-level chain, which needs
  only two thirds (rounded down) of what it makes.
- Within a turn a workshop may use the stock at the start of the turn plus what was made this
  turn, and that carries down the chain (ore to tools to muskets). If that is not enough, the
  product is cut by the shortfall (for a third-level chain the shortfall is scaled by 3/2, and
  with nothing at all available nothing is made) and the raw material is used up.
- A "ran out" report is made only when the shortage left none of the product.
- Hammers are made by carpenters from lumber one for one and go into the colony's hammer store
  every turn, whether or not anything is being built.
- A building takes three workers; teachers number one, two or three by school level.
**Notes:** the three-worker limit applies to every building. Fish count as food.

### Construction (R-303)
**Compare:** Revolution Now `colony.rcl` (rush_construction).
**Rule:**
- A building may be started when the colony has the minimum population, the previous building
  of its chain stands, and it is not built already. Docks also need a water square next to the
  colony; Drydock and Shipyard need the colony to border the open sea; the Custom House needs
  Stuyvesant; the five factories and the Arsenal need Adam Smith. The second and third Town
  Hall rows and both Capitol rows are never offered. The project under way is always listed.
- Units: Wagon Train (40 hammers; only while the power has fewer wagon trains than colonies),
  Artillery (needs an Armory), and the five ships up to Frigate (need a Shipyard). Hammers are
  the unit table's cost x 32 (never less than 40) and tools its tools x 10.
- A new colony starts on Docks if it is a port, otherwise on a Warehouse.
- At the end of a colony's turn, after its stores are updated: if the hammer store has reached
  the cost and the tools are in stock, the tools are used, the item is built and the hammer
  store is set to 0 (no surplus is kept). Without the tools nothing happens (an AI colony is
  given them). A wagon train over the limit is not built and the hammers stay. The project
  remains selected afterwards.
- Buying: price = 13 x hammers still missing + (market price of tools + 4) x tools still
  missing, doubled if the hammer store is exactly 0. Buying fills the hammer store and adds the
  missing tools to stock; the item is then completed by the ordinary end-of-turn test.
- Upkeep is not charged.
**Notes:** "market price of tools" could be the bid or the ask (Revolution Now uses the ask);
until the market exists (R-400) a fixed opening price is used.

### Food and horses (R-304)
**Compare:** Revolution Now `colony.rcl`.
**Rule:**
- Each colonist living in a colony eats 2 food a turn; units standing on the square eat nothing.
  Food is not subject to the warehouse limit.
- After the stores are updated, a colony with 200 or more food loses 200 and a Free Colonist
  unit appears on its square (outside the colony). Once per turn.
- If the food made plus the food stored does not cover what is eaten: when there was food in
  store at the start of the turn the store just empties and a notice is given; when there was
  none, one colonist picked at random dies, and if he was the last the colony is removed.
- Warning: with no shortfall but more eaten than made, when the store is less than 4 times the
  deficit.
- Discoverer and Explorer: no starvation deaths before 1520; afterwards a death that is due
  happens with chance 1/3 (Discoverer) or 1/2 (Explorer).
- AI colonies ignore a shortfall smaller than 3 and receive floor(difficulty index / 2) food
  each turn.
- Horses breed when there are at least 2. The possible increase is 2 per started 50 horses
  (per started 25 with a Stable). The actual increase is the least of that, half this turn's
  food surplus rounded up, and the free room in the warehouse. Each new horse uses 1 food from
  the surplus; stored food is never used.

### Warehouse and spoilage (R-305)
**Rule:**
- A colony keeps 100 of each good, 200 with a Warehouse, 300 with the Warehouse Expansion.
  Only food is exempt; horses and lumber are limited like everything else.
- At the very end of a colony's turn (after production, growth, starvation and the
  construction test) every good over the limit is cut back to it. The part of the excess that
  is no more than this turn's own net gain of that good is removed without comment; what
  remains (stock that was already over the limit) is reported, except that a remaining excess
  of exactly 1 is left in place.
- Stock may exceed the limit during a turn; unloading over it only warns.
- A good is reported "ready" when its stock passes a multiple of 100 during the turn, compared
  after the trim, with a note when it now fills the warehouse.
**Notes:** the Custom House sale (stock of 100 or more sold down to 50) belongs to R-403.

### Sons of Liberty (R-306)
**Compare:** Revolution Now `doc/rebel-sentiment.txt`.
**Rule:**
- Colony bells per turn, each step rounded down on the running total: the statesmen's output
  (base + s each, doubled for an Elder Statesman); + 1; with Jefferson + half; with Paine + the
  tax rate as a percentage; then doubled by a Newspaper, or else half again with a Printing
  Press (the two do not combine). AI powers with Bolivar add (population + 3) / 5 before that.
- Each colony keeps a membership numerator N and denominator D. New colony: N = 0, D = 100.
  Each colonist joining adds 100 to D; each one leaving or dying takes 100 off.
- Membership % = floor(100 N / D), 0 if D is not positive; + 20 for a human power with
  Bolivar; at most 100.
- Each turn, with b the bells rung: if b is less than the population, b is reduced by
  (membership % / 20); D loses floor(D / 64), is at least 1, and gains 2 per colonist; N gains
  b and loses floor(N / 64), kept between 0 and D. Left alone this settles near
  b / (2 x population).
- Production bonus level (0, 1, 2), one change per turn, first match: membership >= 50 and
  level 0 -> 1; membership >= 100 and level 1 -> 2; membership < 95 and level 2 -> 1;
  membership < 50 and level 1 -> 0. Each change is announced; otherwise a rise or fall across a
  ten is.
- s for every field and indoor worker = bonus level - Tory penalty. The colony square gets the
  bonus level only. Tory penalty (human colonies) = floor(tories / T), tories =
  floor((population x (100 - membership %) + 50) / 100), T = 10, 9, 8, 7, 6 from Discoverer to
  Viceroy. The inefficiency notice uses population x (100 - membership %) / 100 without the
  rounding term, once on reaching T and once on dropping back.
- National rebel sentiment = floor(sum of membership % x population / total population).
**Notes:** Jefferson applies to the whole total, not only to statesmen (Revolution Now
differs); the Newspaper replaces the press bonus rather than adding to it; membership moves by
1/64 a turn rather than converting bells at once (Revolution Now differs). The national
sentiment formula is Revolution Now's. What the Declaration does to bells is left to R-901.

### Crosses (R-307)
**Compare:** Revolution Now `production.rcl`.
**Rule:** a colony makes 1 cross a turn, 2 with a Church, 3 with a Cathedral, with no
adjustment of any kind. Each preacher adds his own output (see "Indoor production": 3, or 6 for
a Firebrand Preacher, plus s; doubled by a Cathedral; half again with Penn). Each colony's
crosses are added to its owner's running total during its turn.
**Notes:** Penn applies to preachers only (as in Revolution Now). Brewster does not affect
production.

### Automatic placement (R-309)
**Rule:** a colonist with no job asked for becomes a carpenter if the colony feeds itself, has
three or more people, has a project and no carpenter yet. Otherwise every free square is scored
for every outdoor job: yield (capped by warehouse room) x 8 plus a small bonus for closeness;
while the colony is short of food, food and fish are multiplied by 32; otherwise the score is
multiplied by (2 x price + 1), or by (2 x price) for lumber when the colony already has or
produces some. The score is doubled for an expert at his own trade. The best score wins; with no
square scoring, a field worker becomes a carpenter. There are no further weights for shortages
or processing chains. Prices are the opening bids until the market exists (R-400).

### Education (R-310)
**Compare:** Revolution Now `colony.rcl`.
**Rule:**
- A teacher is a specialist whose trade has teaching level 1, 2 or 3; level 2 needs a College
  and level 3 a University. A Schoolhouse seats one teacher, a College two, a University three.
- Every colonist has a counter that rises by one each turn (to 15 at most) and returns to 0
  when his job changes. A teacher graduates a pupil when his counter + 1 reaches his term:
  4 turns for a level-1 trade, 6 for level 2, 8 for level 3 (by the teacher's trade, not the
  building). His counter then starts again, whether or not a pupil was found.
- Pupils are any colonists of the colony, whatever their work, who are petty criminals,
  indentured servants or free colonists; never converts. One is picked at random and moves one
  rung: criminal to servant, servant to free colonist, free colonist to the teacher's trade.
  Nobody is taught twice in a turn. With no pupil a notice is given and the colony's remaining
  graduations that turn are dropped. At most three graduations per colony per turn.
- Learning by doing: a free colonist, servant or criminal working as sugar, tobacco or cotton
  planter or fur trapper becomes the expert of that work with chance 1/100, 1/200 or 1/300 per
  turn, but only while his power has no expert of that kind anywhere.
**Notes:** the term is keyed by the teacher's trade (Revolution Now keys it by school building).
The census of experts is counted afresh each time. Full Sons of Liberty membership does not
speed education. Scouts becoming Seasoned belongs to R-503.

### Market (R-400)
**Compare:** Revolution Now `doc/prices.txt`, `config/rcl/market.rcl`.
**Rule:**
- Each power has its own price and its own traffic volume per good, plus a running net amount
  sold. One further volume per good is shared by all powers; it starts at a random 600 to 1000.
- The table's start, low and high are on a "price" scale: bid = price - 1 and ask = price +
  burden. A rise is refused at the high limit, a fall at the low limit.
- Opening price of an ordinary good = start 1 plus a random amount up to (start 2 - start 1),
  the same for every power. Rum, cigars, cloth and coats instead open at their group level.
- A trade of q units (at most 100 at a time) changes traffic by (q shifted left by the good's
  volatility) plus 16% of q for each difficulty step above the middle level (below for easier
  levels; AI trades always use the lowest). A sale adds that to every power's traffic, the
  Dutch receiving two thirds; a purchase subtracts it from every power's in full. The trader's
  net amount sold moves by q.
- A power's prices are evaluated at the start of its turn for all goods, and for one good right
  after it trades that good in Europe. Each evaluation: add the good's attrition to its traffic
  (doubled for the Dutch on odd turns; not kept when the evaluation follows a trade); if traffic
  is at or below -rise x 100, add rise x 100 and raise the price by 1 unless it is at the high
  limit; if traffic is at or above fall x 100, subtract fall x 100 and lower the price by 1
  unless it is at the low limit.
- Counted volume of a good = shared volume + each power's net amount sold where positive.
  Whenever England's prices are evaluated, each shared volume loses 1/128 of the counted volume.
- Rum, cigars, cloth, coats: level = 3 x (the four counted volumes together) / the good's own.
  Each evaluation first adds 100 x floor((rise + fall) / 2), with the sign of (price - level),
  to the traffic, so the price walks toward the level about one step a turn.
- Sugar, tobacco, cotton, furs: the same comparison (furs at half volume; their level one
  higher before 1700 and one more before 1600) adds only floor((rise + fall) / 2) with that sign.
- AI powers: muskets, tools and horses are capped at 9 / 7 / 6 / 4 / 3 by difficulty, and the
  high limit of tools and muskets shifts with difficulty and the turn number.
- Buying costs ask x amount with no tax. Selling pays bid x amount less tax (rate percent of
  the gross, rounded down). A boycotted good can be neither bought nor sold; the boycott is
  lifted by paying 500 x the good's ask price.
**Notes:** Revolution Now differs on the shared-volume draw (centre 600), on the difficulty
weighting (multiplicative), on the constant of the weak pull, and holds that attrition and trade
traffic do not apply to the processed goods. The group pulls apply to all goods on every
evaluation, including the one that follows a single trade.

### Tax (R-401)
**Compare:** Revolution Now `config/rcl/old-world.rcl`.
**Rule:**
- Every power starts at 0%. The rate never passes 75% nor falls below 0.
- A human power holding at least one colony is reviewed on turn numbers divisible by a period
  (from turn 30 on): 18 turns up to 1600, 15 after 1600, 12 after 1700, 9 after 1750, each
  shortened by 2 per difficulty level above the middle one and lengthened below it.
- The review rolls 1..1000 and adds gold / 100, 5 x (2 x goodwill - tax rate), the power's
  rebel sentiment, and turn / 30. Below 100 the rate is cut by 2 to 5 (a victory abroad);
  below 650, +1 (a royal wedding, of which there are at most 30); below 950, +2 (a war with a
  named enemy, never the same one twice running); below 1100, +3 or 4 (a Navigation Act);
  otherwise +5 to 8 (a Stamp Act).
- After a rise a human may hold a party instead of paying. The good is chosen among those not
  already boycotted that a port colony holds, in proportion to the power's net trade in each
  (food and tools at half weight, horses and muskets at a quarter; the first candidate if no
  good has been traded), in the port colony with the largest stock of it. The party cancels the
  rise, destroys up to 100 of the good there, adds the amount destroyed to that colony's Sons
  of Liberty numerator, and puts the good under boycott.
- A boycott is lifted by paying 500 x the good's ask price ("Market"), or all at once by Fugger.
**Notes:** "goodwill" is 20 per Founding Father held, to at most 100. There is no tax rise for
Custom House construction, for purchases in Europe or for losing a royal unit. Revolution Now
gives different odds (98% rises, changes of 1 to 8) and a different first turn. An unanswered
rise is taken as accepted at the end of the turn.

### Europe docks and starting treasury (R-402)

- Someone waiting on the docks can be fitted out from the market: a soldier takes 50 muskets, a scout
  50 horses, a dragoon both, a pioneer 100 tools. Each is charged at the asking price. Handing kit
  back pays the bid, and no tax is taken on it. The traffic counts toward the market volume, but
  prices are not re-evaluated on the spot as they are after a cargo trade. Blessing a missionary is
  free.
- Any change of dock kit that touches a boycotted good is refused.
- A human power starts with 1000 gold on the lowest level, 300 on the second, and nothing above
  that; computer powers start with nothing here.

### Custom House (R-403)

- A colony with a Custom House keeps a list of goods to export. During the colony's turn, after
  production and construction and before the warehouse is trimmed, each listed good with at least
  100 in store is sold down to 50.
- The sale pays the owner's current bid. Tax is taken as on a sale in Europe; once independence is
  declared no tax is taken and the whole price is paid. There is no wartime charge.
- The sale adds to the market volume like any other, but the price does not step until the market
  is next evaluated.
- Boycotts are not consulted: a boycotted good on the list is still sold.
- A human power sells nothing from a colony while a warship of another power is within 5 squares.
  Computer powers are not affected. ("Warship" means any ship
  with an attack value, whatever the relations.)
- The sale comes after the builders have taken their tools.

### Recruiting, training and purchases (R-404)

- Three would-be immigrants wait in a pool. A new member is drawn like this, with t = 1, 2, 2, 3, 3
  by difficulty for a human (a computer power always uses 2): a petty criminal with chance t in 15;
  failing that an indentured servant with t in 10; failing that a free colonist with t in 8;
  failing that a skilled colonist.
- The skilled draw is weighted out of 25: master carpenter 3; expert farmer, fisherman, lumberjack,
  ore miner and seasoned scout 2 each; silver miner, distiller, tobacconist, weaver, fur trader,
  blacksmith, gunsmith, preacher, statesman, hardy pioneer, veteran soldier and Jesuit 1 each. It
  never repeats a calling already in the pool, and when the pool is already all skilled it gives a
  free colonist instead. The planters, the trapper and the teacher never come this way. The year
  plays no part.
- First pool: an indentured servant (a petty criminal on the hardest level), then two draws, the
  last always skilled and the middle one skilled below the fourth level. A human on the easiest
  level starts with carpenter, farmer and scout; on the second with servant, farmer and scout.
  Spain's first slot is always a Jesuit.
- Passage for any one of the three costs S less a discount, where S = 20 x (paid recruits + level +
  7), the floor m is the larger of 100 and S / 5, and the discount is (S - m) x crosses / (crosses
  needed + 1), rounded down. Never less than 10. Paying resets crosses to nothing, counts as one
  more paid recruit, and the slot is refilled with an ordinary draw.
- Stepping ashore: a hardy pioneer comes as a pioneer with 100 tools, a Jesuit as a missionary, a
  seasoned scout mounted, a veteran soldier armed and, one time in (5 + level), also mounted
  (one in 6 for a computer power). University graduates are fitted
  out the same way but without the dragoon roll.
- University prices are the fixed column of the jobs table. Artillery is 500 plus 100 for each
  already bought in Europe; ships have constant prices.

### Immigration (R-405)

- Crosses needed = 8 + 2 for every colonist in the power's colonies and every unit it owns, capped
  at 4000. England needs two thirds of that (rounded down); a computer power needs (8 - level)
  eighths. Brewster does not change it.
- Each turn the crosses also drift: +2 while nobody waits on the docks; -2 for each person waiting
  there, once the power has had its first immigrant. Never below zero.
- When crosses exceed (not merely reach) what is needed, someone comes over free and the crosses go
  back to zero; the overshoot is lost. One of the three pool slots is taken at random. The vacancy
  is refilled with a draw, which is forced to be skilled on turns divisible by four.
- With Brewster a human power picks which of the three comes, and the vacancy gets an ordinary
  draw. Criminals and servants no longer enter the pool, and those already there are replaced by
  free colonists when he joins. We settle an unanswered choice by lot at the end of the turn; a
  computer power with Brewster takes one by lot.
- The newcomer stands on the docks on sentry and boards the next ship to sail.
- Nothing of this happens after independence is declared.

### Royal events (R-406)

- **Expeditionary Force.** It starts at 15 + 8L regulars, 5 + 5L cavalry, 2 + 6L artillery and
  2 + 3L men-of-war (L = difficulty level 0..4). Every tax paid (sales, Custom House, back taxes)
  goes into the royal purse, plus 10 + 8L each turn, doubled from 1600, again from 1700 and again
  from 1750. Each 1800 in the purse adds a unit: cavalry while cavalry < (regulars + 2) / 3,
  otherwise a regular; artillery instead while artillery < regulars / 4; a ship instead while
  ships < (regulars + cavalry + artillery + 5) / 10. Nothing is added after the Declaration.
- **War in Europe.** Human powers only; never with Franklin; needs (L + 2) x turn >= 800, at least
  one rival at peace with the player and none at war; not on a turn with a tax event. Roll
  0..20 x (4 - rivals at peace); war comes when the roll is no more than L. A rival at peace is
  picked at random and the two are at war. Aid: 100 x (L + 1) gold and one veteran soldier on the
  docks; against a stronger rival, 25 gold more per point of its lead and one soldier more per 8
  points, capped at 500 x (5 - L) gold and 6 - L soldiers. Strength
  is the summed attack values of a power's units.
- **The King's frigate.** On every eighth turn before the Declaration, a power with no frigate is
  offered one if a foreign frigate is within 5 squares of one of its colonies, or foreign warships
  are near more than three of them. A human who accepts pays 10 points of tax in the usual
  way (so a party may follow); the ship sails from Europe. A computer power gets it free.
- **Treasure.** For carrying a treasure home the Crown keeps the larger of twice the tax rate and
  50 + 5L percent, at most 90; with Cortes it keeps only the tax rate. After the Declaration the
  treasure is cashed whole. The fee also goes into the royal purse (wired
  when treasure trains exist).
- **Mercenaries.** One turn in 21 before the Declaration a Crown is drawn at random; it must be the
  player's own or one at peace with the player. The band is 1-3 veteran dragoons, then on a coin
  toss either one more dragoon or artillery (one piece, or two on a second toss). Price =
  (2 x (L + 4) + 0..6) x 100 for each dragoon and twice that for each gun. The offer is made only
  if the treasury can pay, and is all or nothing. They muster in the
  player's most populous colony. The wartime variant is R-902.
- **War of Succession.** In a game with one human power, the first time its rebel sentiment
  reaches 50% (or at the Declaration) the smallest computer power is absorbed by the next
  smallest, sizes being 3 x ships + 2 x colonies + colonists. Its colonies change hands with their
  Sons of Liberty reset, as do its units on the map, its map knowledge and claims; whatever it had
  in Europe or at sea is lost; it takes no more turns.
- **Independence for rivals.** Each turn before the human's Declaration, a computer power's rebels
  = min(100, sentiment x colonists / 100). At 10 x (8 - L) it is granted independence (it plays
  on). Talk of it is reported when rebels come within 20 of the mark and exceed the last figure
  reported, and again when they fall more than 5 below that figure.
- There is no "King demands gold" event.

### Tribes (R-500)

- Eight tribes in four levels of advancement, as listed in the rule tables. A new settlement holds
  3 + 2 x level people (3 / 5 / 7 / 9). The capital is the first settlement placed for a tribe; it
  starts the same and may grow by level + 1 more (4 / 7 / 10 / 13).
- Each settlement has one brave abroad at most. A growth counter gains the population each turn;
  at 20 it replaces a missing brave, or failing that adds one person up to the limit.
- Land: a tile belongs to the nearest settlement within its reach, using distance = larger offset +
  half the smaller. Reach is 1 for camps and villages, 2 for the Aztec and 3 for the Inca.
- Feeling toward a European power is two numbers: tribal alarm 0..100 with levels at 25, 50 and 75,
  and a per-settlement alarm with marks at 64 (ships turned away) and 128 (hostile). Tribal alarm
  starts at 0..14 plus twice the difficulty level for a human, and is cut to 20 on first meeting.
- A tribe starts with no muskets and no horses. At most 84 settlements exist.

### Settlements (R-501)

- **America map.** Each tribe's listed sites are used in order, the first being its capital. A site
  is tried up to 100 times, each time shifted by two throws of -1..1 on each axis. The tile must be
  empty level ground of tundra, plains, prairie, grassland, savannah or marsh (wooded or not) and
  more than 3 tiles from any other settlement; the spacing eases to 2 after 33 tries and 1 after
  66.
- **Random map.** Capitals first, in tribe order: a random land tile away from the edges, not hills
  or mountains, in an empty 5 x 5 cell, far from every other settlement (the demanded distance
  starts at 90 and eases by one every four tries); the Inca and Aztec capitals are also held to
  the west, the limit moving east as tries pass. Then up to 2160 attempts while fewer than 84
  settlements exist: pick a tribe at random, wander cell by cell from its capital's cell to the
  first empty one (give up on leaving the map), and put a settlement on a random fit tile among
  the nine in the middle of that cell that has no settlement beside it. It belongs to the tribe of
  the nearest existing settlement, not to the tribe that was picked.
- A settlement keeps: people, a growth counter, whether it has taught, whether it has paid
  tribute, alarm at each power, a mission (owner, expert or not), which powers' scouts have
  visited, and the last good it bought and sold. What it teaches, wants and sells is not kept; it
  is worked out from the land around it when asked.
- A tribe keeps: alarm and goodwill toward each power, whom it has met, muskets, horses, land sold,
  and a memory of recent trade in each good.
- Land masses are not tracked for land ownership. Capitals on a random map must stand on level
  non-arctic ground.

### Alarm (R-502)

- **Changing tribal alarm.** Kept within 0..100. An increase is halved (rounded down) for the
  French, and halved again for a power with Pocahontas. When a fall crosses a multiple of 5, every
  settlement of the tribe has its own alarm at that power capped: at 32 if the tribe is now at
  level 0 or 1, at 96 otherwise. When a rise leaves alarm at 100, the tribe burns that power's
  missions with chance (level + 2) in 11 (a computer power counts as level 1).
- **Goodwill.** Small effects are banked per tribe and power; every 8 points of goodwill take one
  point off tribal alarm, and every 8 of ill will add one.
- **Each settlement, each turn**:
  1. Growth: below its limit, the counter gains the population; at 20 it resets and one person is
     added.
  2. Cooling, for each power the tribe has met, with L the attitude level: L x L + 1 throws, each
     adding a point of goodwill one time in 13 - L x L. Skipped once independence is declared.
  3. Pressure: the single most alarming colony is found (below). Its amount (doubled for a
     capital) is taken from goodwill, and added to the settlement's alarm (halved if that power
     has the mission here) together with a fifth of the tribal alarm.
  4. Mission: 1 goodwill a turn, 4 for an expert; doubled at a capital and with las Casas, halved
     with Sepulveda; the settlement's alarm falls by three times as much.
  5. Goodwill is turned into alarm changes.
- **The most alarming colony**: for each colony within distance 6 (d), with
  pop colonists, p6 = min(pop, 6), and W = difficulty level (0 for a computer power) + ((B - 8) >> 2)
  where B is the number of buildings scaled for a human by 1/2, 3/4, 1, 3/2, 2 by level:
  amount = ((2 x (pop - p6) + min(pop / 2, tribe level) + p6 + W) x 2 - d - 1) / (d + 4). Add the
  power's military presence. Halve for the French and again for Pocahontas. The largest positive
  amount wins. A mission in the settlement then scales it: a rival's x 1.5 (x 2 if expert), the
  colony owner's own x 0.75 (x 0.5 if expert).
- **Military presence**: attack values of land units with attack above 1 on the 20 squares around
  the settlement (the 5 x 5 block without its corners); a square inside a colony counts half, and
  a square not adjacent to the settlement counts half (both may apply).
- **First contact** caps the tribe's alarm at that power at 20.
- Land masses are not tracked: a colony on another land mass counts in full. One-off changes
  (trade, gifts, tribute, attacks, land) are listed with the features that cause them.

### Native demand and supply (R-503, used by R-505 and R-508)

Nothing is stored: both are worked out from the 5 x 5 block of tiles around a settlement (tiles a
colony is working are skipped), with P = population + 1 and t = the tribe's level.

- Census. Each ocean tile adds t + 1 to a counter and every 3 of that is 2 food. A forest tile
  gives 1 food. Open plains 5 food (and 1 cotton), prairie, grassland and savannah 3, marsh and
  swamp 2. Sugar: savannah 4, swamp 2, tropical forest 2. Tobacco: grassland 4, marsh 2, conifer
  forest 2. Cotton: prairie 4, plains 1, broadleaf forest 2. Ore: tundra 2, marsh and swamp 1.
  Hills and mountains are counted. Fur-rich forests are boreal, scrub and mixed; the rest are
  fur-poor. Cold: arctic 4, tundra 3, fur-rich forest 2, plains and prairie 2. Heat: desert 4,
  grassland and savannah 2, other forest 1.
- Supply. Food (t + P) x food / (7 - t). Silver (cities only) tribe silver / settlements + 4 per
  mountain (8 for the Inca). Ore (not camps) 2 x hills + mountains + ore. Furs (2 x rich +
  poor / 2) / (t + 1). Coats furs + t, cloth cotton + t (each rounded down to even). Sugar,
  tobacco and cotton as counted. Horses tribe breeding / (settlements / 2 + 1).
- Demand. Food 4 x P x P (halved for cities), but none if there is any supply. Tobacco (6 - t) x P
  + 2 x cold + 5. Cotton cloth supply + heat. Rum 2 x (2 x (2t + P) + heat). Cigars 2 x (2P - t +
  7). Cloth (t + P) x P + heat / 2 + cold. Coats 8 x cold + fur supply. Trade goods (t + 2) x (P +
  3) + 8. Tools t x P doubled (cold / 2 + 1) times, none for camps. Muskets 4 x (7 - tribe muskets
  - t). Horses 4 x (9 - tribe herds - t). Each kept within 0..50.
- A capital doubles its demand for the eight raw goods, raises demand for trade goods, tools and
  muskets by half, and doubles its supply of silver and everything after it in the goods order.
- Tribal memory s of trade in a good: if positive, demand changes by 2 x trunc((-50 - s) / 100);
  if negative, supply changes by 2 x trunc((s + 50) / 100).
- Last, supply loses half the demand and demand loses half the (earlier) supply; each stays at
  least 1 if it was positive.
- The goods "wanted" are the three with the largest demand, leaving out what the settlement last
  bought and last sold.

### Entering a settlement (R-503)

- **First contact.** When a tribe first has a power's land unit or colony beside one of its
  settlements, it has met that power: its alarm is cut to 20 at most and it proposes a treaty. A
  human may accept (peace) or refuse (alarm +100); a computer power accepts. The treaty grants no
  land. An unanswered treaty is taken as accepted at the end of the turn.
- **Menu.** A ship is turned away if the tribe has not met the power on land,
  or tribal alarm is 75 or more, or the settlement's alarm is 64 or more. A wagon train or ship
  trades while tribal alarm is under 75 and otherwise can only enter as into a hostile village. A
  scout may speak with the chief. Only under the treaty: a missionary may found a mission (if
  there is none), denounce another power's mission, and incite; a colonist or pioneer (not a
  convert) may live among the natives; a unit with an attack value may demand tribute. A land unit
  with an attack value may always attack. The greeting is friendly below 25 tribal alarm, wary
  from 25 or when the settlement's own alarm is 128 or more, sullen from 50, hostile from 75.
- **Speaking with the chief.** Roll R = 0..100 (0..140 for a seasoned
  scout). The scout is killed if tribal alarm T is 75 or more, or T is 25 or more and T / 4 >= R.
  The Arawak also kill one scout in 9 - level (half as often for a seasoned scout). With Coronado
  a scout is never killed; nothing happens instead. Otherwise, if R > T and no scout has yet been
  favoured at this settlement, one of three equally likely favours: promotion to seasoned scout
  (tales instead if already one); tales that reveal the country 6 squares around; or gold = three
  throws of 1..(10 - level) summed, times 1..6, times 4, times (t + 1). The chief also names the
  goods his people want.
- **Demanding tribute.** P = the power's strength x 1.5, x 1.5 for Spain,
  x 1.5 with Cortes. N = the tribe's strength x 1.5 x 2 + T / 2. It succeeds if a throw of 0..N is
  below a throw of 0..P and the power has a colony. If it fails with P <= N, or T >= 75: they
  laugh. Else if it fails and T >= 50: they refuse. Else if it fails or the settlement has paid
  before: they plead poverty (no change of alarm). Else they pay once: the good they have most of
  goes to the power's nearest colony, as much as fits its warehouse but at least 10 and at most
  min(3 x supply + 10, 100). Alarm rises by level + 1 for a human (1 for a computer power),
  doubled when tribute was paid.
- Strengths are whole-map totals (hence the x 1.5). A power's strength is the summed attack values
  of its units; a tribe's is that of its braves, or its number of settlements until braves exist
  (R-507).
- A visit ends the unit's move for the turn.

### Missions (R-504)

- **Founding.** Always succeeds and uses up the missionary. The mission is an
  expert one if the missionary is a Jesuit or the power has Brebeuf. Tribal alarm changes by
  8 x M - {25, 15, 10, 5} by attitude level, M being the missions the power already has in the
  tribe (doubled with Sepulveda; halved with las Casas, with Pocahontas, and for France). At a
  capital the change is 8 larger in whichever direction it already points.
- **Each turn** a mission earns goodwill and calms its settlement (see "Alarm").
- **Denouncing a rival mission.** Incumbent's weight X: over the tribe's
  settlements, the colony-pressure amounts charged to the incumbent, plus the population of every
  settlement holding a mission (x 2 expert, x 2 capital), plus the incumbent's tribal alarm (x 16
  at a capital). Challenger's weight Y: the pressure amounts charged to the challenger plus half
  its tribal alarm (none at a capital). At a capital each adds a throw of 1..20. Y is doubled if
  the incumbent's mission is expert. A throw of 1..X + Y at or under X means the challenger wins:
  the mission becomes the challenger's (a plain one), the challenger's alarm falls by (level of
  Y) + 1 and the incumbent's rises by (level of X) + 1. Losing reverses both signs. Both amounts
  double at a capital, and the challenger's doubles again against an expert mission. The
  denouncing missionary is removed either way.
- **Inciting.** Price = (6 x settlements + 2 x floor(might / 8) + 2 x
  muskets + 2 x horse herds) x (the payer's tribal alarm + 75); two thirds for France; less 250
  for each of the payer's missions in the tribe (1000 if expert, doubled at a capital), less 1500
  if the unit is a Jesuit, less 500 at the capital; never under 500. The tribe must have met the
  target and not already be at 75 alarm toward it. Paying sets the tribe's alarm at the target up
  by 100. The missionary is kept.
- **Converts.** The only peaceful source is a friendly visit to a colony by a brave from a
  settlement holding that power's mission: a throw of 0..15 under tribe level + 2, doubled for an
  expert mission (the visits themselves come with R-506). Winning an attack on
  a settlement that holds the attacker's mission brings a convert when a throw of 0..12 is under 4
  (8 for an expert mission), +4 for Spain, +4 with Sepulveda, -4 with las Casas.
  A convert unit outside a colony leaves after 8 turns.
  Las Casas turns every existing convert into a free colonist.

### Trade with natives (R-505)

Demand D and supply U are those of "Native demand and supply". L is the tribe's attitude level
toward the trader, d the difficulty level (0 for a computer power).

- **What they will look at.** Not the good they last bought, nor the one they last sold, nor one
  they have no demand for, nor the good a haggle last failed over.
  A computer power's cargo is never refused: the price formula below is applied whatever the
  good, so one with no demand fetches next to nothing.
- **Their price for a cargo** of q units (one hold, up to 100). Throw r = 1..5. Keenness k = 6, or
  7 for rum and everything after it in the goods order; trade goods lose a throw of 0..7; muskets
  gain 12 less the tribe's muskets, horses 10 less its herds, tools 1. Ill feeling a = 2 x L (none
  for muskets and horses), halved when D is 20 or more. m = 2 x (k - d - a + r + 4). Price =
  ((5r + max(0, m x D)) x q / 100) / 2, at least 1. Goodwill w = a throw of 0..1 + (D - a + 4) / 4.
  Their word for the goods is one of four by (D - a + 4) / 10.
- **Accept.** Gold is paid; the tribe's memory of that good rises by q; if w > 0 tribal alarm falls
  by 2w and the settlement's alarm by q (to nothing if q was 100). Muskets: the tribe's muskets
  +1 for 25 or more, +2 for 50 or more. Horses likewise for herds, and breeding stock rises by q/4.
- **Haggle.** Succeeds if w > 0 and a throw of 1..8w beats d: w falls by one and the price rises by
  a throw of D/2 + 1..2D + 1, times q / 100 (at least 1); the question is put again. Failure ends
  the talks, the settlement remembers the good, and tribal alarm rises by a/2 + 1.
- **Gift** (only before any haggling). w rises by one; tribal alarm falls by 4w; the settlement's
  alarm by 2q (to nothing if q was 100); the tribe's memory is unchanged; muskets +1, or a herd
  and q/4 breeding stock, whatever the amount.
- Either way the good becomes the one they last bought. (Muskets and horses are no
  exception.)
- **Their wares**, offered after a sale or gift if a hold is free and they have not been soured by
  a failed haggle over a purchase: the three goods of largest U, never trade goods, tools or
  muskets, with food replaced by coats. The quantity is what was just sold or given, a quarter of
  it for a ship. Asking price per hundred: 200 for goods up to silver, (8 - tribe level) x 50 for
  horses onward; from silver onward add the European price x (2d + 15); add a throw of 0..that
  sum; subtract 4 x U; add 4 x tribal alarm. Price = that x quantity / 100 + 10 x (d + a throw of
  0..2), at least 50.
- **Buying** costs the gold, makes the good the one they last sold (rum excepted), lowers the
  tribe's memory of it by the quantity, and lowers tribal alarm by a throw of 0..price/25 + 1.
  **Haggling** succeeds if the price is over 10 and a throw of 0..U/25 + 8 beats d + 1: a quarter
  comes off (never below 10), and one time in 8 - d tribal alarm rises by 1. Failure raises it by
  2 and they sell nothing more until the next sale or gift.
- **A hostile village** (tribal alarm 75 or more): throw 0..500. At or under the alarm the carrier
  and everything aboard are lost; at or under twice the alarm it is turned away; otherwise trade
  goes ahead.
- The tribe's memory of each good fades by tribe level + 1 a turn.
- There is no term for distance or for ship against wagon beyond the quarter quantity.

### Land combat (built with R-506; completed by R-600)

Strengths are whole numbers of eighths of a point.

- **A unit's own strength** is 8 x its attack value when attacking, 8 x its combat value when
  defending. A soldier or dragoon who is a veteran soldier has half again.
- **The defender's place**, in quarters q: a native settlement 2 (4 for the two city peoples),
  doubled for a capital; a colony 2, 4, 6 or 8 with nothing, a stockade, a fort, a fortress; in the
  open the terrain's defence figure. A defender whose order is Fortified (not on its first turn of
  fortifying) adds 2, but only while q is under 5. Defence = (q + 4) x strength / 4.
- **Ambush.** In the open the terrain normally helps the defender. When natives attack a European
  it helps the attacker instead, unless the defender is Fortified, when it helps nobody. (After the
  Declaration the rebels get the same against the Crown when attacking from outside a colony.)
- **The attacker**: strength x (4 + ambush terrain) / 4, then half again (every attacker has this).
- A human side then gains 4 - difficulty level eighths.
- **Fatigue.** With less than a full move left the attack is scaled to the thirds remaining.
- A unit with an attack value over 1 halves the defence of a unit whose combat value is under 2.
- **Artillery** outside a colony or settlement fights at a quarter, attacking or defending, unless
  the (European) defender is fortifying or fortified. Artillery in a colony attacked by natives
  defends at double.
- **Spain** has half again when attacking a native settlement (not braves in the open).
- **Only when the fight is real** (not in the odds shown beforehand): on the two easiest levels a
  human's colony attacked before turn 80 faces an attack cut by a quarter (level 0) or a half
  (level 1), and to nothing on level 0 if nobody under arms defends it; then, defending against a
  European or before turn 80, the attack is halved again. On the easiest level a human's own
  attack is doubled. Natives attacking a power's only colony have no strength at all. A human's
  colony holding half or more of its people defends with 4 x (4 - level) more.
- **Resolution.** One throw of 1..attack + defence: the attacker wins if it is no more than the
  attack. A plain brave attacking a human's artillery always loses.
- **Who defends a stack**: the unit with the largest defence, and among equals the one weaker in
  itself. In a colony only units with an attack value are considered; if there is none a colonist
  is drafted (combat 1, or 2 with Revere and 50 muskets in store). Artillery in the open that is
  not fortifying counts an eighth; in a colony against natives it counts double.
- **The loser** (land): dragoons become soldiers; soldiers become colonists; artillery is damaged,
  then destroyed; scouts, pioneers and missionaries are destroyed; colonists, wagon trains and
  treasure are captured by a European victor with an attack value, destroyed by natives. A beaten
  brave is destroyed, and half the time its muskets (+1 to the tribe) and horses (+25 breeding)
  go home.
- **Promotion.** A winning soldier or dragoon who is a criminal, servant or free colonist moves up
  one step (to servant, free colonist, veteran soldier) with chance L / (W + L + level), W and L
  being the winner's and loser's final strengths; the level is subtracted for a computer power,
  and a criminal counts 10 less, a servant 5 less. With Washington it is certain.
- An attack uses a full move; the winner stays where it was.
- **After the Declaration**, for a European attacker: against a
  colony, the Crown's troops have half again ("Bombard") and then gain the colony's Tory
  percentage; rebels retaking a colony gain its Sons of Liberty percentage (which includes
  Bolivar's 20). In the open the Crown's troops gain 5% per difficulty level. The shield the easier
  levels give a human's colonies does not apply to these assaults.
- **Continental line.** After the Declaration a rebel (human) veteran soldier or dragoon who wins
  is promoted by the same chance to Continental Army or Continental Cavalry. These lose a step at
  a time when beaten (cavalry to army to colonist); the Crown's cavalry become regulars, and
  regulars are destroyed.
- A soldier whose calling is Jesuit missionary becomes a missionary, not a colonist, when beaten.
- Attacking another power's unit puts the two powers at war (the confirmation asked
  when a treaty exists is the app's question).
- Naval combat has its own section below.

### Natives at war (R-506)

- **Attacking natives.** Tribal alarm rises by 5 + difficulty level (5 for a
  computer power) for attacking a brave, twice that for a settlement and six times for a capital,
  whoever wins. An attacked settlement's own alarm rises by 256. A settlement defends as a band of
  braves: armed if the tribe has muskets, mounted if its breeding stock is 25 or more.
- **Beating a settlement** takes one of its people each time; at one it is destroyed.
  The power's count of destroyed settlements rises, the tribe holds a
  grudge, its land is free. If the settlement held the attacker's mission a convert may follow
  (see "Missions"). Treasure appears as a treasure train on the ruins:
  camps one time in 7 (4 for Spain), 200-400; villages one time in 3, 300-800; both always from a
  capital (doubled) or with Cortes (half again). Aztec always (2-6) thousand, (4-10) thousand from
  the capital, +6 thousand with Cortes, +3 thousand for Spain. Inca always a throw of 2-6 times
  1600 (2500 from the capital; +1000 Cortes, +500 Spain).
- **Destroying a capital** cuts the tribe's alarm to 15 at most and calms all its settlements.
  When its last settlement goes the tribe is extinct.
- **A brave that wins in the open** takes horses from dragoons and scouts (the tribe gains a herd)
  or muskets from soldiers, if it lacks them. The tribe's alarm changes by -5 + level / 2. After any
  brave's attack its home settlement's alarm at that power returns to nothing.
- **A brave that beats a colony's defender**: if nobody under arms defended and the colony has one
  colonist, it is burned with everything on the square (the tribe gains a herd or a musket if the
  colony had any horses or muskets; alarm -50). Otherwise the tribe's alarm changes by -10 + level
  and a raid follows, after which the raiders go home. Nobody is killed in a raid.
- **Raid**, with F fortification levels. A throw of 0..12, less 1, plus
  level - 2 for a human's colony; under 3F + 1 nothing happens. Otherwise one of goods, building,
  ship, gold, equally likely, then: on the easiest level before turn 80 (second level before 40)
  building and ship become nothing; a building is kept only if a throw of 0..8 is at most level
  + 2 (else goods), and never with a fort; gold becomes goods behind a stockade; a ship is spared
  by a fortress; behind a stockade goods survive only if a throw of 0..8 is at most the level.
  Goods: a random good stocked at 10 or more (a tribe without horses goes for horses half the
  time), between min(10, half the stock) and half the stock; horses give the tribe a herd and 25
  breeding, muskets 1 (2 for 50 or more); alarm -4. Building: the top level of a random chain,
  never fortifications, the town hall, the carpenter's shop, the five basic craft houses or the
  chain under construction; alarm -12. Gold: a throw of 50..gold x colonists here / (all colonists
  + 1) + 10, nothing if the treasury is smaller; alarm -8. Ship damage (alarm -16) waits for
  ship repair (R-602) and is treated as nothing until then.
- **A brave at a colony's gate**, with T tribal alarm and S its settlement's
  alarm. Not at T >= 75. With S >= 128 (or after a demand this turn) nothing happens with chance
  (S - 129) / 128. The call is friendly if S < 128 and 4 x max(0, T - 25) + S is within a throw of
  1..328; never at T >= 50.
  1. Begging: if the settlement's demand for food exceeds its supply by n, the colony has 75 food
     or more, and a throw of 1..100 is within n, it asks for half the colony's food. Giving sets
     S to nothing and lowers T by 5 (10 for a capital), then by fives down to 70; refusing raises
     S by half.
  2. A friendly call sets S to nothing and brings, first that applies: a convert (see "Missions");
     food up to 75 if the settlement has food to spare and the colony 25 or less; one of the three
     goods it has most of (not food; silver only from cities), 100 / (European price + 1) of it,
     between 5 and min(supply + 5, 100), as far as the warehouse has room, at least 2.
  3. Otherwise, if a call has already been paid this turn or T >= 50, only black looks (S to
     nothing). Else a demand: the good worth most (European price x up to 100 in stock; horses
     +10 less the tribe's herds; muskets + a throw of 1..4 - tribe level + difficulty + 4), all of
     it up to 100, halved one time in level + 2. Handing it over sets S to nothing and lowers T by
     4 x value / 100 and then by fives to 70; muskets arm the brave (or the tribe), horses mount
     him (or add 50 breeding) and add a herd. Refusing raises S by 128.
  A computer power feeds beggars (Spain does not) and pays demands unless muskets are asked or a
  soldier stands in the colony. We give a human's unanswered demands at the end of its turn.
- A settlement that has lost its brave raises another before it grows (see "Tribes"): armed if the
  tribe has muskets (one is used up one time in level + 1), mounted if breeding is 50 or more
  (50 is used).
- Not built: demands on wagon trains; the tribe's loss of arms when a settlement is destroyed;
  the one-time confirmation before attacking a friendly tribe is the app's question.

### Native AI (R-507)

Braves stay near home, notice colonies and soldiers nearby, hunt
the units and colonies of a power their tribe (alarm 75 or more) or settlement (alarm 128 or more)
is hostile to, and pay a call when they end beside a colony. In detail:

- Each tribe's turn, after its settlements': horse breeding rises by the number of herds, up to
  twice (the tribe's people + 25). Then each brave moves until its movement is spent (20 steps at
  most).
- A brave standing in its own settlement takes muskets if the tribe has any (one is used up one
  time in level + 1) and horses if breeding is 50 or more (50 is used).
- If a hostile power has a land unit or colony within 9 squares, the brave heads for the nearest
  and attacks when beside it.
- Otherwise, beside a colony of a power its tribe has met, it pays a call ("Natives at war") and
  stops for the turn. Otherwise it wanders within 4 squares of home for the camp peoples and 3 for
  the others, two times in five heading for a colony within 5 squares of its settlement.
- Braves do not enter water, mountains, colonies or other settlements, nor a square holding
  another unit.
- A brave beside a power's land unit or colony that its tribe has not met makes the first contact.
- Peace returns of itself when tribal alarm falls below 75; there is no separate peace talk.
- After the Declaration, each tribe turn: a tribe that holds a grudge against the rebels (they
  destroyed one of its settlements), or whose alarm T at them is 25 or more and within a throw of
  1..400, sides with the Crown one time in 2 x (5 - level) + 1: alarm at the rebels +100, their
  missions burned.

### Learning from natives (R-508)

- **The trade a settlement teaches** is not stored. Take its supplies ("Native demand and supply")
  with these changes: horses nothing; camp peoples no coats or ore and half their food; peoples
  below city level no cloth, cigars or silver and three quarters of their food; rum only for the
  Inca; Inca silver half again. Pick a good in proportion to those figures, with a throw that
  depends only on the game and the settlement's position. Food gives farming, sugar, tobacco and
  cotton their planters, furs trapping, ore and silver their miners, coats fur trading, cloth
  weaving. A trapping settlement teaches scouting instead when x + y divides by 3. A farming
  settlement teaches fishing when a throw of 1..20 is under the number of water tiles among the
  20 around it.
- **Asking to be taught.** If tribal alarm is 50 or more they refuse and it rises by 3. A petty
  criminal is refused. Anyone who is not a free colonist or indentured servant is told he is a
  master already. A settlement that has taught once will not teach again, unless it is the
  capital. With alarm from 25 to 49 the lessons fail with chance (200 x level + 99) in 1000 and
  may be tried again. Otherwise the colonist takes up the trade, where he stands, and the
  settlement is marked as having taught.
- Indian converts cannot ask at all (the menu does not offer it).

### Lost City Rumors (R-509)

The explorer's skill e is 0 for an ordinary unit, 1 for a scout, 2 for a
seasoned scout; De Soto adds 1 for scouts and nothing for others. A count of rumors explored by
anyone is raised first. Two throws: o = 1..9 and q = 1..100 + 10e.

1. **Fountain of Youth**: eight immigrants from the docks pool, the human picking each, free and
   without touching the crosses. Needs grassland, savannah, marsh or swamp (wooded or not) and a
   count of 4 or more, unless De Soto's scout. Failing that: the party vanishes if q <= 10, else
   nothing. After the Declaration it is a City of Cibola instead.
2. **A City of Cibola**: a treasure train worth (a throw of 1..20 + 10 x (e + 2)) hundreds. Needs
   hills, mountains, desert or scrub forest (for De Soto's scouts also one time in three anywhere)
   and fewer than seven found so far. Failing that: vanish if q <= 10, shrines if q < 25, else
   nothing.
3. **Ruins**: 30 x a throw of 1..8 gold, times (e + 2) / 2 for scouts.
4. **Burial mounds**: search or leave (below).
5. **The party vanishes**, but only one time in e + 1; never for a power with at most 4 colonists
   and 2 colonies; half the time not for a pioneer of a power with at most 8 colonists; and each
   power's first such loss is burial mounds instead. Otherwise nothing.
6. **Nothing but rumors.**
7. **A small friendly village**: 8 x a throw of 1..10 gold.
8. **Holy shrines**, one time in e + 1 and only if the nearest settlement's tribe has been met:
   its alarm rises by a throw of 1..6 + 5 x (level - e + 1). Otherwise nothing.
9. **Survivors of a lost colony**: a free colonist joins on the square.

De Soto's scouts throw again whenever the result is nothing, a vanished party or shrines; on the
second throw o is at least 2 and afterwards at least 3.

**Burial mounds, searched.** They are sacred if there is a nearest settlement, its tribe has been
met, and a throw of 1..(distance + 5) x 2^e is 3 or less. By q: under 25 empty; under 50 (under 65
if not sacred) trinkets worth 30 x a throw of 1..8; otherwise a treasure train worth 2 x (a throw
of 1..8 + 2 x (e + 5)) hundreds. If sacred, that tribe's alarm rises by 100 whatever was found.

Our own choices: the shrine test uses "within 2 squares of the nearest settlement"; mounds left
undecided are left alone at the end of the turn, and unpicked Fountain immigrants come by lot; a
computer power always digs.

### Native land (R-510)

- A land tile is native land to a power when it lies within the reach of the nearest settlement
  ("Tribes"), that tribe has met the power, the power has not bought or taken the tile, and the
  power does not have Minuit. A colony's own square is taken at founding without question.
- **Price**, with d the distance from the settlement and "sold" the
  number of tiles the tribe has already been paid for by anyone. Points: for a human 2 x (level +
  3) + tribe level + sold - d; for a computer power 12 + tribe level + sold - level - d. A power
  with fewer than 10 colonists (in colonies or as units) gets half the shortfall off. Doubled on a
  tile with a special resource; at least 1. Price = 65 a point for a human (50 for a computer
  power); a human pays it times attitude level + 1; half again at a capital; and then the whole is
  halved.
- **When it is asked**: putting a colonist to work
  on a native tile; a pioneer clearing a forest or building a road on one. Plowing open land and
  founding a colony are not questioned. The choices are to give up, to pay (if the treasury can),
  or to go ahead.
- **Paying** makes the tile the power's and counts toward "sold".
- **Taking** a tile for a colony makes it the power's and raises tribal alarm by k x (level + 5)
  (k x 5 for a computer power): k = 3 beside the settlement, 2 at distance two, 1 beyond; doubled
  on a special resource.
- **Working it unpaid**: when a pioneer finishes clearing or plowing native land, the same amount;
  finishing a road, k x (level + 3) (not doubled).
- A computer power pays when its gold is at least one and a half times the price, else takes.
- The first-contact treaty grants no land.

### Colonies under attack (R-601)

- **The defender** of a colony is its best armed unit ("Land combat"). If none is there, a random
  colonist is drafted at combat 1; with Revere and 50 muskets in store he fights at 2 and the
  muskets are issued and used up.
- **Capture.** A European attacker who beats a drafted colonist takes the colony: it changes owner
  with all its colonists, buildings and stores; the victor moves in; the surrounding tiles the
  loser held go to the captor; the two powers are at war. Before the Declaration the captor also
  takes gold: the loser's treasury times this colony's colonists over all the loser's colonists.
  The colony keeps two thirds of its Sons of Liberty. If an armed unit defended and lost, it is
  stripped as usual and the colony stands.
- The loser's other units on the square are taken with it (a veteran colonist becomes a free
  colonist); its ships there are damaged and sent away (below).
- A power fighting its War of Independence cannot attack colonies other than the Crown's.
- **Siege.** A colony is besieged when the fighting land units of powers it is not at peace with,
  on its square and the eight around it, outnumber its owner's; scouts and ships are not counted.
  While it lasts a colonist may leave the colony only as a soldier, taking 50 muskets from the
  stores. (The count is Revolution Now's.)
- **A scout at a foreign colony** may slip in. The risk is 2 x (6 + fortification levels) in 36,
  halved for a seasoned scout, plus level - 2 for a human. Caught, the scout is lost and the colony
  gains 100 horses; otherwise the colony can be looked over. Meeting the
  mayor is diplomacy (R-801).
- **Damaged ships** lose everything aboard and go to the owner's nearest colony with a drydock, or
  failing that to Europe; with no drydock and Europe closed by the war they sink. Repairs take, in
  Europe / in a drydock: caravel 2 / 1, merchantman 6 / 3, galleon 10 / 5, privateer 8 / 4,
  frigate 12 / 6, man-of-war 16 / 8 turns. A ship under repair cannot move or sail.

### Naval combat (R-602)

- **Who attacks.** Only privateers, frigates and men-of-war; only at sea (a ship in a colony is not
  attacked this way).
- **Strength.** A ship's table values in eighths; a privateer whose owner has Drake has half again;
  each hold in use (cargo or passengers) takes an eighth off. The attacker has half again and is
  subject to fatigue; a human side gets its small edge. No terrain, no fortifying.
- **Evasion.** If the defender's attack value is lower than the attacker's it may run. Each ship's
  nimbleness is its movement in thirds (with Magellan) + 3; doubled for a privateer; + 3 for a
  galleon; less 4 for each hold in use; at least 1. On a throw of 1..(both added) at or under the
  defender's figure it gets away untouched.
- **The fight** is one throw as on land. The loser is crippled or sunk; if it was the attacker,
  so be it. Whatever it carried the victor takes a hold at a time while it has room (the
  most valuable first); the rest is lost, as are units aboard.
  A victorious attacker moves onto the loser's square if nothing else is there.
- **Sunk or crippled.** A throw of 1..(victor's guns + loser's hull) above the hull sinks it. Then,
  for an unarmed loser: sunk for certain if its owner has more than 8 unarmed ships, or it is a
  caravel from turn 80 on; but crippled for certain if losing it would leave the owner with fewer
  holds (not counting it, four per frigate or one per privateer) than a quarter of its colonists,
  within 3..6. For a warship before the Declaration: sunk for certain if the owner has more ships
  of that kind than colonies, or more than 8 warships, or a frigate was beaten by a frigate of a
  power with fewer frigates; but crippled for certain if it is the owner's only one of its kind
  and the owner has a colony.
- **Repairs.** See "Colonies under attack"; a ship beaten by a weaker one is ready sooner: the
  repair counter starts at its own combat value less the victor's (twice the victor's for a fort).
- **Zone of patrol.** After each step of a ship at sea, every warship on a neighbouring sea square
  that belongs to a power it is not at peace with (any other power, if either is a privateer)
  may hold it up: 4 thirds for a privateer, 6 for a frigate, 8 for a man-of-war. With a the
  mover's nimbleness and d the patroller's + 2, on a throw of 1..a + d: under a it slips past, at a
  the cost is halved, otherwise it is paid in full.
- **Forts.** A ship ending a step beside a colony of such a power loses 2 thirds to a fort and all
  its movement to a fortress. In its own turn a colony with a fort (level 1) or fortress (level 2)
  fires on the first such ship on each neighbouring sea square with an attack of 4 x level x (1 +
  artillery in the colony), with the attacker's edge, against the ship's defence; the same figure
  serves as its guns. A stockade does not fire.
- **Privateers** fly no flag: attacking with one is not an act of war (attacking with a frigate
  or man-of-war is).

### Continental Congress (R-701)

- **Bells.** Each colony's liberty bells for the turn (after press, newspaper, Jefferson, Paine)
  are credited to its owner's Congress as that colony is processed.
- **Price of the next Founding Father**, n already seated: (n + 1) x base + 1, halved for the
  first. The base is 16 x (difficulty level + 3) for a human and 8 x (14 - level) for a computer
  power, and grows by half (rounded down, one step after another) at each of 1600, 1650, 1700 and
  1750. The number of colonies does not matter.
- **Candidate.** Whenever bells are credited and there is no candidate, one name is drawn from
  each of the five fields among those not yet seated, in proportion to the weight for the era
  (before 1600, 1600-1699, 1700 on); a weight of nothing cannot be drawn. A human picks one of the
  (up to five) names; a computer power takes the name from the field in which it has most still
  to gain this era, the later field on a tie. The draw is made afresh each time; nothing
  favours "higher level" fathers.
- **Joining.** When the bells reach the price he joins, the bells go back to nothing (any surplus
  is lost) and the next choice is put. The check follows each colony's contribution.
- No Founding Father is sought after independence is declared. A power can have all 25; fathers
  are not exclusive between powers and are never lost.
- **At once on joining**: Fugger lifts every boycott; La Salle gives a stockade to each colony of
  three or more; Jones brings a frigate from Europe; Pocahontas sets every tribe's and
  settlement's alarm at the power to nothing; Brebeuf makes the power's standing missions expert;
  las Casas frees every convert; Coronado reveals the country 5 squares around every colony of
  every power; Brewster turns the criminals and servants in the pool into free colonists.
- **Lasting effects** are in the rules they belong to: Smith (factories, Arsenal), Minuit (land),
  Stuyvesant (Custom House), de Witt (foreign trade), Magellan (ships), Coronado (new colonies
  revealed), De Soto (sight, scouts at rumors), Hudson (furs), La Salle (stockade at three), Cortes
  (treasure), Washington (promotion), Revere (militia), Drake (privateers), Jefferson and Paine
  (bells), Pocahontas (alarm), Bolivar (Sons of Liberty), Franklin (the King's wars), Brewster
  (immigrants), Penn (crosses), Brebeuf (missions), Sepulveda and las Casas (converts).
- A human's choice left unmade at the end of the turn falls on the first name offered.

### Nations (R-800)

- England: a third fewer crosses needed for each immigrant. France: increases of native alarm are
  halved. Spain: half again the strength when attacking a native settlement (and a little extra in
  treasure and converts). Netherlands: its home market takes a third less traffic from sales and
  recovers sooner. Each is applied in the rule it belongs to.
- **Landing party**: one ship on the eastern Sea Lane carrying one unit
  of soldiers and one of pioneers with 100 tools, and no other cargo. The Dutch ship is a
  merchantman, the others caravels. The French pioneer is a hardy pioneer. The soldier is a veteran
  for Spain always, and for a human power on the two easiest levels; otherwise both are free
  colonists.
- A human's starting treasury is 1000, 300, 0, 0, 0 by difficulty; computer powers start with none.
- The three leader traits (aggressive or friendly, expansionist or perfectionist, civilizing or
  militaristic) are read only by the computer powers' decisions (R-802).

### Diplomacy (R-801)

- **State.** Between two powers there is no contact, war, or a treaty of peace; contact without a
  treaty is war. Beyond that each remembers of the other: a grudge (a treaty broken, or others set
  upon it), piracy (its ships attacked by the other's privateers), an intention to break the
  treaty, a truce it has bound itself to, and when they last talked. There is no alliance and no
  attitude number.
- **Meeting.** When a power's land unit or colony stands beside another's on land, they have met.
  A computer power then asks a human for an audience, but again only 16 turns after the last,
  unless a scout asks at a mayor's door. Nothing happens once the human has declared independence.
- **Sizing up.** Before an audience the computer power reckons: its fear of the human (the human's
  strength over its own armed units, when the human is the stronger); a demand, from how much
  stronger it is plus twice the human's troops at its colonies' gates, scaled by difficulty,
  doubled by a grudge, quartered at a first meeting, reduced early in the game and for a small
  power, turned into gold in steps of 50 (at most 20,000), raised during a war the King ordered,
  cut to fit a treasury it only slightly exceeds, and halved by Franklin; and whether to take a
  hard line: troops at its gates, a King's war, a grudge with strength to back it, or the human
  bullying as the strongest power late in the game - but never when it is afraid, has nothing to
  demand, is far weaker, faces Franklin, is early in the game without a grudge, or has too many
  wars on already.
- **The audience**, in order, each a question for the human: piracy (agree: privateers at sea go
  home, the demand shrinks, the hard line is dropped); troops at their colonies (agree: they are
  sent home, 100 gold off the demand per point, hard line dropped); tribute, if it is taking a
  hard line and the human can pay, a treasury equal to the demand included (pay, or refuse). If it is still taking a hard line at the end:
  war if a treaty is in force and the demand is over 100, or if tribute was refused; otherwise
  only a threat. If not, and there is no treaty, it proposes one; refused, a power that fears the
  human offers gold for peace (100 x the lesser of its hundreds of gold and 2 x (fear - 2)).
- **With a treaty** the human may: go in peace; ask it to withdraw its troops from beside the
  human's colonies (it does if afraid; otherwise for 25 x (level + 2) gold per point of those
  troops, doubled by a grudge, half again if it came in anger, halved by Franklin, at least 100 -
  or the human may threaten, which works if the human's strength reaches a throw of 0..both
  strengths, and means war if not); ask "how much do you value your lives" (it pays 100 x the
  lesser of its hundreds of gold and its fear; if it is not afraid and came in anger, war); or pay
  it to make war on a third power or a tribe it has met (50 x a figure from the human's gold and
  the target's strength, kept between 10 and 200; the target power bears the human a grudge).
- A talk that ends in peace binds the computer power for 2 x (6 - level) turns (half with
  Franklin).
- **Acts of war.** Attacking a treaty partner's unit or colony breaks the treaty and leaves the
  victim with a grudge. A privateer's attack changes nothing openly, but the victim marks the
  piracy and, (level + 1) times in 101, takes a grudge (if weaker) or resolves to break the
  treaty (if not). A computer power so resolved breaks it one turn in four once its truce is over.
- **Computer powers with each other**, on meeting and then every third turn, if neither bears a
  grudge: each wants war only if no human is the strongest power, it is turn 40 or later, one of
  the two has more than 7 colonists, neither is independent, and four times its strength over the
  other's is at least its wars in hand, less its leader's aggressiveness, plus 4. If neither does
  they sign a treaty; otherwise it is war.
- **Trade in foreign colonies.** A ship or wagon train beside a foreign colony may sell it a cargo
  if there is a treaty and the seller has de Witt. It is a
  cash sale at three quarters of the buyer's home price, limited by its treasury.
- Simplifications: strengths are whole-map totals; "withdrawn" units return to the docks in
  Europe; the demand for goods instead of tribute and the joint-war proposals are not built; an
  audience left unattended is settled with the mildest answers at the end of the turn.


### Computer powers (R-802)

What a computer power does is set out section by section below. Numbers are in
`src/engine/data/ai.ts`.

- **Same rules.** A computer power plays through the same actions as a person: nothing it does
  bypasses validation, and its turn is recorded in the session log like anyone's.
- **Expansion.** Whether a colonist founds a colony or joins one, how a square is rated as a
  site and what a settler reckons it worth are under "Computer powers: founding and joining".
  A ship or a party on foot takes the site whose worth, less 4 for every square it lies off,
  is highest (`AI_PLAN`); a ship looks 14 squares about and then the whole map, a party 7
  squares and then 14.
- **Landing.** A ship carrying founders makes for water beside the best site within reach; they
  step ashore and found the colony. Passengers who are to join a colony are taken to a port
  chosen as under "founding and joining".
- **Colonies.** Who works at what and what is built are under "Computer powers: the colony";
  what becomes of a colony's produce is under "Computer powers: freight".
- **Europe.** An empty ship sails home. What a power does there is under "Computer powers: on
  the docks"; what ships it buys, and the gold it is given, under "Computer powers: the treasury
  and the fleet".
- **War.** Troops guard, march and fight by the rules of "Computer powers: campaigns" (R-807).
- **Independence.** A computer power is granted independence by colonist support under R-702.
- **First colony.** Until it has one, a power counts distance six times over when weighing
  sites (24 a square), so it settles the nearest fair place; a ship judges every site by how
  far it must really sail to lie beside it. A ship does not wait beside a landing square somebody
  else is standing on, and puts its settlers into a colony if no site can be reached at all.
  From turn 6 a power still without a colony founds one wherever its settlers stand, if the
  ground allows.
- **Liberty.** A seat in the Town Hall is weighed against every other job a colonist could do
  (the statesman's weight, under "Computer powers: the colony").
- **Garrison.** How many defenders a colony wants, and how it arms its own people, are under
  "Computer powers: arming and taking in colonists". A soldier brought into port goes ashore as
  a soldier.
- **Braves' calls.** A brave beside a colony at peace pays a call on about one turn in eight
  (the visit itself is that of "Natives at war").
- Leader traits beyond expansion affect diplomacy (R-801) but not this policy.

### Computer powers: wagon trains (R-804)

Numbers are `AI_WAGONS` in `src/engine/data/ai.ts`.

- **Building one.** A colony chooses a wagon train as its next build when no wagon serves it,
  the year is before 1600, a native settlement stands on its landmass, the alarm toward the
  power of the nearest settlement's tribe is below 50, and no foreign unit it counts as a threat
  stands next to it. One wagon serves one colony.
- **Loading.** In its colony an empty wagon first unloads, then takes one cargo: min(stock, 100)
  of the good with the best positive score. For each good in the goods order: never lumber,
  tools or muskets; nothing with under 50 in store. p = the power's price level for the good;
  while p >= 2 and a throw of 1..4 is 1, p falls by 1. limit = 8 for trade goods, 4 otherwise;
  no score unless p < limit. s = stock, doubled when stock >= the warehouse capacity and the
  good is not food. Score = s x (limit - p) + 5 x (1 - p); a tie keeps the earlier good.
- **Going.** Loaded, it goes to the nearest settlement on its landmass, any tribe, any attitude; a
  capital counts at half its distance (rounded down, at least 1). With no settlement on the
  landmass the wagon is disbanded, cargo and all. Empty and away from home it returns to its
  colony; with no colony of its power on the landmass it is disbanded.
- **The sale.** On entering it trades (a wagon train always chooses Trade With Village): one
  cargo picked at random is offered, the village's first price is taken, no haggling. The
  village never turns a computer power's cargo away (see "Trade with natives"). The
  village then offers its wares as to a human; the power buys the one whose price level in
  Europe is highest (the first on a tie) at the price first asked, if it has the gold, and
  otherwise nothing. What it bought is unloaded at home.
- **Trade goods.** A colony with a wagon asks for trade goods while it holds under 100 and
  their price level is 3 or less; they come only by ship (see "Computer powers: supplies by
  ship").
- **Ships** of computer powers never trade with a settlement.
- *Price level* is the level the market keeps for the power, one above the bid.
- *Which colony a wagon serves:* a wagon standing in one of its colonies serves that one; the
  others, in order of id, each take the nearest colony on their landmass that no wagon has yet.
- *Where it is in its round* is read from its orders: on sentry in its colony it has unloaded
  and may load; on sentry beside a settlement it is there to trade, and has traded once its
  moves are spent.
- *A threat* next to a colony is an armed unit of a European power it has no treaty with, or of
  a tribe whose alarm toward it is 50 or more.
- *Building it.* The wagon train has its place on the colony's building list (see "Computer
  powers: the colony"): after the stockade, stable, warehouse and custom house, and only in a
  colony of four or more. Ships and the Custom House carry off most of what a wagon would
  sell, so a wagon's sale by a computer power is uncommon.

### Computer powers: missions (R-805)

Numbers are `AI_MISSIONS` in `src/engine/data/ai.ts`.

- **Making one.** On the docks in Europe, after soldiers have been fitted out, a waiting
  colonist becomes a missionary when the power has none, the turn is after 50 and divisible by
  7, from turn 200 on only if a throw of 1..4 is 1, and for a skilled colonist only if a throw of
  1..8 is 1. The unskilled (free colonist, servant, criminal) are looked at before the skilled.
  One missionary per power at a time.
- **Where it goes.** Each settlement on its landmass scores T x 8 / (distance + 1), T being the
  tribe's alarm toward the missionary's own power, plus half again (rounded down) at a capital.
  A settlement holding its own mission is left out unless the power could incite there with
  2500 gold in hand. The highest score wins and a tie keeps the earlier settlement. With no
  candidate the missionary becomes a colonist again.
- **On entering.** Incite against the human player when the tribe has met that player, its
  alarm toward them is below 75, the power ranks below them and has 1500 gold: always where a
  mission stands, and when a throw of 1..5 is not 5 elsewhere. Otherwise found a mission where
  there is none, do nothing at its own, denounce a rival's.
- **Rank** = gold / 100 (rounded down) + 2 x colonies + colonists + land strength (summed attack
  values of land units).
- **Other units on entering:** a wagon train trades; a scout speaks with the chief; soldiers,
  dragoons and artillery attack; a free colonist or servant lives among the natives when tribal
  alarm is below 75; everything else does nothing. Computer powers never demand tribute.
- **Stepping in.** A free colonist or servant next to a settlement that has taught nobody, with
  tribal alarm below 25 and the settlement's own alarm below 64, goes in; so does a scout next
  to a settlement whose chief nobody's scout has yet spoken with, with tribal alarm below 25.
- A candidate needs no alarm at all: among calm peoples every score is 0 and the first settlement
  listed is taken.
- "Becomes a colonist again" needs a colony: the missionary walks to the nearest colony of its
  power on the landmass and changes there.
- The missionary is made whether or not a ship lies in port. A ship with only a missionary
  aboard takes him to the nearest colony, where he goes ashore on foot.
- Inciting also needs the tribe's price (see "Missions"); when the power cannot pay it the
  missionary goes on to the next choice.
- A computer power's own scouts and artillery are not otherwise sent toward settlements by this
  policy; soldiers reach them through the attack requests of "Computer powers: campaigns".

### Computer powers: warships and privateers (R-806)

Numbers are `AI_NAVY` in `src/engine/data/ai.ts`.

- **Stations.** Each turn a power lists squares it wants a warship on, each with a priority:
  3 at every ship it can see of a power it is at war with, and at every foreign privateer it can
  see whatever the treaty; 2 + min(2, (population + 4) >> 3) at the blockade square of every
  port colony of a power it is not at firm peace with; 5 at each of its own port colonies with
  a foreign armed ship within 5 squares, 8 if one of them is a frigate. The list is kept most
  pressing first. A human's colony on a square the power has not seen is not blockaded while
  difficulty level (0..4) x turn is 180 or less.
- **Firm peace** is a treaty the power does not intend to break. A power not yet met is not at
  peace.
- **The blockade square** is, of the 16 squares exactly two from the colony that are open sea,
  the one with the most open-sea neighbours that touch the colony (the first such in reading
  order; at least one is needed).
- **Dispatch.** K = the power's land units / 8, kept within 3..99; every station starts with
  load K. Privateers, frigates and men-of-war, in unit order, each take the station with the
  lowest load x distance / (priority + 1) (integer; the first on a tie), provided
  (3 x priority) >> 1 >= score / K. That is about 11, 19, 34 and 47 squares at priority 2, 3, 4
  and 5. The station's load then rises by 1. A ship holds its station once there.
- **Fighting.** A ship with a whole move left attacks an enemy ship on a neighbouring square at
  any odds. A treaty stops that unless the attacker or the target is a privateer. Ships never
  attack land squares or colonies. After the Declaration only the human player's ships are
  attacked or sought.
- **Privateers** answer only these stations: nothing sends one after the shipping of a power at
  firm peace, and it meets such ships only when they come alongside. A privateer carries for its
  power only while more than one of its ports has a foreign frigate within 5 squares, or the
  ports so beset hold more than 6 people.
- *In sight* means within the sight range of one of the power's units, or within 2 squares of
  one of its colonies.
- A ship already on its way to a station is counted in that station's load before the others
  choose; a ship with people aboard is left to its transport's work.
- With no station to keep, a privateer or man-of-war lies in its nearest port and a frigate
  goes back to ferrying.
- A power not yet met is attacked only by privateers.
- *Getting one.* Warships are bought in Europe by the round of buying described under
  "Computer powers: the treasury and the fleet". Privateers and men-of-war sail from Europe
  without waiting for passengers.
- Not built: a one-turn-in-four test for ship holds in the blockaded colony; seeking frigates
  only after the Declaration.

### Computer powers: the treasury and the fleet (R-806, R-802)

Numbers are `AI_FLEET` in `src/engine/data/ai.ts`.

- **Subsidy.** At the start of each of its turns from turn 20 a computer power is given
  4 x D x s gold, where D is the difficulty level (0..4) and s = (year - 1500) / 50 (rounded
  toward zero) + its colonies, doubled from 1700; half again at D = 3 and doubled at D = 4.
- **The others' threat** T = (their privateers + 4 x their frigates) / 4, summed over the other
  powers and rounded down.
- **Beset.** A colony is beset by a foreign warship within 5 squares, and separately by a
  foreign frigate. Enough is beset when half its colonies (rounded down) are no more than those
  beset, or half its colonists no more than the people in them, or the game is late and it has
  gold: after turn 200 with 2000 for a frigate, after turn 100 with 1000 for a privateer.
- **Answering the human.** With any colony beset and T not 0: it wants a frigate when enough is
  frigate-beset, it has none and the human has one; failing that it wants a privateer when
  enough is beset, it has fewer than 2 and the human has one.
- **Gold made up.** Its gold is raised to the price of a caravel if it has no ship at all, of
  a privateer or frigate if it wants one.
- **Lag and transport.** It lags at sea when it wants a frigate, has fewer warships than the
  power with most, or more than one power has the most. It is short of transport when
  (colonists / 2 + 2 x colonies) / 2 is at least its cargo holds. It buys nothing unless
  colonists / 2 + colonies is at least its holds.
- **The round of buying**, before any Declaration, at most one a turn: the frigate it wants;
  the privateer it wants (if either cannot be paid for, nothing else is bought); with fewer
  than 8 warships, on a coin toss, and lagging, a frigate; three times in four a galleon; on a
  coin toss, with fewer than 12 holds, a merchantman; with 2 holds or fewer a caravel; with
  fewer than 4 warships, one time in four, lagging and not short, a privateer. Each is passed
  over if the gold is not there.
- **Artillery**, besides: with none on its docks, some colony out of muskets, one time in
  four, not short, and more than 4 holds, it buys a piece.
- The subsidy and the made-up gold are applied by the engine at the start of the power's turn;
  the buying is done by the policy through the ordinary purchase action, first thing in Europe.
- "Out of muskets" means a colony holding none.
- Not built: taking away a power's men-of-war after the Declaration (computer powers never have
  one).

### Computer powers: the colony (R-802)

The placement on the land used here is the scoring of squares set out below, not that of
"Automatic placement". Numbers are `AI_COLONY` and `AI_JOBS` in `src/engine/data/ai.ts`.

- **Jobs are dealt out afresh every turn**, in this order.
  1. *Food.* Expert farmers, and expert fishermen where there are docks, go to their own trade
     on the best free square, if it yields 3 or more. Then two passes with the best-scoring
     square: first the unskilled while food is short (and converts always), then the
     unskilled always and the skilled while food is short. "Short" = this turn's food need is
     not met and 16 x the shortfall is at least the food in store. A placement is kept only if
     its square yields 3 (when short) or 5; the first that does not ends the food round.
     In this round the squares are scored differently: while the colony is short (and its food
     store is not over capacity) a food square counts 32 times over, fish 8 more beforehand,
     less the worth of its terrain, and other crops by their plain score; while it is not
     short, food and fish weigh nothing. So a fed colony seldom places anyone here, and its
     hands are left for the steps below. A colony of 16 or more with no horses to feed (under
     2, or a full warehouse of them) goes on with the round only while it is short.
  2. *Lumber and hammers*, only while the colony has a project that wants hammers. With nobody
     felling and under 10 lumber, one lumberjack: an expert, else someone unskilled, else
     anyone not yet placed. With 2 or more lumber counting this turn's, one carpenter: a master
     carpenter, else a free colonist, else a servant or criminal.
  3. *Experts of the land* (sugar to silver) go to their own crop on the best free square,
     unless the colony already holds more of it than its warehouse capacity.
  4. *Experts of the workshops* go to their own building where it stands, has room, and the
     input is in store or being made.
  5. *Everyone else* takes the best-scoring bench or the best-scoring square, whichever
     scores higher; the land wins a tie. A convert takes the best square and never a bench.
- **A square's score,** for each free square and each crop it can give: (8 x the yield, no more
  than the warehouse has room for and room counting as at least 1, + 7 - its distance) x
  (the larger of m and 0, + the crop's weight). Distance is 1 beside the colony and 2 at a
  corner. Room for fish is measured against the horses in store.
  - *The crop's weight:* food and fish 4 in a colony of under 16, nothing from 16; any other
    crop its price level. Ore 2 more in a colony of 8 or more from turn 80, and then, for a
    power not ranked below the human, its blacksmith level less 1 and twice its armory level
    more.
  - *m* is the weight + 1; 1 more when the colony uses more of the good than it makes, and
    then the first factor is doubled if the shortfall is more than it has in store; otherwise 1
    less for lumber when the lumber in store and this turn's come to 2; 2 more for sugar,
    tobacco, cotton, furs and ore; on native land less (4 - the tribe's alarm toward the
    power - the units with defence above 1 standing in the colony), if that is above 0.
  - The highest score above 0 wins, the first found on a tie.
- **A bench's score** = (8 x what he would add there, no more than the input to hand, + 5) x
  the bench's weight. The benches are looked at in this order, the first with the highest score
  winning: distiller, tobacconist, weaver, fur trader, carpenter, blacksmith, gunsmith,
  preacher, statesman; each only where its building stands and has room.
  - *The input to hand* is the stock, less what the colony already uses a turn, plus what it
    makes; a bench with less than none is passed over, and none counts as 1. The pulpit and
    the Town Hall, which use nothing, take the figure of the last bench with an input looked
    at before them.
  - *Weights:* distiller, tobacconist, weaver and fur trader the price level of the product
    less that of the input. Blacksmith and gunsmith the price level of tools or muskets + 4,
    doubled from turn 50 for a power not ranked below the human. Carpenter 5 less a third of
    the hammers the colony makes, at least 1, then halved (rounded down) with no project
    wanting hammers. Preacher 9 less half the crosses it makes and a hundredth of the turn,
    at least 1.
  - *The statesman's weight:* 7 + the colony's Tories + 4 for each level of printing press;
    doubled with 10 or more Tories; doubled with Jefferson; nothing before 1540; doubled after
    1600 and again after 1700; nothing after the Declaration; halved under 6 people and again
    under 4; halved for a power ranked above the human and doubled for one ranked below; then
    less the bells the colony already makes, and kept within 1 to 100. Tories are its people x
    (100 - its Sons of Liberty percentage) / 100, rounded to the nearest; none after the
    Declaration.
  - *With no square and no bench scoring,* he takes the pulpit where a church stands with a
    place free and the colony has more lumber in store and coming than it uses; otherwise the
    carpenter's bench, if it has a place.
- **Lumber sent out.** On every eighth turn a colony with a project, nobody felling and under
  2 lumber is given 100 lumber; 200 gold is taken if the treasury has it.
- **What to build** is chosen afresh every turn (hammers carry over): the first of this list
  that applies and can be started. Asking for a building that cannot be started yet means the
  level below it in its chain, and so on down.
  1. Docks, when its land squares are no more than its people, or it has water squares and
     "wants docks" (over half its people farm or fish and more than one does, or food is short).
  2. Stockade. 3. Stable, with 2 or more horses.
  4. A colony under 4 builds nothing more.
  5. Warehouse, with 6 or more people and none.
  6. Custom House, 6 or more people, when a foreign warship is within 5 squares, the human has
     over two more warships than the power, or it has 12 or more people.
  7. Wagon Train, under "Computer powers: wagon trains".
  8. Schoolhouse, with an expert whose trade a school can teach, and people + experts >= 4.
  9. Armory, 6 or more people, when muskets are dear (price level + difficulty / 2 >= 4) or
     the turn is past 80, and it holds 40 tools or makes them; or a master gunsmith is there.
  10. Church, when a firebrand preacher is there. 11. Lumber Mill. 12. Fort.
  13. Blacksmith's Shop, 4 or more people, muskets at price level 4 or more, and 40 ore or
      some being mined.
  14. Warehouse Expansion, while its warehouse level is under people / 6.
  15. Newspaper, when it makes 4 or more bells a turn.
  16. College (an expert of the second teaching level, people + experts >= 10).
  17. A colony under 8 builds nothing more.
  18. University (third level, 16). Church. Fortress, with 10 or more people.
  19. With a factory-level processing chain: a Shipyard in a port, and then a galleon,
      privateer or frigate by the fleet tests; Armory and artillery when no gun stands in it.
  20. Each processing chain a level higher when it makes 3 of its product (to the second
      level) or 8, or holds 100 (to the third).
  21. Cathedral; then, with fewer than 3 guns, Armory, artillery, Arsenal.
- *Rank* is that of "Computer powers: missions". With no human in the game no power counts as
  ranked above or below, and the doubling for tools and muskets is not made.
- The plan is worked out once a turn and carried through by ordinary job changes.
- What a computer colony's turn does besides is under "Computer powers: arming and taking in
  colonists", "Computer powers: upkeep of a colony" and "Computer powers: supplies by ship".

### Computer powers: campaigns (R-807)

Numbers are `AI_CAMPAIGN` and `AI_NATIVE_WAR` in `src/engine/data/ai.ts`.

- **The size test.** A colony is worth a campaign when its population plus the units on its
  square exceed 6 - turn / 50 (rounded down).
- **Attack.** A request at every foreign colony on a landmass where the power has a unit or
  colony, if it passes the size test, except on the turns when (the colony's place in the list
  + the turn) is divisible by 4: priority 3 at firm peace, 5 otherwise. A request at every
  native settlement on such a landmass whose people it is fighting (below):
  priority 4 where a mission stands, 2 where none does.
- **Peoples it fights.** A power treats a native people as an enemy when their alarm toward it
  is 75 or more, or when it has made up its mind to fight them, whatever their alarm (see
  "Computer powers: upkeep of a colony"); once made up, its mind is not changed.
- **Colonies not yet seen.** A human's colony on a square the power has not seen is not marched
  on (and not blockaded) while difficulty level (0..4) x turn is 180 or less; no landing is
  planned beside any colony on an unseen square while level x turn is 200 or less. On the
  easiest level that is the whole game.
- **Defend.** A request at each of its colonies that is short of defenders: priority =
  the shortfall + 2. The troops a colony wants are its garrison (artillery first, then soldiers,
  then dragoons) and answer no other call.
- **Dispatch** is that of the warships (R-806) with the same load K: each free troop, in unit
  order, takes the request on its own landmass with the lowest load x distance / (priority + 1),
  provided (3 x priority) >> 1 >= score / K. A defence request's load rises by 1 for each troop
  sent; an attack request's never does, so everyone in reach goes. Soldiers and dragoons are not
  sent from a landmass where the power has fewer than 2 land units, or exactly 2 and no colony.
- **Invade.** For every colony C of a European power the planner is not at firm peace with
  (never natives): when that power has more colonies than the planner on C's landmass and 8 or
  more people there (colonists in its colonies plus its colonist-type units), and C passes the
  size test, a request at a beach. The beach is the open-sea square within 3 squares of C
  (either way) that touches C's landmass and scores highest by 2 x (|dx| + |dy| + land squares
  of that landmass beside it), the later square on a tie; no request if a unit stands on it.
  Priority 3; +1 if C's owner is the human, and where every European colony on the landmass
  is the human's, +1 more if it has 16 squares and another +1 if it has 64; -1 if 16 x
  (European colonies on the landmass) exceeds its size; +1 at war with the owner; doubled
  before turn 150.
- **Taking a landing.** A ship whose holds are all taken (passengers count as cargo does) and
  that carries a soldier, dragoon or gun takes the invasion request with the lowest
  load x distance / (priority + 1) within range, sails to the beach, and the troops step ashore
  on a neighbouring free square of that landmass. Privateers never do. Once off the beach the
  ship lies there, doing nothing else, until every soldier who can land is ashore.
- **Guns for the garrisons.** A ship carrying troops but nobody of a colonist's kind and no
  missionary (guns, or troops who will not settle), with no landing to make, carries them to
  the port she can reach that is shortest of defenders, the nearest of those; in port they go
  ashore themselves.
- **Quiet regions.** A landmass is quiet for a power when 20 x (its colonies there + the
  colonies of every European power there) exceed the landmass's size and nobody it is not at
  firm peace with, and no people it is fighting, is on it. Troops with nothing to do in a quiet
  region board a transport lying in their port.
- **Fighting.** A troop with a whole move left attacks a neighbouring square only if: it holds
  Europeans the power is at war with (after the Declaration only the human's), or natives of
  a people it is fighting on a landmass where the power has a colony; and the scaled odds are
  12 or more. Soldiers and dragoons do
  not assault a colony unless the summed attack values of the power's land units on the 8
  squares around it exceed those of the land units in it (an undefended colony needs no
  massing; ships are not counted on either side); a unit
  that may not assault waits beside it. Troops never attack from aboard ship.
- **Scaled odds** = 8 x attack / (defence + 1) (rounded down), x the worth of a head there
  ((the summed cost of the units on the square + 1) / their number, rounded down) / the
  attacker's own cost (rounded down), then times 3 against a colony and 2 against a
  settlement, times 3 again for a soldier, dragoon or gun standing on land that is to be
  taken, and never more than 1000. Artillery scores 0 against anything but a colony or a
  settlement. Costs are those of the unit table; units aboard ship are not counted.
- *Land to be taken* is a landmass where the power has no unit or colony, or where somebody
  it is not at firm peace with, or a people it is fighting, stands and the power is the
  stronger there (by summed attack values) or has no colony there.
- *Strengths* in the odds are the engine's (with terrain, fortification and the other
  modifiers), in whole units of strength.
- *Defenders wanted* is the count under "Computer powers: arming and taking in colonists"; a
  colony keeps that many of the troops standing in it as garrison (guns, then soldiers, then
  dragoons) and asks for as many as it is short. Asked for all its colonies, not only ports.
- A beach is not chosen on the map's unsailable outer ring, nor where there is no free square
  to step ashore; the planner's own ship lying on the beach does not cancel the request.
- A troop with no request stays in the colony it is in, or walks to the colony with the fewest
  troops. Troops board only when enough of them are spare to fill the transport and an invasion
  is within its reach, so that the ship sails at once.
- A ship makes no landing until the power has two colonies.
- **Landings to settle.** Where the planner has no colony on a landmass, it also plans a
  landing beside a rival's colony there whose owner has fewer than 8 colonists on that land
  (priority 2, with the same additions as an invasion), and beside any native settlement on
  such land that no other landing is planned for (priority 2). The beach is chosen as for an
  invasion. A full ship carrying a pioneer answers it as a troop ship answers an invasion; a
  ship with troops answers either kind, but one to settle only with somebody aboard who can
  found a colony (guns alone are carried to a colony instead). Off the beach the troops and
  the settlers aboard step ashore, and found a colony by the ordinary search.

### Computer powers: founding and joining

Numbers are `AI_SETTLE`, `AI_MUSTER`, `AI_SITE`, `AI_SCOUT` and `AI_PIONEER` in
`src/engine/data/ai.ts`.

- **A colony wants colonists** while it has under 12 people and its people less 4 are fewer than
  the squares it can work (the eight around it that are land, and the water too once it has
  docks); or under 10 people when its building list has run out. Never from 32.
- **Colonies still wanted** by a power: 0 once the world holds 48 colonies; 8 while it has no
  colony, or none of its colonies wants colonists; otherwise q = (its people - its colonies) /
  (4 - its leader's expansion trait), moved half way to half its fleet's cargo holds, less
  (L - average colony size + 1) for each of its colonies while the average is under
  L = 7 - 3 x the trait; never below 0. So a power founds nothing new while its colonies are
  small: under 10 on average for the English, 7 for the Spanish and Dutch, 4 for the French.
- **A landmass's appeal:** +1 if it has more room (its squares / 12) than native settlements
  and colonies, -1 if less; +2 if no European colony stands on it; +4 if the power has none
  there. 0 for a unit at sea.
- **A unit's willingness** (never above 0): with a colony of the power's on its landmass, the
  distance to the nearest / 5 - 1 (at sea, to any); +2 where it has none there. Pioneer +2,
  soldier -2, dragoon -3, colonist -2, a skilled one -2 more, a convert -20 more. While
  colonies are wanted, +1 for every 16 turns since the power last founded.
- **Who founds:** a colonist, pioneer or soldier (never a veteran; a dragoon only where no rival
  has a colony) for whom willingness + appeal + colonies wanted is above 0. Never a colonist
  standing in a colony that wants colonists, never after the Declaration.
- **Who joins what:** any other colonist joins the colony of the power's on his landmass that
  wants colonists (any, for a convert) and has fewer than 10 people and colonist-type units in
  it: the one with the lowest (distance / 2) x (8 - its people), or (distance / 2) x 2 at 8 or
  more. With no such colony he goes to found one all the same.
- **Which port a ship takes joiners to:** the highest of 4 x ((17 - people, 16 at most)^2 + 2)
  + 2 x (8 - people) + 20 where the human has a colony on that landmass, + 25 if it wants
  colonists and - 25 if not, - (distance / 2 + 1), with a throw of 0 to 8 added.
- **A site's rating,** 0 to 15, from the land alone; nothing on water or mountains. Each of
  the 21 squares of the colony cross (the 5 x 5 block less its corners) has a worth: its
  resource's AI value, or else its terrain's; for ocean without a resource, (2 + 2 x the land
  squares beside it) / 4; 1 more with a river; an ocean square directly beside the centre
  counts half (rounded up). Each adds weight x worth / 2 (rounded down), the weight being 9
  directly beside the centre, 6 at its corners, 4 two away in a line, 3 a knight's move
  away and 4 for the centre itself. The sum is halved with no open sea beside the site and
  halved on hills, then divided by 10; never over 15.
- **A settler's reckoning** of a site is 4 x its rating, and nothing where the rating is 0,
  on mountains, away from the open sea, or where no colony may be founded.
  - *Colonies.* By the nearest colony of all, d squares off: nothing at 1; if it is the
    power's own, nothing at 2 and (9 - d) squared less under 9; if a rival's, 20 less at 2 and
    (7 - d) squared less under 7, or (5 - d) squared under 5 on land where the power has no
    colony.
  - *Natives.* By the nearest native settlement, d squares off, counted 1 further when the
    power has no colony on the settlement's landmass: under 6, less half a measure, and a
    whole measure more at 4 or nearer, 2 more at 3, 4 more at 2, 8 more at 1. A measure is
    2 x (the tribe's level + its alarm level toward the power + 3), halved for a settlement
    on another landmass. The whole is doubled for a capital, halved for the French, quartered
    for the Spanish, and halved with Pocahontas.
  - *A good site,* rated 4 or more, is worth half again on land where the power has no colony,
    and then double. Never below 0.
- **Choosing a site** by its reckoning and its distance, and the first-colony rules, are under
  "Computer powers (R-802)".
- **Scouts.** On land that is quiet (see "campaigns") a scout goes home. Otherwise it rides a
  step at a time to the neighbouring land square it may enter that scores highest (the first,
  from the north clockwise, on a tie): a throw of 1 to 8; + 2 from a river square to a river
  square in a straight line, else + 1 from a road (or a colony) to a road (or a colony), else
  less 3 x the ground's movement cost; looking 4 squares on in that direction, + 8 if that is
  land with no unit or colony of the power's within 2 squares, + 2 for each land square around
  it the power has not seen and - 2 for each square around it with a unit on it. It speaks
  with a chief only where nobody's scout has yet spoken with him (see "missions").
  A scout also likes to keep the way it last went: a step that turns from it by t eighths of a
  circle (4 at most) scores 2 x t x t less.
- **Pioneers in the field.** A pioneer away from the power's colonies who is not to found
  one goes home on quiet land. Otherwise he lays a road where he stands, unless the nearest
  native settlement is within its people's land (1 square, 2 for the third level of
  advancement, 3 for the fourth) and their alarm toward the power is under 75, or the nearest
  colony of all is a rival's less than 3 squares off. Where he lays none he goes home, or
  founds where he stands if the power has no colony.
- A colonist with no colony to join who stands in a colony is made a pioneer, given tools for
  one job (20) at no cost; elsewhere he founds. A pioneer for whom the test above fails waits
  in the colony, and boards a transport lying there when the land is settled and quiet or
  colonies are still wanted; the ship puts him ashore at a site on land where the power has no
  colony and the appeal is above 0.
- A ship that can reach none of the power's ports puts her passengers ashore beside her to walk.
- "Last founded" is the newest of the power's standing colonies.
- Not built: a quota of founders per landmass per turn; terms in a port's score for a blockade
  and for how long since a ship last called.

### Computer powers: arming and taking in colonists

Numbers are `AI_MUSTER` in `src/engine/data/ai.ts`. All of it is done through the actions a
human uses.

- **Threat.** Every foreign land unit within 5 squares counts its attack value x (8 - distance)
  / 8: braves only when their tribe's alarm toward the power is 25 or more and their own
  village's 128 or more; Europeans only with attack above 1, the human's half again; halved
  for a unit standing in a colony. The sum is divided by the colony's fortification level + 1,
  but not below itself up to 16.
- **Defenders wanted** = the larger of (people - 1) / 2 and threat / 8, at most people / 2;
  one more after the Declaration; at least 1 while a unit that counts stands next to it and it
  has more than one person. "People" are its colonists and the colonist-type units on its square.
- **Extra troops wanted** = (3 x people / 2 - bent - turn / 128, +2 where the land is well
  settled and quiet, +1 where it is to be defended) / (bent + 5, +1 while the defenders wanted
  are not all standing in it, -1 where the land is to be taken), "bent" being the leader's
  civilizing (+1) or militaristic (-1) trait. None on land with no natives, no rivals and room
  to grow; no more than 1 where there are natives and rivals both (the Spanish excepted).
  Against it are counted the troops that belong to the colony (those in it, and those within 8
  squares on its land with no nearer colony of the power's) beyond the defenders wanted.
- **Taken in,** by a colony that wants colonists: a plain colonist on its square always; a
  soldier or dragoon when it has more troops than the extra it wants (one more than that when
  the extra is over 1), one such a turn; a skilled man under arms whenever an unskilled man or
  a veteran works inside; a scout when the land is quiet or it has under 52 horses; a pioneer
  when the land is quiet or it has under 20 tools.
- **Sent out,** one colonist a turn at most, from a colony of two or more with 50 muskets:
  when its defenders wanted are not all standing in it, or it has fewer troops than the extra
  it wants, or (a quiet colony of over 10 that wants no colonists) one turn in four. He is a
  dragoon if it has 52 horses. The veteran goes first, then a criminal, a servant, a free
  colonist; a man with another trade only while the defenders wanted are unmet, and he is a
  free colonist from then on; a convert never. A colony with 102 horses that has 10 people or
  is at its cap of 8, and wants no colonists, sends out a scout instead.
- Region states come from "Computer powers: campaigns"; strength there is summed attack values.
- Where a scout then rides is under "Computer powers: founding and joining".
- An unarmed brave's attack value of 1 falls to nothing at any distance.
- Not built: a pioneer sent out one turn in four by a large quiet colony.

### Computer powers: upkeep of a colony

What a computer power's colonies are given or do by themselves at the start of each turn
(`AI_UPKEEP` and `AI_NATIVE_WAR` in `src/engine/data/ai.ts`); none of it is open to a human.

- **Work for tools.** A colony has work for tools when it is to clear forest, or when a
  colonist works a land square that has no road, or no plow where it is flat, open and not
  arctic. It is to clear forest when more than one of its eight squares is forest and either
  7 or more of them count as poor, or its good farm squares are fewer than (people + 3) / 4
  and some forest would be good farmland cleared. Good farmland is open land yielding 3 food
  or more by the terrain table; each water square counts as one good square too. Poor: open
  land yielding under 2 and every forest count 1, water 2, a square off the map 1.
- **Tools.** With under 20 tools, and work for tools or on every tenth turn, the colony
  buys 20 at their price level each, if the treasury can pay.
- **Land.** With 20 tools and work for them, on turns not divisible by 7, the best of its
  squares is improved and the 20 tools used up, once the colony has waited long enough.
  - *The square* is the highest-scoring land square of the eight (the first on a tie), leaving
    out those another European power has claimed and those with both road and plow. Its score
    is its resource's AI value, or else its terrain's; doubled for a forest when the colony is
    to clear forest; otherwise doubled when a colonist works it without the fitting
    improvement (the plow for food, sugar, tobacco and cotton, a road for anything else).
  - *Native ground* scores less by (4 - the tribe's alarm toward the power), that figure
    doubled on a resource; doubled again, on a landmass with native settlements, for a colony
    no wagon train serves, which takes such ground only when it is to clear forest; then
    doubled with under 2,000 gold in the treasury and halved with more.
  - *Never beside a human's.* If a unit or colony of a human's stands next to the square
    chosen, nothing is done that turn, unless a unit of the power's own stands on it.
  - *The job:* clearing, for a forest when the colony is to clear forest; for a square worked
    for a crop and not plowed, clearing if it is forest and the plow if it can be plowed; for
    a square worked for anything else with no road, a road; for a square nobody works, the plow
    on flat open land (plains, grassland, prairie, savannah, marsh, swamp) and a road
    elsewhere. If that is done already nothing is done.
  - *The wait* is the terrain's improvement number + 2, and 2 more for clearing forest when
    the colony is to clear forest. The colony counts the turns since work was last done for it
    (127 at most); land work, a stretch of road and the school all start the count again.
- **Roads between colonies.** On every seventh turn, instead, a colony with 20 tools may lay
  a stretch of road toward a sister colony: another of the power's colonies on its landmass
  less than 7 squares off east-west or north-south, each in turn having one chance in the
  number of the others. The road goes on the first square without one on the straight way
  there (diagonally, then along), short of any water. A square with a foreign unit on it is
  passed over for the next sister. The first sister with a square decides: the road is laid,
  for 20 tools, if the colony has waited that terrain's improvement number + 2, and otherwise
  nothing is done that turn.
- **Carpenters.** A servant or criminal at the carpenter's bench becomes a free colonist; in a
  colony of 6 or more an unskilled carpenter becomes a master one turn in (17 - level).
- **School.** A colony with a schoolhouse that has waited 4 turns (a college 8, a university
  16; the count is the land's) makes one colonist an expert. The pupil is chosen at random,
  never a convert, nor an expert who is working his own trade or standing idle. His new trade
  is found so:
  1. For each of these workshops, in this order, where the colony makes the stuff it works
     and has no master of it: the armory (tools; any level), and at the second level or
     above the blacksmith's (ore), fur trader's (furs), distiller's (sugar), tobacconist's
     (tobacco) and weaver's (cotton). The pupil gets the trade at the same place in this
     list: expert farmer, master sugar planter, master tobacco planter, master cotton planter,
     expert fur trapper, expert lumberjack. The last workshop that applies decides.
  2. In a colony of under 10 with no more expert farmers and fishermen than it has people
     farming or fishing: expert fisherman while it has fewer of them than water squares,
     else expert farmer.
  3. The trade he is working, if there is an expert of it; if not he learns nothing, and the
     count starts again all the same.
- **Training.** A colony short of food (as for docks under "the colony", but counting the
  food in store with what it grows) and not building docks, while the tax rate is 25 or less and
  the treasury holds an expert farmer's training price, makes its last unskilled colonist
  (never a convert) an expert fisherman if it has docks and no such expert, else an expert
  farmer if it has none of those. The fee is the training price of the trade that stands at
  the pupil's place (his place among the colony's people) in the list of trades; where that
  trade has no price, or the list is shorter, no fee is paid and one gold piece comes back.
  A fee the treasury cannot meet is not paid and nobody is trained. Each one trained raises
  the power's tax rate by 1, up to 75.
- **Horses.** From turn 40 a colony with fewer than 2 horses and a ship or wagon in it has
  them made up to 2 for 10 gold.
- **Turning on a native people.** Each colony looks to the people of the native settlement
  nearest it on its landmass, and its power makes up its mind to fight them (see "Computer
  powers: campaigns") when all of these hold: no rival European colony or land unit is on
  that landmass; the power's field strength there is 2 or more; the people's whole strength
  is no more than twice the power's whole strength; their strength on that landmass is under
  4 times its field strength; and their alarm toward the power is above 25. Strength is 8 x
  the defence of the power's land units, or 8 x the attack of the people's braves; field
  strength counts only units on that landmass not standing in a colony; all but the power's
  whole strength stop at 255. The Spanish need neither the absence of rivals nor the alarm,
  and dare twice as much on both counts of strength.

### Computer powers: supplies by ship

Numbers are `AI_SUPPLY` in `src/engine/data/ai.ts`.

- **A colony asks** for one good, the last of these that applies, and only one it holds less
  of than its warehouse takes and does not make: muskets under 50 x (its leader's aggression +
  2); trade goods as under "wagon trains"; horses under 50; tools under 20 with work for
  tools (see "upkeep of a colony"); and muskets again, before all but tools, with under 50
  while it is short of defenders (before tools too while the defenders wanted are not all
  standing in it).
- **A power's want** of a good is the number of its colonies asking for it, muskets counting
  twice; and once more for every colony with no muskets, with no horses, with no tools.
- **In port** a ship of the power's puts everything in her hold ashore.
- **Where cargo goes:** a ship with supplies and nobody to deliver takes them to the port, other
  than the one she lies in, with the highest sum over what she carries of (warehouse capacity
  - stock - 1), less 4 x price level x anything over capacity, + 32 for the good the port asks
  for, all divided by distance / 4 + 1; not a port that makes a good she carries and has 100.
- With no port to take them a ship carries her supplies back to Europe.
- Not built: a bonus for the good asked for that grows with the turns since a ship last called;
  it stands at 4 x 8.

### Computer powers: on the docks

Numbers are `AI_DOCKS` and `AI_SUPPLY` in `src/engine/data/ai.ts`. All of this comes after the
buying of ships. Every third turn is a *cargo turn* for a power with a colony. *Short* is the
fleet test of "the treasury and the fleet".

1. **Selling.** Whatever a ship brought is sold at the bid, untaxed; but muskets go to the
   power's *reserve* in lots of 50 (a part lot counting as one) and horses to it singly.
2. **A recruit.** Before the Declaration, with nobody on the docks, not short, not on a cargo
   turn, while (its colonies wanting colonists - its colonists afoot) is at least half its
   colonies, and it holds the fare and 2 x (30 x its people - the turn) besides: one of the
   three in the pool, by lot. Its fare is 20 x (recruits paid for - level + 7), less the share
   its crosses have earned, with no floor; its crosses are not spent and its fares do not rise.
3. **Fitting out** each colonist waiting, the unskilled first, not on a cargo turn. A soldier:
   on one throw in 2 (3 for a skilled man) while the power wants muskets, or from turn 100 on
   one in 3 (4) while it wants colonies, if not short and it can pay; he takes a horse too if
   it can pay for that. Muskets and horses come free from the reserve while it holds a kit
   (one lot; 50 horses), and are bought at the ask otherwise. A skilled man who is armed
   leaves his trade in the first pool slot that holds an unskilled man and takes that one's
   place in life; with no such slot he becomes a free colonist. A power with a college in
   any of its colonies finds the man it arms a veteran soldier on one chance in (its soldiers
   and dragoons + 1). Else a pioneer: on one throw in 3 while it wants more colonies than it
   has pioneers and none waits already (a skilled man on one in 5 besides; from turn 100 only
   with fewer pioneers than a throw of 0 to 2). Arming one counts one off the muskets wanted,
   and after any fitting-out no more colonies count as wanted that turn. Missionaries as under
   "missions".
4. **Dragoons.** With an armed man waiting, not short, not on a cargo turn, before the
   Declaration: recruits are paid for one after another and armed and mounted, while the docks
   hold fewer than its largest ship carries and the gold lasts. Their fare is by half the
   level, and from turn 100 a tenth less for each level. While an armed man already waits,
   from turn 100 the muskets and horses bought for another cost a tenth less for each level,
   and at any time a horse is found for him at no cost if the treasury cannot pay for it.
   With no gun on the docks and a largest ship of 6 holds, from turn 40, a piece of artillery
   is bought as well.
5. **Goods.** Each ship, while she has a hold free, the power is not short and has a colony,
   buys a lot of 100 of each good in turn, muskets first and food last, that at least as many
   colonies want as there are people on the docks (one more on odd turns), which with empty
   docks on an even turn is every good; on a cargo turn, of each whether wanted or not. Two
   holds are kept free on a turn when somebody was fitted out (not on a cargo turn).
6. **Sailing.** Every ship sails that turn, loaded or not, with whoever waits.

- *The reserve* is filled by ships bringing muskets and horses home, by a colony's overflow
  (see "freight"), and by a lot of 50 from any colony that has all the defenders it wants
  standing in it and 200 muskets (20 lots at most by that road). After turn 80 it is levelled
  each turn, a lot for 50 horses, to within one lot of each other.
- Which fare applies is told by whether an armed man stands on the docks. The gun is bought at
  the engine's price.
- *Guns owed.* Each piece of artillery one of its colonies builds earns a computer power one
  piece in Europe at no cost: while it is owed one, the price of artillery is 0, and a gun so
  had does not raise the price of the next.
- A lot of goods is bought only when the power can pay its price.
- The gun bought while an armed man waits (step 4) costs (10 - level) x 100, whatever the
  price of artillery otherwise.

### Computer powers: freight

Numbers are `AI_FREIGHT` and `AI_RESERVE` in `src/engine/data/ai.ts`.

- **Overflow.** At the end of a colony's turn, whatever it holds beyond its warehouse's
  capacity, food apart, is sold where it lies at the good's price level, untaxed; but muskets
  go to the power's reserve by the 50 (the odd ones are sold) and horses singly. Nothing of a
  computer colony's spoils.
- **Loading.** A ship lying in a colony of her power's, after unloading, fills her free holds
  one at a time (keeping room for those waiting to board) with the good that scores highest:
  price level x stock, the stock counting twice when the warehouse is full of it. Never
  lumber, food or trade goods; tools and muskets only from a colony that makes them, and only
  what it has beyond 100; horses only as stock + 25 - capacity - 2. She takes 100 at most, and
  as little as there is.
- **Who may load.** Not a man-of-war. A frigate only while the fleet's holds, less 3 for each
  frigate and 1 for each privateer, are under 4. A privateer only as under "warships and
  privateers".
- **Fetching.** A port is worth a call when a good she would load stands at 75 or more, or a
  unit waits for passage there: a pioneer, where the colony has no work for tools
  (800), or a troop beyond the garrison on land that is well settled and quiet (1,500). Its
  value is those and price level x what she would load of each good; an empty ship goes to the
  port with the highest value / (distance / 4 + 1), never the one she lies in; a ship that may
  not load goods only to one with troops.
- **To Europe.** A ship with nobody to deliver makes for Europe: with supplies no port of the
  power's can take; while more people wait on its docks than it has ships there or on the way;
  with produce aboard, when she is full or has more than one hold of it; and with nothing to
  fetch, if she is the *Europe ship* (the first merchantman of a power with two merchantmen or
  galleons, else the first of two caravels) or on one turn in 32. Otherwise she stays.
- **Custom House.** After the overflow, a computer colony with a Custom House sells every
  good of which it holds 100 or more down to 50, at the bid and taxed as under "Custom
  House", except food, lumber, horses, tools and muskets; ore too is kept by a colony that
  has an armory or makes tools or muskets. The export flags are not consulted, and a warship
  near by stops nothing.
- A ship's "one turn in 32" goes by her id.
- **Blockade.** A caravel or merchantman lying in a port of her power with a foreign frigate
  or man-of-war within 5 squares counts the turns she has lain so; she neither loads nor
  leaves until that count reaches 10 less her holds (8 turns for a caravel, 6 for a
  merchantman); a standing Go To order waits with her. The count starts again when no such
  ship is near.
- Not built: adding the turns since a ship last called to a port's value.

### Foreign Affairs report (R-803)

- **F8** opens it. It always shows a table of war and peace between the powers still in the New
  World (a power that has withdrawn is left out; one that is independent is marked).
- With **Jan de Witt** in the Congress it also compares the powers: colonies, population, average
  colony size, military power, naval power and merchant marine.
- Once the viewer has declared independence the adviser makes no report.
- Military power is the summed attack of armed land units, naval power the summed attack of
  ships, merchant marine the cargo holds afloat.

### Declaration of Independence (R-900)

- **When.** A power may declare once its national rebel sentiment is 50% or more (Shift-I; the
  game asks first). Nothing else is required, and it cannot be undone.
- **What happens at once, in order.** The War of Succession is settled if it has not been. The
  remaining foreign powers are sized (3 per ship, 2 per colony, 1 per colonist): the smaller is
  the *friend* who may later intervene, the larger the one whose King hires out soldiers, and the
  friend's intervention force is fixed from its strength that day. Every other power then leaves
  the New World: its units vanish and it takes no more turns, though its colonies remain.
  Everything of the rebels' in Europe, on the docks or on the ocean is seized. The power removed
  by the succession lends its seat to the Crown's army (with no such power a seat is added); the
  Crown sees what the rebels have seen and is at war with them for good. The rebels' units are
  done for the turn and the turn ends.
- **Closed to rebels.** Europe (the screen, purchases, sailing there), founding colonies,
  attacking foreign colonies, visiting mayors, European diplomacy, the Foreign Affairs report,
  and new Founding Fathers. The King adds nothing more to his force. Custom Houses go on
  selling, untaxed.
- **Continental Army.** As the rebels' next turn opens, in each of their colonies with Sons of
  Liberty at 50% or more, up to floor(population x (SoL% - 50) / 50) veteran soldiers and
  dragoons standing in it (at least one, at most half the population) become Continental Army
  and Continental Cavalry. No muskets are needed.
- **Bells.** Liberty bells rung after the Declaration count toward foreign intervention, which
  takes 2000 + 1500 x difficulty level. The first time any are rung the rebels are told the
  number and who the friend is.
- **Landings.** The Crown moves as each rebel turn ends. While it has troops to send it lands a
  wave if a Man-of-War is in hand (with none in hand and none at sea, one is fitted out
  instead). Rebel ports are weighed by population x (Tory % + 25) - 75 per armed defender; the
  need to carry one is 1 + (muskets + 50)/100 + half each defender's defence (three quarters for
  veterans), doubled by a fortress or half as much again with a fort, less the King's units
  already beside it. The first port the force in hand can carry is chosen, else the first it
  can nearly carry, else the most attractive. The ship anchors beside it on the sea square with
  most open land around; a wave of 3 to 6 units (cavalry and artillery at most 2 each) goes
  ashore on the squares touching both ship and colony, foot first on fresh ground. Rebel units
  on those squares, and rebel ships under the anchorage, are lost. With fewer than 5 units and
  ships left, or no troops left, the wave is the last and the rest is forfeited.
- **Tory uprisings.** With nothing left to land, each turn has a (level + 1)/(level + 2) chance
  of a rising at the colony where floor(2 x population x Tory %) + level + 1 - (defence of all
  units in it) is largest and above zero: that many Tory soldiers (some veterans, some mounted)
  appear on the free land squares beside it. Once per colony; never where the King's men already
  stand at the gate.
- Simplifications: a Man-of-War that has landed its wave returns to the fleet on the Crown's
  next move; units caught on a landing square are destroyed rather than
  captured; a wave with no regulars left may put cavalry or artillery on fresh ground. How the
  Crown's units then move and fight is R-901.

### War of Independence (R-901)

- **The Crown's troops ashore** move before each new wave lands. A unit beside a rebel colony
  storms it; otherwise it falls on a rebel unit in the open if its odds are even or better;
  otherwise it marches straight for the nearest rebel colony. One armed unit stays fortified in
  each colony the King takes.
- **In battle.** Attacking a colony the King's troops get +50% (Bombard) and then a bonus equal
  to the colony's Tory percentage; rebels retaking a colony get its rebel percentage, and after
  foreign intervention the +50% as well. In the open the King's troops get +5% per difficulty
  level, and rebels attacking them get the terrain as an ambush bonus. A colony that falls
  yields no plunder; its membership drops by a third.
- **Occupation.** In a colony the King holds, the bells it would ring count against liberty:
  membership drifts down by half the free bells each turn.
- **Continental promotion.** After the Declaration a veteran soldier or dragoon who earns
  promotion in a fight joins the Continental Army or Cavalry.
- **Intervention.** When the bells rung since the Declaration reach the stated number, the
  friend declares war on the Crown and the count restarts as a tally. From then on, at the
  start of each rebel turn while the friend has ships left, one arrives beside a rebel port
  chosen by lot weighted by population: a Man-of-War under rebel command, and up to six units
  put straight into the colony (at most two Continental Cavalry and two artillery, the rest
  Continental Army). When the ships are gone nothing more comes.
- **Soldiers for hire.** Each rebel turn with no friendly ship due there is one chance in three
  that the larger neutral power offers 2 to 2 + (4 - level)/2 Continental Army with one
  Continental Cavalry or one artillery, for 100 x (2 x (level + 3) + 0..6) per head (horse and
  guns count two heads), all or nothing and only if the treasury can pay. Accepted, they join
  the largest colony at once.
- **Defeat.** The King wins when the rebels hold no port, hold no colony, or he holds 90% of
  the people living in colonies ((his + 1) / (his + 1 + theirs + 1)). A warning comes each turn
  with fewer than 3 colonies, the King at 80%, or fewer than 3 ports.
- **Victory.** The rebels win when the King holds no colony, his regulars, cavalry and artillery
  ashore number fewer than 1 (fewer than 8 once the rebels have beaten his troops in any fight),
  and what he has left to send (regulars, plus one if any cavalry, plus one if any artillery)
  is under 4. Tory militia and ships do not count.
- **1850.** A war still unsettled then ends in a negotiated peace (the rebels lose).
- Simplifications: hired troops and allied troops arrive in the colony itself with no voyage;
  the King's ships do not hunt rebel shipping (they only carry troops, and sink what lies under
  their anchorage); a crippled King's ship leaves the campaign.

### Score, rating and the Hall of Fame (R-902)

- **Score** is the sum of: 4 per specialist, 2 per free colonist, 1 per indentured servant,
  petty criminal or Indian convert (colonists in the player's colonies, and every colonist-type
  unit outside them; in wartime the colonies the King has taken still count); 5 per Founding
  Father; 1 per 1000 gold; the rebel sentiment percentage (as it stood at the Declaration once
  that is made); minus (difficulty level + 1) per native settlement destroyed.
- **Independence won** adds 2 points for each year the Declaration came before 1780, and, if a
  foreign power intervened, 1 point per 100 bells rung since (at most 100). The whole is then
  multiplied: x2 if no other power was independent first, x1.5 behind one, x1.25 behind two,
  x1.125 behind three.
- **Rating.** The score times 4, 5, 6, 8 or 10 (by difficulty) over 100 is the weighted score;
  the Colonial Rating shown is half of it, as a percentage. An honour is awarded by rank:
  rank r (0 to 23) needs a weighted score above floor((r + 1)^2 / 3). The 24 honours are our
  own list of things named after the player.
- **When.** The game is scored when it ends: in 1800 if independence has not been declared, in
  1850 if the war is still being fought, on losing or winning the war, when the charter is
  withdrawn (no colonies in 1600), or when the player retires (Shift-R). After the 1800 or 1850
  reckoning the player may play on; the game is not scored or stopped by the calendar again.
  F10 shows the score as it stands at any time.
- **Hall of Fame.** Each finished game is entered once (leader, nation, level, date, score,
  rating, honour); the ten best are kept in the browser, best rating first, and shown after the
  score and from the title screen.
- A game ended by retiring early cannot be played on.

### Advisers (R-1000)

F1 to F10 open the reports of the Reports menu. Each is built from the game state when asked;
a row about a place can be clicked (or Enter pressed on it) to close the report and show that
place on the map.

- **F1 Terrain Information**: the terrain table (move cost, defence, yields).
- **F2 Religious Adviser**: crosses against the number needed and the turns that will take, who
  waits on the docks, our missions.
- **F3 Continental Congress** (R-702). **F8 Foreign Affairs** (R-803). **F10 Score** (R-902).
- **F4 Labor Adviser**: colonists by occupation with where they are.
- **F5 Economic Adviser**: treasury, tax, boycotts; per cargo the two Europe prices, net tons
  sold to date, what our stores and holds contain, and the change each turn.
- **F6 Colony Adviser**: each colony's people, membership, construction and warehouse.
- **F7 Naval Adviser**: each ship's place, destination and cargo.
- **F9 Indian Adviser**: each people we have met: peace or war, mood, settlements known,
  missions.
- The Economic Adviser shows net tons sold rather than gold earned per cargo, which the
  game does not keep.

### Options, notices and hints (R-1001)

- **Game options** (Alt+G): Show Indian moves, Show foreign moves (units of others seen to move
  near our units and colonies between our turns are noted in the log, three lines at most and a
  count of the rest); Fast piece slide; End of turn (wait for Enter when every unit has moved;
  off, the turn ends by itself after the last order); Autosave; Combat analysis; Water shimmer;
  Tutorial hints.
- **Colony report options** (Alt+O): labels on buildings; labels on cargo and terrain; and
  eight kinds of colony news that can each be silenced: training, food shortages, raw material
  shortages, tools needed, inefficient government (Tory obstruction), new cargo (a full load
  ready, a warehouse overflowing), Sons of Liberty membership, rebel majorities. A starvation,
  a finished building and a finished unit are always reported.
- Options are kept in the browser and apply to every game.
- **Tutorial hints**: nineteen pieces of advice, each given once per game at the moment it
  applies. They appear in the
  log, set apart from news, and never interrupt play.
- **Event log**: keeps the last 200 lines and scrolls.
- Fast piece slide: off, a unit of ours slides to the next square over a moment; on, it is there
  at once. Water shimmer: the sea's wave pattern shifts every so often.

### Encyclopedia (R-1002)

- Alt+P opens the encyclopedia: an index by category (cargo, units, terrain, skills, buildings,
  Founding Fathers, concepts) and a page for every row of every rule table, plus twelve concepts.
- Each page shows facts taken from the same tables the engine uses, and a short note in our own
  words.
- A right-click opens the page for whatever is under the pointer: a unit or the terrain on the
  map (explored squares only), and a building, a cargo or a colonist on the colony screen.

### Sound (R-1003)

- Every sound is synthesized in the browser from a short list of tones; nothing recorded is
  shipped. Six cues: a footfall when a unit of ours moves, gunfire for a fight we are in, a
  flourish when a colony of ours finishes a building or a unit, a ship's bell when an immigrant
  comes forward, a rising figure as our turn begins, and drums when a native people turns to
  war against us, burns a colony of ours, or joins the Crown.
- Background music, if switched on, is made up phrase by phrase in an old mode over a drone.
- **Sound options** (Alt+S): Background music (off by default), Event music, Sound effects;
  kept in the browser with the other options.

### Difficulty (R-1004)

The level is chosen on the title screen (Discoverer, Explorer, Conquistador, Governor, Viceroy)
and fixed for the game. What it changes, easiest to hardest:

| | Discoverer | Explorer | Conquistador | Governor | Viceroy |
|---|---|---|---|---|---|
| Starting gold | 1000 | 300 | 0 | 0 | 0 |
| Tories that cost a unit of production | 10 | 9 | 8 | 7 | 6 |
| Bells for the first Founding Father (human / computer) | 24 / 56 | 32 / 52 | 40 / 48 | 48 / 44 | 56 / 40 |
| Royal Expeditionary Force at the start | 15/5/2/2 | 23/10/8/5 | 31/15/14/8 | 39/20/20/11 | 47/25/26/14 |
| Royal money per turn | 10 | 18 | 26 | 34 | 42 |
| Native alarm added at the start | 0 | 2 | 4 | 6 | 8 |
| King's troops in the open | +0% | +5% | +10% | +15% | +20% |
| Bells for foreign intervention | 2000 | 3500 | 5000 | 6500 | 8000 |
| Points lost per native settlement destroyed | 1 | 2 | 3 | 4 | 5 |
| Rating factor | 4 | 5 | 6 | 8 | 10 |

Other rules that read the level (combat shields on the two gentlest levels, immigrant quality,
tax events, rumors, prices, demands and so on) are described where those rules are.

### Saving and loading (R-1005)

- **Ten slots**, kept in the browser. Slots 1 to 8 are the player's. Slot 9 holds a copy of the
  game from the opening of the latest decade (a year ending in nought); slot 10 is the game as it
  stands, written as play goes on. Both autosave slots depend on the Autosave option.
- **Alt+L** opens Save or Load Game during play. From the title screen, Load Game resumes the
  game last played when that is the only save there is; otherwise it shows the slots.
- **Files.** A game can be exported as a `.json` file and imported from one.
- **A save that will not load** says why: not a saved game; saved by a newer version; obsolete
  (too old to be read); incomplete; or damaged, with a map that is not the size it claims.
- Loading replaces the game on the table; nothing is merged.
