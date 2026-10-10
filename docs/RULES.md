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
- There may be 48 colonies in the whole game and 38 for one power.
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
  hard line and the human can pay (pay, or refuse). If it is still taking a hard line at the end:
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

Numbers are in `src/engine/data/ai.ts`.

- **Same rules.** A computer power plays through the same actions as a person: nothing it does
  bypasses validation, and its turn is recorded in the session log like anyone's.
- **Expansion.** It wants 4 colonies at the start and one more every 50 turns, up to 8; its
  leader's expansion trait adds or removes one. A site must be flat open land on the coast, three
  squares clear of any colony or native settlement, with enough workable land around it.
- **Landing.** A ship carrying settlers makes for water beside the best site within reach; the
  settlers step ashore and found the colony. Once it has the colonies it wants, newcomers join
  the nearest one instead.
- **Colonies.** Colonists are placed by the automatic assignment of R-309; each colony always has
  something under construction; its surplus of the export goods is sold from the colony itself
  as if it had a Custom House.
- **Europe.** An empty ship sails home, sells what it carries, pays for a passage (and, with a
  large treasury and few ships, another ship), and returns with whoever waits on the docks.
- **War.** Soldiers fortify in its colonies once it has two. A unit attacks only a power it is at
  war with, and only at winning odds of 60% or better by the combat analysis, so it never throws
  a unit away.
- **Independence.** A computer power is granted independence by colonist support under R-702.
- **First colony.** Until it has one, a power counts distance six times over when weighing
  sites, so it settles the nearest fair place; a ship judges every site by how far it must
  really sail to lie beside it. A ship does not wait beside a landing square somebody
  else is standing on, and puts its settlers into a colony if no site can be reached at all.
  From turn 6 a power still without a colony founds one wherever its settlers stand, if the
  ground allows.
- **Liberty.** A colony of three or more keeps one colonist in its Town Hall as a statesman for
  every three it has (three at most), provided it still feeds itself, and builds a Stockade, a
  Printing Press and a Newspaper before anything else.
- **Garrison.** It keeps a soldier for every colony, armed on the docks in Europe from the
  colonists waiting there, and four more while any native people is hostile to it. A soldier
  brought into port goes ashore as a soldier.
- **Reprisal.** A power treats a native people as an enemy from the "angry" attitude up, or when
  one of its settlements turns hostile: a soldier who can be spared (a second guard, or one in
  the field) marches on the nearest such settlement within 12 squares and attacks it when the
  odds are 60% or better. The leader's temperament shifts this a level: a militaristic leader
  (Spain's) takes offence when a people is merely restless, a civilizing one (the Dutch) only
  at open war.
- **Conquest.** A militaristic leader also campaigns unprovoked from turn 208 (1650) until he
  has destroyed four settlements.
- **Braves' calls.** A brave beside a colony at peace pays a call on about one turn in eight
  (the visit itself is that of "Natives at war").
- Not built: trading with native settlements, missions, wagon trains, privateering and
  amphibious assaults by computer powers; leader traits beyond expansion affect diplomacy
  (R-801) but not this policy.

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
