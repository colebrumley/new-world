# Fidelity log

Every rule value marked `[VERIFY]` in REQUIREMENTS.md gets a row when implemented. Append; do not rewrite history.

| Req | Value | Used | Source | Confidence | Notes |
|---|---|---|---|---|---|
| R-206 | turns per year after 1600 | 2 (Spring/Autumn) | GAME.TXT @TIMECHANGE, @SEASONS | high | |
| R-100 | food yield shown in game = NAMES food + 1 | derived | derived | medium | Plains 4→5 matches play memory and FreeCol classic |
| R-100 | lumber yield shown = NAMES lumber × 2 | derived | derived | medium | |
| R-303 | Fort min pop | 3 | NAMES.TXT @BUILDING | high | manual says 4 |
| R-303 | Drydock min pop | 4 | NAMES.TXT @BUILDING | high | manual says 6 |
| R-303 | Shops (Weaver/Tobacconist/Distillery/Blacksmith/Fur Post) min pop | 1 | NAMES.TXT | high | manual/PEDIA say 4 |
| R-200 | Man-O-War moves | 5 | NAMES.TXT @UNIT | high | manual says 6 |
| R-100 | terrain table (move, defense, improve, AI value, 9 yields × 21 types) | as NAMES.TXT | NAMES.TXT @UNFORESTED/@FORESTED/@OTHER | high | Appendix A agrees with the file |
| R-100 | defense column unit | 25% per step | derived; MAN p.135 terrain chart (forest 50, marsh 25, rain 75, hills 100, mountains 150) | high | every row matches the manual chart |
| R-100 | improvement column = pioneer turns | as NAMES column 3 | derived | low | to be checked against the decompilation in R-204 |
| R-100 | open-terrain food vs manual chart | NAMES + 1 (Plains 5) | VICEROY FUN_0000_779c | high | MAN p.135 prints Plains 4; the code adds 1 to nonzero food and doubles lumber for every terrain (confirmed in R-101) |
| R-101 | river bonus | one step per river; major river a second step only if no road/plow/food step | VICEROY FUN_0000_779c | high | backlog had minor +1 / major +2 flat; see RULES.md "Tile yield" |
| R-101 | road bonus | lumber +2, furs +2, ore/silver/fish +1 (step doubles for non-food experts) | VICEROY FUN_0000_779c; GAME.TXT @TUTORIAL9 | high | backlog had furs +1 |
| R-101 | Expert Fisherman | +2 | VICEROY FUN_0000_779c; Revolution Now production.rcl | high | PEDIA @JOB8 says x2; decompilation wins |
| R-101 | Expert Farmer | +2 | PEDIA @JOB0; VICEROY FUN_0000_779c | high | |
| R-101 | Indian Convert outdoor bonus | +1 on food, sugar, tobacco, cotton, furs, fish; none on lumber, ore, silver | VICEROY FUN_0000_779c | high | |
| R-101 | fish by adjacent land | NAMES 3, +1 with <= 5 water neighbours (4), -1 with 6-7 (2), -2 with 8 | VICEROY FUN_0000_779c, FUN_0000_75ee | high | backlog had +1 per 2 land tiles |
| R-101 | resource terrains and bonuses (Appendix A2) | see RULES.md "Resource terrains and effects" | VICEROY FUN_0000_76aa, DS:0x192 | high | Revolution Now differs on expert Prime Timber (+4 vs +8); code followed |
| R-101 | silver without a deposit | 0; 1 with road or expert | VICEROY FUN_0000_779c | medium | manual and Revolution Now say a road does not help; code followed |
| R-101 | Hudson | furs x2 on the final figure | VICEROY FUN_0000_779c; PEDIA | high | |
| R-101 | SoL bonus / Tory penalty on tiles | +1/+2 before multipliers; penalty flat, last | VICEROY FUN_0000_779c | high | when the 50%/100% flags are set is R-306 |
| R-101 | colony centre tile yields | see RULES.md "Colony centre tile" | VICEROY FUN_0000_7e22 | high | Revolution Now has Boreal food 1 vs code 2 |
| R-101 | depletion | counter to 50, tick chance (d+1)/(d+2) per weight | VICEROY FUN_0000_779c, FUN_2000_af0a; Revolution Now doc/depletion.txt | medium | sweep function matched by message tag only |
| — | Revolution Now repository location | github.com/revolution-now/revolution-now | observed | high | the dpacbach/ URL in CLAUDE.md now 404s |
| R-102 | map size | 58x72 grid, 56x70 playable | map file dimensions | high | |
| R-102 | land share by Land Mass | small 17%, normal 25%, large 33% of playable tiles | derived | low | original generator not read; tune in R-1009 |
| R-102 | Land Form | noise cell 7 / 11 / 17 tiles | derived | low | |
| R-102 | forest share | 60% of flat land (arid -10, wet +10 points) | backlog | low | |
| R-102 | Sea Lane width | 3 columns west, 7 east, never within 2 tiles of land | derived | low | |
| R-102 | max land masses | 15 including the two polar caps | MAPEDIT.TXT @CONTINENTS1 | high | the limit; generator keeps 13 non-polar |
| R-102 | resource density | 7% of legal land tiles, 3% of coastal ocean | derived | low | original uses a fixed positional pattern, about 1 tile in 8 before terrain filtering (Revolution Now notes); revisit |
| R-102 | rumor count | land/45 clamped to 10..25, at least 3 tiles apart | backlog | low | |
| R-103 | European start positions, America map | England 34,20 · France 39,10 · Spain 47,61 · Netherlands 50,33 (playable coords) | NAMES.TXT @SCENARIO AMER2, read as four x,y pairs in @COUNTRY order | medium | backlog expected starts on the eastern Sea Lane; the file puts them near shore. Pair-to-nation order is assumed |
| R-103 | tribe settlement sites | TRIBE.TXT lists, 0-based playable coordinates | TRIBE.TXT | medium | 26,34 is listed under both Aztec and Tupi; kept for Aztec. Coordinate origin assumed 0-based (3,1 must clear the polar row) |
| R-103 | coastline and terrain | hand-drawn spans in data/america.ts; detail generated | own work | n/a | not derived from AMER2.MP (C1) |
| R-104 | sight radius | 1; scouts 2; Galleon, Privateer, Frigate 2 (Caravel, Merchantman, Man-O-War 1) | Revolution Now config/rcl/unit-type.rcl `visibility` | medium | backlog had all ships 2; not checked against the decompilation |
| R-104 | De Soto | +1 to every unit's sight | PEDIA.TXT (father text: extended sighting radius for all units); MAN p.94 | medium | manual words it as "two squares, as well as scouts"; whether scouts then reach 3 is unverified |
| R-104 | foreign units visible | within 1 tile of one of your units | MAN options text ("near one of your people") | low | exact range not in the files |
| R-200 | unit table (moves, attack, defense, holds, size, cost, tools, guns, hull, AI roles) | as NAMES.TXT | NAMES.TXT @UNIT | high | Man-O-War moves 5 |
| R-200 | colony build cost | cost x 32 hammers, tools x 10 | derived; matches Revolution Now colony.rcl for artillery and all five ships | high | |
| R-200 | Wagon Train hammers | 40 | Revolution Now colony.rcl (requirements_for_unit) | medium | NAMES cost 1 would give 32; backlog flagged 40 |
| R-200 | Europe prices | Artillery 500 (+100 per purchase), Caravel 1000, Merchantman 2000, Galleon 3000, Privateer 2000, Frigate 5000 | Revolution Now harbor.rcl | medium | same as backlog memory values |
| R-200 | Damaged Artillery | attack 5, defense 3 | backlog Appendix B (manual unit chart) | medium | not a NAMES row |
| R-200 | professions, teach level, Royal University price | as NAMES.TXT | NAMES.TXT @JOB | high | Teacher and Dragoon rows kept but flagged as never a colonist |
| R-200 | skills natives teach | farmer, fisherman, fur trapper, ore miner, silver miner, three planters, scout | MAN p.133 (asterisks), backlog B1 | medium | |
| R-201 | road step | 1/3 move, both squares road or colony | VICEROY FUN_3000_c8f0 | high | |
| R-201 | river step | 1/3 move, both squares river, orthogonal only, all land units | VICEROY FUN_3000_c8f0 | high | manual p.17 says colonists and wagons only |
| R-201 | entering a settlement | cost capped at 1 move | VICEROY FUN_3000_c8f0 | high | |
| R-201 | move with too few points | first step of the turn always; else chance left/cost; moves spent either way | VICEROY FUN_3000_c8f0; Revolution Now src/mv-calc.cpp | high | backlog guessed "always allowed" |
| R-201 | shoreline step | ends the turn unless a colony is at one end; colony to ship costs 1 move | VICEROY FUN_3000_c8f0 | high | |
| R-201 | landfall | wakes passengers, ship stays and spends nothing | VICEROY FUN_3000_d9de | high | |
| R-201 | docking | ship or wagon entering a colony ends its turn | VICEROY FUN_3000_c8f0 | high | Revolution Now deliberately differs for wagons |
| R-201 | inland lake | water not connected to the map edge | VICEROY FUN_0000_39ba (region id != 1) | medium | region meaning inferred |
| R-201 | fortify timing, sentry wake | Fortify ends turn, Fortified next turn; sentry wakes with a foreign unit adjacent | VICEROY 1000:fd05, FUN_3000_ec1c; MAN p.26 | medium | wake-up not located in the code |
| R-202 | hold capacity | 100 of one good per hold; units fill holds by size (treasure 6) | VICEROY 3000:d546; NAMES.TXT @UNIT size | high | |
| R-202 | equipment | Soldier 50 muskets, Dragoon 50 muskets + 50 horses, Scout 50 horses, Pioneer 20-100 tools in lots of 20 | backlog R-202; MAN p.26-27 | medium | amounts not re-read from the code |
| R-202 | pioneer out of tools | below 20 after a job: tools 0, reverts to colonist | VICEROY FUN_3000_e208; GAME.TXT @USEDUPTOOLS | high | |
| R-202 | "load most valuable" | skips horses, tools, muskets; one hold of the lot worth most | backlog R-202 | low | ranking rule is ours; uses opening bids until R-400 |
| R-203 | crossing time | arrives at the start of the 2nd turn after leaving; 3rd on an 11% roll with >= 3 ships and no Magellan | VICEROY 3000:f432, FUN_3000_faea | medium | arithmetic read directly; the turn phase the stages run in was inferred |
| R-203 | west-edge crossing | same as east | VICEROY 3000:f432 (west branch has no effect) | medium | conflicts with backlog (west 4), Revolution Now harbor.rcl (east 2 / west 4), MAN p.60 and PEDIA Magellan; decompilation outranks them |
| R-203 | sail prompt | eastward Sea Lane to Sea Lane step (not under Go To), or stepping off either map side | VICEROY FUN_3000_d69c | high | backlog said "toward the nearer edge" |
| R-203 | return square | departure square, else nearest free Sea Lane square | VICEROY FUN_3000_f8be, FUN_3000_f864 | high | @SAILPORT is the Go To menu title, not a return prompt |
| R-203 | turning back | allowed both ways; takes 2 turns | VICEROY 3000:13a2; MAN p.60 | low | simplification of the stage mechanics |
| R-204 | job turns | road = improvement column; clear/plow = column + 2 | VICEROY 3000:e256, FUN_3000_e5d6; Revolution Now command.rcl | high | backlog had the bare column for all three |
| R-204 | Hardy Pioneer | floor(turns / 2) | same | high | resolves [VERIFY] "twice as fast" |
| R-204 | tools | 20 per finished job, spent on completion | VICEROY FUN_3000_e208 | high | manual implies on ordering |
| R-204 | lumber from clearing | 20, or (forest lumber + 1) x 20 with Lumber Mill; x2 hardy; nearest own colony within 3; warehouse-capped | VICEROY 3000:e369-e44d | high | |
| R-204 | plowing hills and mountains | refused | Revolution Now command.rcl | low | the decompiled work code has no such test; guard not located |
| R-204 | warehouse capacity | 100 + 100 per Warehouse / Expansion | VICEROY FUN_0000_6900 | high | used here for the lumber cap; R-305 owns the rule |
| R-206 | game end | 1800 if not at war; 1850 at war; no colonies in or after 1600 (human) | GAME.TXT @SOONRETIRING0, @SOONRETIRING1, @ABANDON2, @LOSENOCOLONIES; MAN p.11 | medium | checked at the start of the first turn of that year; the manual lets play continue unscored after 1800, which we do not offer yet |
| R-206 | order within a turn | natives, then powers in table order; per power: Europe, colonies, units | MAN p.10; backlog R-206 | medium | natives and colony phases are empty slots until Phases 3 and 5 |
| R-300 | colony caps | 48 in the whole game, 38 per power | VICEROY 2000:0184-019a, FUN_2000_c778 | high | backlog read the README as 48 per power |
| R-300 | forbidden sites | water, Mountains, a colony on any of the 8 neighbours | VICEROY 2000:01bd-022f | high | hills, arctic, desert are allowed |
| R-300 | site warnings | no ocean access (all levels); < 4 land points and no forest (Discoverer, Explorer only) | VICEROY 2000:0267-0398 | high | "free of another owner" test read at medium confidence |
| R-300 | founding and the square | colony mark only; not plowed, no road flag | VICEROY FUN_2000_c778 | medium | Revolution Now and FreeCol treat it as plowed; code followed |
| R-300 | starting buildings | Town Hall, Carpenter's Shop, five Houses | VICEROY FUN_2000_c778, FUN_3000_e81e; MAN p.50 | high | |
| R-300 | population cap | 32 | VICEROY FUN_0000_6f18; GAME.TXT @FULL | high | |
| R-300 | La Salle | free Stockade when a colony has 3+ colonists after a join | VICEROY FUN_0000_6f18; PEDIA | high | existing colonies on election: R-700 |
| R-300 | colony names | COLONY.TXT lists in order; a second round is numbered | COLONY.TXT | high | what the original does past the end of a list was not checked |
| R-301 | indoor output per worker | house 3 / shop 6 / factory 9; expert x2; servant 2/4/6; criminal and convert 1/2/3 | VICEROY FUN_0000_7bfc; Revolution Now production.rcl | high | resolves [VERIFY] convert = 1 |
| R-301 | factory level | half again the output for two thirds the input | VICEROY FUN_0000_6a84 | high | backlog's "6 input -> 9 output" |
| R-301 | carpenter, preacher | expert 6 flat; Lumber Mill / Cathedral double; Church does not multiply | VICEROY FUN_0000_7bfc | high | |
| R-301 | same-turn chaining | stock at turn start plus this turn's make, down the whole chain | VICEROY FUN_0000_7e22, FUN_2000_b258; MAN p.47 | high | |
| R-301 | workers per building | 3 everywhere | GAME.TXT @MORETHANTHREE; VICEROY 2000:37d0-3826 | high | deliberate deviation: the code leaves the distiller's building unlimited |
| R-303 | building table | hammers, tools x 10, min population, upkeep as NAMES.TXT | NAMES.TXT @BUILDING | high | third column ("size") stored, unused; NAMES beats the manual on Fort 3, Drydock 4, shops 1, Fur Factory 6, Printing Press 52/20 |
| R-303 | buy price | 13 per hammer + (tools price + 4) per tool, x2 with no hammers down | VICEROY FUN_2000_9344; Revolution Now colony.rcl | high | resolves [VERIFY]; backlog guessed 10 per hammer. Bid vs ask for tools: medium |
| R-303 | completion | hammers >= cost and tools in stock; hammer store reset to 0, no carry-over | VICEROY 2000:ace4 | high | |
| R-303 | upkeep | not charged | NAMES column unread by the program; @UPKEEP tag absent from the executable | high | resolves [VERIFY] in Appendix E |
| R-303 | first project | Docks in a port colony, else Warehouse | VICEROY FUN_2000_c778 | high | |
| R-303 | Docks vs Drydock siting | Docks: any water square; Drydock/Shipyard: open sea | VICEROY FUN_0000_9500 | high | |
| R-304 | food eaten, growth | 2 per colonist; at 200 food a Free Colonist unit appears and 200 is deducted | VICEROY FUN_2000_b258 (2000:bd2f); MAN p.36 | high | the newcomer stands outside the colony |
| R-304 | starvation | first shortfall empties the store with a notice; with an empty store one random colonist dies per turn | VICEROY 2000:bd77-bf0a | high | Discoverer/Explorer mercy rule and AI allowances included |
| R-304 | horse breeding | min(2 x ceil(horses/50) [25 with Stable], ceil(surplus/2), warehouse room); 1 food per horse | VICEROY FUN_0000_7e22 (0000:81b0-8260) | high | resolves [VERIFY]; PEDIA's "stored food" not followed |
| R-305 | warehouse capacity | 100 / 200 / 300; food exempt, horses and lumber not | VICEROY FUN_0000_6900, FUN_2000_b258 | high | |
| R-305 | spoilage timing and notice | end of colony turn after construction; only pre-existing excess is reported; excess of 1 left alone | VICEROY 2000:c2af-c4be | medium | reading of the two-part excess not confirmed in play |
| R-305 | cargo ready | stock passes a multiple of 100 this turn (after the trim) | VICEROY FUN_2000_b258; GAME.TXT @CARGOREADY* | high | |
| R-306 | bells per statesman | 3 (servant 2, criminal/convert 1), Elder Statesman x2, + 1 per colony | VICEROY FUN_0000_7bfc, FUN_0000_7e22 | high | resolves [VERIFY] |
| R-306 | press, newspaper, Jefferson, Paine | on the colony total, rounded down; Newspaper x2 replaces Press x1.5 | VICEROY FUN_0000_7e22 0000:80d6-81b0 | high | PEDIA and Revolution Now differ on scope and rounding |
| R-306 | membership formula | N/D bookkeeping with 1/64 decay; steady state bells / (2 x population) | VICEROY FUN_0000_6124, FUN_2000_b258 | high | replaces Appendix F's 200-bells guess |
| R-306 | bonus levels | +1 at 50%, +2 at 100% (kept to 95%), one step per turn | VICEROY FUN_2000_b258 | high | |
| R-306 | Tory penalty | floor(((pop x (100 - SoL%) + 50) / 100) / threshold), thresholds 10..6 | VICEROY FUN_0000_779c, FUN_0000_7bfc; MAN p.86 | high | human colonies only |
| R-306 | national rebel sentiment | population-weighted mean of colony membership | Revolution Now doc/rebel-sentiment.txt | medium | not traced in the code |
| R-307 | flat crosses | 1 per colony, +1 Church, +1 more Cathedral | VICEROY FUN_0000_7e22; Revolution Now production.rcl; MAN p.35 | high | resolves [VERIFY] (backlog had Cathedral +2 over the Church) |
| R-307 | Penn | +50% per preacher only | VICEROY FUN_0000_7bfc | high | PEDIA says all cross production |
| R-309 | automatic placement | carpenter rule as the original; square scoring with a reduced weight set | VICEROY FUN_0000_8778 | medium | simplification, see RULES.md "Automatic placement"; expert preference is ours |
| R-310 | teaching term | 4 / 6 / 8 turns by the teacher's own level | VICEROY FUN_2000_b258 2000:b9xx-bcb4 | high | resolves [VERIFY]; Revolution Now keys it by building |
| R-310 | pupils and ladder | random criminal / servant / free colonist; one rung per graduation; max 3 per colony per turn | same | high | |
| R-310 | learning by doing | planters and fur trappers only; 1/100, 1/200, 1/300 per turn | same; Revolution Now colony.rcl | high | resolves [VERIFY] |
| R-310 | first-expert-only condition | promotion only while the power has none of that expert | VICEROY FUN_4000_0326 | medium | census refresh not traced; counted live |
| R-310 | 100% SoL speeds education | not implemented | — | n/a | stated in the backlog, not found in the code |
| R-311 | route cap | 12 | VICEROY 5000:ecb5 (compares the route count with 12 before @TRADEMANY) | high | resolves [VERIFY] |
| R-311 | stops and cargo lists | 4 stops, 6 cargoes to unload and 6 to load per stop | MAN p.28 | high | |
| R-311 | default names | first stop's name + Run / Ferry / Cargo / Transport / Triangle | GAME.TXT @TRADENAMES | medium | how the original picks among the five was not read; Triangle is used for three stops |
| R-311 | loading on a route | all of each listed cargo aboard is unloaded; each listed cargo is loaded as far as the holds allow | MAN p.28; own reading | low | the original's per-stop quantities were not traced |
| R-400 | price scale | table values are bid + 1; ask = price + burden | VICEROY FUN_2000_e166, FUN_2000_e190 | high | |
| R-400 | traffic per trade | (amount << volatility) + 16% of amount per difficulty step from the middle; sales reach the Dutch at 2/3 | VICEROY FUN_2000_fed0, FUN_2000_ff4a | high | resolves [VERIFY k] and the Dutch [VERIFY]; Revolution Now uses multiplicative factors |
| R-400 | price steps | traffic thresholds rise x 100 and fall x 100; one step each way per evaluation | VICEROY FUN_2000_e1a8 | high | |
| R-400 | processed goods | linked group level 3 x group volume / own volume, opening about 8-18 | VICEROY FUN_2000_e1a8, FUN_3000_4174 | high | the table's 11-13 start is unused for these; Appendix C note added |
| R-400 | shared volume | random 600-1000 per good; decays 1/128 on England's evaluations | VICEROY 7000:3245, FUN_2000_e1a8 | medium | Revolution Now: centre 600; "index 0 is England" assumed from table order |
| R-400 | tax on trade | sales only | VICEROY FUN_3000_000c, FUN_3000_005c | high | backlog had purchases taxed too |
| R-400 | back taxes | 500 x ask price of the good | VICEROY FUN_3000_0f4e; Revolution Now | high | |
| R-401 | starting tax, maximum | 0% on every level; 75% | VICEROY FUN_3000_4174, 3000:1f18 | high | resolves both [VERIFY] |
| R-401 | review period | 18 / 15 / 12 / 9 turns by era, -2 per difficulty step | VICEROY 3000:3d38; Revolution Now old-world.rcl | high | |
| R-401 | review outcomes | roll bands 100 / 650 / 950 / 1100 with changes -2..-5, +1, +2, +3..4, +5..8 | VICEROY 3000:3d38 | high | "goodwill" term read at low confidence (taken as 20 per father) |
| R-401 | party | cancels the rise, destroys up to 100, +destroyed to the colony's SoL numerator, boycott | VICEROY 3000:1f18 | high | Revolution Now's SoL bump is random |
| R-401 | tax rises on Custom House / purchases / royal losses | not implemented | @MERCANTILISM, @PURCHASETAX, @KINGMERCY do not occur in the executable | high | the backlog lists them; the original never uses them |
| R-402 | dock equipment | 50 muskets / 50 horses / 100 tools at ask; sold back at bid, untaxed; no immediate price step | VICEROY 3000:1896 | high | |
| R-402 | boycott and dock equipment | a boycotted good cannot be bought or sold as kit | derived | low | not found in the binary |
| R-402 | starting treasury (human) | 1000 / 300 / 0 / 0 / 0 by difficulty | VICEROY 7000:2570 | high | AI starting gold not traced; 0 used |
| R-402 | "move to front" on docks and ships | not a separate order: the selected ship is the one loaded, and anyone can be told to board it at once | MAN p.61, GAME @ARMOPTIONS | n/a | interface simplification |
| R-403 | export threshold and reserve | sell at 100 or more, keep 50 | VICEROY FUN_2000_b258 (2000:b2e0) | high | resolves [VERIFY: 50] |
| R-403 | price and tax | owner's bid, normal sales tax; no immediate price step | VICEROY FUN_2000_b258 | high | |
| R-403 | boycotted goods | still exported | VICEROY FUN_2000_b258; Revolution Now notes the same | high | conflicts with the backlog ("boycotted goods excluded"); binary wins |
| R-403 | wartime trade | full price, no tax, no 50% charge | VICEROY FUN_2000_b258 | high | conflicts with MAN p.87 and Revolution Now; binary wins |
| R-403 | blockade | no sales for a human power with a foreign warship within 5 squares | VICEROY FUN_2000_b258 (colony +0x1B bits 0-1) | medium | flag meaning inferred |
| R-403 | sale order within the turn | after construction, before spoilage | derived | low | |
| R-404 | pool draw | criminal t/15, servant t/10, free colonist t/8 (t = 1,2,2,3,3), else skilled by weights out of 25 | VICEROY 3000:2824 | high | NAMES @CLASS and the era are not used; Revolution Now's weights are an empirical fit |
| R-404 | first pool | servant (criminal on Viceroy) + two draws; fixed on the two easiest levels; Spain opens with a Jesuit | VICEROY FUN_3000_4174 | high | |
| R-404 | recruit price | 20 x (n + level + 7), floor max(100, S/5), linear in crosses, minimum 10 | VICEROY 3000:29d4; Revolution Now immigration.rcl agrees | high | resolves [VERIFY] |
| R-404 | refill uses the pool before the leaver is removed | duplicate and all-skilled tests see the departing member | derived | medium | |
| R-404 | newcomer's unit | pioneer with 100 tools, missionary, scout, soldier (1 in 5+level a dragoon) | VICEROY FUN_2000_e868 | high | applied to University graduates too, minus the dragoon roll (low) |
| R-404 | artillery and ship prices | 500 +100 each; 1000 / 2000 / 3000 / 2000 / 5000, constant | VICEROY 3000:2ca0, 7000:2570 | high | ships do not rise with demand, against MAN p.66 |
| R-405 | crosses needed | min(4000, 8 + 2 x (colonists + units)); England x 2/3; AI x (8 - level)/8 | VICEROY FUN_3000_399a | high | Revolution Now counts dock units twice; binary wins. Replaces the Appendix F guess |
| R-405 | dock drift | +2 with empty docks, -2 per person waiting (after the first immigrant) | VICEROY FUN_3000_399a | high | which units count as "waiting" read at medium confidence (everyone on the docks) |
| R-405 | arrival | when crosses > needed; crosses reset to 0; random slot of 3; refill skilled every 4th turn | VICEROY FUN_3000_3fa2 | high | |
| R-405 | Brewster | free choice of the three, ordinary refill; pool cleared of criminals and servants | VICEROY FUN_3000_3fa2, FUN_3000_9842 | high | unanswered choice and AI choice settled by lot (derived) |
| R-406 | initial Expeditionary Force | 15+8L / 5+5L / 2+6L / 2+3L | VICEROY 7000:329b; Revolution Now revolution.rcl agrees | high | |
| R-406 | REF growth | taxes + (10+8L) per turn, doubling from 1600 / 1700 / 1750; a unit per 1800 by ratio rule | VICEROY FUN_3000_bd62 | high | Revolution Now has no year doubling; which slot is artillery vs ship read at medium confidence |
| R-406 | King's war | (L+2) x turn >= 800; roll 0..20(4-P) <= L; aid 100(L+1) gold + 1 veteran, scaled by lead, capped | VICEROY FUN_3000_3a80 | high | strength measure not identified: summed unit attack used (low) |
| R-406 | King's frigate | every 8th turn, no frigate owned, foreign frigate within 5 of a colony or warships near >3; +10 tax | VICEROY 2000:ce86 | high | |
| R-406 | royal treasure cut | max(2 x tax, 50+5L)%, cap 90; tax rate with Cortes; none after the Declaration | VICEROY 5000:a478 | high | PEDIA says "free" with Cortes; binary wins |
| R-406 | mercenaries | 1 in 21 per turn; 1-4 dragoons or 1-3 with 1-2 artillery; (2(L+4)+0..6) x 100 per weight | VICEROY 3000:c264; Revolution Now sample prices fit | high | per-turn frequency and delivery colony at medium/low confidence; the manual's "5000+" is just affordability |
| R-406 | War of Succession | first time human sentiment >= 50% (or at the Declaration); smallest AI absorbed by next smallest; size 3 x ships + 2 x colonies + colonists | VICEROY FUN_3000_c444, FUN_3000_a238 | high | resolves [VERIFY trigger]; no year condition |
| R-406 | foreign independence | rebels >= 10 x (8 - L); talk within 20 and rising, or after a fall of more than 5 | VICEROY 2000:d32c | high | |
| R-406 | demands for gold | not implemented | no such event in the v3.0 executable (audience routines unreachable) | medium | the backlog lists it |
| R-406 | relations between powers | `Player.stance` (peace / war / none) | derived | n/a | minimal stand-in until diplomacy (R-80x) |
| R-500 | settlement population | 3 + 2 x tech; capital max + tech + 1 | VICEROY 4000:49e0; Revolution Now natives.rcl agrees | high | |
| R-500 | land radius | camps and villages 1, Aztec 2, Inca 3 | VICEROY FUN_0000_5e2a | high | MAN p.71 says 2 for all cities; binary wins, Appendix D corrected |
| R-500 | alarm scale | tribal 0..100 with levels at 25 / 50 / 75; settlement marks 64 and 128 | VICEROY FUN_0000_5e62, FUN_4000_4bfa | high | the five attitude words are display only |
| R-500 | starting alarm | 0..14 + 2 x level (human), capped at 20 on contact | VICEROY 6000:398c, 5000:48a9 | high | Revolution Now uses a flat guess |
| R-500 | skills per tribe | not a table: computed per settlement from terrain | VICEROY 4000:8026 | high | Appendix D column kept as a guide only |
| R-501 | America placement | listed sites, jitter of two -1..1 throws per axis, spacing > 3 easing to 2 and 1, 100 tries | VICEROY 6000:3cc4 | high | |
| R-501 | random placement | 8 capitals (distance 90 easing by 1 per 4 tries, city peoples westward), then cell-by-cell spread, 2160 attempts, cap 84 | VICEROY 6000:3b3e-40b2 | high | grid is the map in 5 x 5 cells; the "never below 8" detail simplified to a floor of 8 |
| R-501 | settlement and tribe records | fields as in the original records; skill, wants and wares computed | VICEROY settlement record (DS:0x54EC), tribe record (DS:0x5AD6) | high | braves as units arrive with R-507 |
| R-501 | same-land-mass test for land ownership | not applied | VICEROY FUN_0000_5e2a | n/a | simplification |
| R-502 | tribal alarm changes | clamp 0..100; French and Pocahontas halve rises; 5-point cooling caps settlements at 32 / 96; mission burning (level + 2)/11 at 100 | VICEROY 4000:39f2 | high | |
| R-502 | goodwill | 8 goodwill = 1 point of tribal alarm | VICEROY FUN_4000_6028 | high | |
| R-502 | cooling | L x L + 1 throws of 1 in (13 - L x L) per settlement per turn | VICEROY FUN_4000_6028 | high | none after the Declaration |
| R-502 | colony pressure | formula in RULES "Alarm"; range 6; building weights 1/2..2 by level | VICEROY 4000:3cf8 | high | "other land mass" halving not applied |
| R-502 | military presence | attack > 1 on 20 squares; halved in a colony and in the outer ring | VICEROY 4000:3cf8 | high | "weapons in colonies" (manual) is not a term in the binary |
| R-502 | mission effect | goodwill 1 / 4, x2 capital, x2 las Casas, /2 Sepulveda; settlement alarm -3 per point | VICEROY FUN_4000_6028 | high | father identities by table order (medium) |
| R-502 | attitude scale | four working levels (25 / 50 / 75) plus hostile settlements (128); marks drawn green, blue, yellow, brown, red | VICEROY FUN_0000_5e62; MAN p.73 for the colours | high | the five attitude words are display only; adviser wording table not traced |
| R-503 | native demand and supply | census of the 5 x 5 block and the formulas in RULES | VICEROY 4000:6b34 | high | terrain ids mapped from the rules-file names |
| R-503 | first contact and treaty | alarm capped at 20; refuse = +100; AI accepts; no land granted | VICEROY 5000:483e | high | triggered by our units coming alongside a settlement until braves exist; unanswered = accepted (derived) |
| R-503 | settlement menu | options by unit type, treaty and alarm; ships refused when unmet, T >= 75 or S >= 64 | VICEROY 4000:8f08 | high | |
| R-503 | chief | kill rules, Arawak 1 in (9 - level), Coronado spares scouts, favours 1/3 each, gift formula | VICEROY 4000:83ca | high | PEDIA credits De Soto; binary tests Coronado. Revolution Now weights are measurements |
| R-503 | tales radius | square of radius 6 | VICEROY FUN_0000_41c4 | low | square vs distance measure not settled |
| R-503 | tribute | strength throws, laugh / refuse / poor / pay, amount 10..min(3v + 10, 100), alarm level + 1 (x2 if paid) | VICEROY 4000:8800 | high | land-mass terms folded into totals; tribe strength from settlement count until R-507 |
| R-503 | cost of a visit | the unit's remaining moves | derived | low | |
| R-504 | founding a mission | always succeeds; alarm 8M - {25,15,10,5}, +/-8 at a capital; expert for a Jesuit or with Brebeuf | VICEROY 4000:663a | high | no "success chance" exists in the binary |
| R-504 | denouncing heresy | weights X and Y as in RULES; throw 1..X+Y <= X wins; stakes (level + 1), x2 capital, x2 vs expert | VICEROY 4000:68a4 | high | two apparent original bugs: X counts every mission's population (kept), expert-challenger doubling unreachable (omitted) |
| R-504 | inciting | price formula and discounts, minimum 500, effect +100 alarm at the target | VICEROY FUN_4000_8b5e | high | the manual's "attitude to the target lowers the price" is not in the code |
| R-504 | peaceful converts | (tech + 2)/16 per friendly visit, doubled for an expert mission | VICEROY 5000:4ede | high | visits arrive with braves (R-506/R-507); Revolution Now's per-turn 5% / 10% is a fit |
| R-504 | forced converts | 4/13 (8/13 expert), +4 Spain, +4 Sepulveda, -4 las Casas | VICEROY 5000:bdef | high | applied when settlement attacks exist (R-506) |
| R-504 | converts outside a colony | removed after 8 turns | VICEROY 2000:cba3 | high | the unit's idle counter reuses `workTurns` |
| R-504 | las Casas | all converts become free colonists | PEDIA; VICEROY FUN_3000_9842 | medium | trigger wired at election (R-701) |
| R-505 | sale price to natives | ((5r + m x D) x q / 100) / 2 with keenness, ill feeling and difficulty as in RULES | VICEROY 4000:7200 | high | |
| R-505 | haggle, gift, arming | success w > 0 and throw 1..8w > level; gift -4(w+1) alarm; muskets/horses thresholds 25 / 50 | VICEROY 4000:7200; Revolution Now native-muskets / native-horses agree | high | |
| R-505 | "not twice in a row" | applies to every good, muskets and horses included | VICEROY 4000:7200 | high | MAN p.76 claims muskets are exempt; binary (apparently a bug) wins |
| R-505 | goods offered for sale | three largest supplies, no trade goods / tools / muskets, food replaced by coats; quarter quantity for ships | VICEROY 4000:7200 | high (quantity rule medium) | |
| R-505 | asking price | 200 or (8 - tech) x 50 per hundred, + European price x (2 level + 15), + throw, - 4U, + 4T; minimum 50 | VICEROY 4000:7200 | high | "European price" taken as bid + 1 |
| R-505 | hostile village | throw 0..500 against alarm and twice alarm | VICEROY FUN_4000_7f7c | high | |
| R-505 | trade memory decay | tech + 1 per turn | VICEROY 4000:6b34 | high | |
| R-506 | land combat strengths and modifiers | as in RULES "Land combat" | VICEROY FUN_0000_582a, FUN_0000_593e, FUN_5000_a67e | high | built ahead of R-600; fortified adds to the place bonus and is capped, unlike the manual's separate bonus |
| R-506 | resolution | one throw, attacker wins with attack / (attack + defence) | VICEROY FUN_0000_9f22 call in FUN_5000_a67e | high | |
| R-506 | promotion | L / (W + L +/- level), -10 criminal, -5 servant; Washington certain | VICEROY FUN_5000_a29c | high (operand order medium) | Revolution Now uses a flat 45% |
| R-506 | alarm for attacking natives | level + 5, x2 settlement, x6 capital; +256 settlement alarm | VICEROY 3000:cb90 | high | Revolution Now uses a flat 10 |
| R-506 | settlement defenders | virtual braves, armed with tribe muskets, mounted at breeding >= 25 | VICEROY 5000:a908 | high | a real brave standing on the settlement is not separately fought (simplification) |
| R-506 | treasure | odds and amounts in RULES "Natives at war" | VICEROY 5000:bf45-c156; Revolution Now treasure tables agree for cities | high | Revolution Now applies Cortes x1.5 everywhere and 25% for camps; binary wins |
| R-506 | capital destroyed | alarm to 15 at most, settlements calmed | VICEROY 5000:b266 | high | |
| R-506 | raid procedure | throw, four outcomes, fortification and difficulty downgrades | VICEROY 5000:9a84 | high | no colonist is ever killed (the "scalps" text is unused); ship damage deferred to R-602 |
| R-506 | colony burned | population 1, no armed defender, defender loses | VICEROY FUN_5000_a67e | high | |
| R-506 | brave's call at a colony | friendliness test, begging, gifts, demands as in RULES | VICEROY 5000:483e | high | gold reparations do not exist in the original program; wagon-train demands not built |
| R-506 | brave arms retention | half the time | VICEROY FUN_5000_8ec2; Revolution Now arms.retention_after_death | high | |
| R-506 | unanswered demand | handed over at end of turn | derived | n/a | the original forces an answer on the spot |
| R-507 | brave movement | wander near home, hunt when hostile, call on colonies; ranges 4 / 3, war range 9 | derived (outline of VICEROY FUN_4000_4bfa only) | low | the original scores nine squares with many inputs that were not traced |
| R-507 | horse breeding | + herds per turn, cap 2 x (people + 25) | VICEROY FUN_4000_61f6 | medium | |
| R-507 | rearming at home | muskets if the tribe has any (spent 1 in level + 1), horses at breeding 50 | VICEROY FUN_4000_5f0e; Revolution Now native-muskets / native-horses | medium | Revolution Now's small "skip" chances by tech are not applied |
| R-507 | tribes siding with the Crown | grudge, or alarm >= 25 and throw 1..400 <= alarm; then 1 in 2(5 - level) + 1 | VICEROY FUN_4000_61f6 | high | arms reset on joining not built (arithmetic unclear) |
| R-507 | peace after war | automatic when alarm < 75 | VICEROY (no caller of the explicit peace routine found) | medium | the backlog's "chief dialog" does not exist as a separate step |
| R-508 | skill taught | drawn from the settlement's supplies with a position-seeded throw; scout on (x + y) mod 3 = 0; fisherman by water | VICEROY 4000:8026 | high | our generator differs from the original's, so the same map gives different skills; Appendix D's per-tribe lists are only typical |
| R-508 | who may learn | free colonists and servants; criminals and converts refused; experts "already masters" | VICEROY 4000:8026 | high | servants can learn (the manual only bars criminals) |
| R-508 | once per settlement | yes, except capitals | VICEROY 4000:8026 | high | resolves [VERIFY: capitals teach repeatedly] |
| R-508 | alarm limits | refuse at 50 (+3 alarm); fail (200 x level + 99)/1000 from 25 | VICEROY 4000:8026 | high | |
| R-509 | rumor outcomes | nine equal rolls with terrain, count and skill conditions | VICEROY 5000:f054 | high | Revolution Now's weights are fits of this procedure |
| R-509 | amounts | ruins 30-240 (x(e+2)/2 scouts); gift 8-80; Cibola (1..20 + 10(e+2)) x 100; mounds 2 x (1..8 + 2(e+5)) x 100 | VICEROY 5000:f054 | high | Revolution Now allows Cibola up to 13500; binary max 6000 (7000 with De Soto) |
| R-509 | Fountain of Youth | 8 immigrants, picked from the pool, free, crosses untouched | VICEROY 5000:f054, 3000:29d4 | high | resolves [VERIFY: 8 picks] |
| R-509 | De Soto | scouts only: +1 skill, any terrain, re-throws of poor results | VICEROY 5000:f054 | high | PEDIA's "always positive" holds for scouts only |
| R-509 | sacred burial grounds | throw 1..(d + 5) x 2^e <= 3; +100 alarm | VICEROY 5000:f054 | high | Revolution Now uses fixed odds |
| R-509 | shrine condition | nearest settlement within 2 squares | VICEROY 5000:f054 | low | the original tests the settlement's index against 2, which looks like a slip for its distance |
| R-510 | land price | points and multipliers as in RULES "Native land"; worked example 65 | VICEROY FUN_4000_40c2 | high | Revolution Now counts colonies and uses x0.9 per ring; its other terms match |
| R-510 | when asked | worker on a native tile; clearing forest; building a road; never plowing or founding | VICEROY 2000:6746, 1000:fd84, 1000:ff8a | high | |
| R-510 | alarm for taking / unpaid work | k x (level + 5), road k x (level + 3); k = 3 / 2 / 1; x2 prime for colony tiles | VICEROY 0000:6644, 3000:e4f4 | high | Revolution Now's figures are exactly half (probably measured under a halving) |
| R-510 | "bought" marker | the tile's claim is set to the power | derived | n/a | the original keeps a separate bought bit |
| R-600 | capture | colonists, wagon trains and treasure taken by a European victor with an attack value; veteran prisoners become free colonists | VICEROY FUN_5000_8ec2 | high | scouts and pioneers are destroyed, not captured (the backlog said captured) |
| R-600 | fighting ends the move? | an attack uses one full move; a mounted unit keeps the rest | VICEROY FUN_5000_a67e | high | the backlog said a unit that fights cannot move further |
| R-600 | post-Declaration modifiers | Bombard +50%, Tory / Rebel Unrest by the colony's percentages, Crown +5% per level in the open | VICEROY FUN_5000_a67e | high | "Expeditionary Force", "Plowed" and "Founding Fathers" labels are never used by the combat code |
| R-600 | Continental promotion | veteran soldier / dragoon of the human rebel power, same chance as other promotions | VICEROY FUN_5000_a29c, FUN_5000_a25a | high | the nation flag that gates it was not identified; taken as "war declared" |
| R-600 | artillery vs raids | +100% in any colony | VICEROY FUN_5000_a67e | high | the backlog and manual card say +75% in a fortified colony |
| R-600 | promotion chance | L / (W + L +/- level) | VICEROY FUN_5000_a29c | high | resolves [VERIFY 1/3] |
| R-601 | drafted defender | random colonist at combat 1; 2 with Revere and 50 muskets | VICEROY FUN_5000_a67e | high | whether the muskets are consumed was not found; we consume them (PEDIA wording) |
| R-601 | capture and plunder | owner changes; gold = treasury x colony colonists / all colonists, before the Declaration only; SoL x 2/3 | VICEROY FUN_5000_a67e | high | buildings and colonists stay (no removal code found) |
| R-601 | units and ships in a captured colony | land units taken; ships damaged and sent away | derived; Revolution Now moves ships out damaged | low | not traced in the binary |
| R-601 | siege test | foreign fighting land units on and around the colony outnumber the owner's; scouts and ships excluded | Revolution Now src/siege.cpp | medium | the original's test (thunk 1000:9a3c) was not read |
| R-601 | infiltration | 2 x (6 + fort levels) / 36, halved for a seasoned scout, + (level - 2) for a human; 100 horses to the colony | VICEROY 5000:7e0e | high | |
| R-601 | repair times | Europe / drydock: 2/1, 6/3, 10/5, 8/4, 12/6, 16/8 | VICEROY repair counter (+1 per turn, +2 in a colony) | high | Revolution Now's table differs slightly; the "fewer turns when beaten by a weaker ship" rule is not built |
| R-602 | who may attack at sea | privateer, frigate, man-of-war | VICEROY movement classifier (GAME @SHIPCOMBAT) | high | |
| R-602 | ship strength | table value, Drake +50% for privateers, -1/8 per hold in use, attacker +50% | VICEROY FUN_0000_582a | high | |
| R-602 | evasion | weights movement + 3, x2 privateer, +3 galleon, -4 per hold; defender flees on throw <= its weight | VICEROY FUN_5000_773e | high | Revolution Now lacks the galleon and cargo terms |
| R-602 | sunk or crippled | guns / (guns + hull), then fleet-size overrides | VICEROY FUN_5000_8ec2 | high (overrides: meaning of the census counters low) | resolves [VERIFY]: by chance, not by lack of repair |
| R-602 | cargo capture | a hold at a time while the victor has room | VICEROY 5000:8cdc | high | we pick by value automatically instead of asking |
| R-602 | zone of patrol | 4 / 6 / 8 thirds, slip past on throw < a, half on throw = a | VICEROY 5000:7790 | high | |
| R-602 | fort fire and slowing | attack 4 x level x (1 + artillery); 2 thirds (fort) or all movement (fortress) | VICEROY FUN_2000_afc6, 5000:7aa0 | high | "peace" read from a relation bit at medium confidence |
| R-602 | privateers and war | a privateer's attack starts no war | MAN PDF p.87; VICEROY treats privateers as hostile to all | medium | the diplomatic side of the resolver was not traced |
| R-602 | repair after a weaker victor | counter starts at own combat - victor's (x2 for a fort) | VICEROY 2000:cc84 | high | resolves [VERIFY] on repair turns |
| R-603 | Combat Analysis | two columns, a line per visible modifier with its percentage, in the original's order and names; hidden adjustments have no line | VICEROY 5000:c5a0-d6c2; LABELS.TXT names | high | the chance shown leaves out the hidden help the easy levels give, as the original's screen does |
| R-700 | fathers table | 25 rows: category and three era weights | NAMES.TXT @FATHERS | high | era boundaries 1600 and 1700 (VICEROY 3000:9500) |
| R-701 | father cost | (n + 1) x base + 1, first halved; human base 16 x (level + 3), AI 8 x (14 - level); x 1.5 at 1600 / 1650 / 1700 / 1750 | VICEROY FUN_3000_9e82 | high | Revolution Now has no year scaling; replaces the Appendix F guess |
| R-701 | surplus bells | discarded on joining | VICEROY FUN_3000_9f22 | high | |
| R-701 | candidates | one per field by era weight, re-drawn each time; human picks, AI takes the fullest field | VICEROY 3000:9bd2, FUN_3000_965a | high | the NAMES "higher level" remark is not implemented in the program (so not here) |
| R-701 | one-off effects | Fugger, La Salle, Jones, Pocahontas, Brebeuf, las Casas, Coronado (radius 5), Brewster | VICEROY FUN_3000_9842 | high | Jones's frigate arrives by sea from Europe |
| R-701 | de Witt | permits trade in foreign colonies | VICEROY FUN_5000_800e | high | the trade itself is built with diplomacy (R-801) |
| R-701 | unanswered choice | first name offered | derived | n/a | the original waits at the menu |
| R-800 | landing party | soldiers + pioneers (100 tools) in one ship; Dutch merchantman; French hardy pioneer; veteran soldier for Spain and for a human on the two easiest levels | VICEROY 7000:3440-350c | high | resolves [VERIFY: Spain's soldier is a Veteran]; Revolution Now has "Spain or Discoverer" |
| R-800 | nation names, ports, leaders, traits | as the rules file | NAMES.TXT @COUNTRY .. @LEADERNAME | high | colours are our own; the original palette indexes are kept for reference |
| R-801 | relation states | none / war / treaty, plus grudge, piracy, intent, truce, last talk | VICEROY relation byte (NATION + 0x34) | high | resolves [VERIFY alliance effects]: there is no alliance state, only paying a power to fight a third |
| R-801 | audience flow | piracy, sieges, tribute, verdict, peace offer, treaty menu | VICEROY 5000:5b4e | high (flow), medium (weights) | region-by-region strength replaced by whole-map totals; WANTSTUFF, HEATHEN and APOSTATES steps omitted |
| R-801 | prices | tribute in 50s up to 20,000; withdrawal 25 x (level + 2) per point, min 100; alliance 500-10,000 | VICEROY 5000:5b4e | high | |
| R-801 | truce | 2 x (6 - level) turns, halved with Franklin | VICEROY 5000:76ee | high | decrement per turn assumed |
| R-801 | privateers and grudges | piracy flag; (level + 1)/101 grudge or intent | VICEROY 3000:cc74 | high | |
| R-801 | AI with AI | talk every third turn; war test as in RULES | VICEROY FUN_5000_59c0, FUN_5000_56fc | high | the per-region condition is dropped |
| R-801 | foreign-colony trade | treaty + de Witt; cash at 3/4 of the buyer's home price | VICEROY FUN_5000_800e for the conditions | low for the price | the original's barter terms were not traced |
| R-801 | demarcation treaty / spheres of influence | not built | not found in the binary | n/a | the backlog lists it; no such mechanism was seen |

| R-802 | AI policy numbers (`AI_PLAN`) | 4 colonies +1 per 50 turns to 8, spacing 3, attack at 60% odds, etc. | own design | n/a | the original's AI was not traced |
| R-802 | AI colonies sell surplus without a Custom House | lots sold from the colony at the bid, down to 50 | VICEROY FUN_2000_b258 2000:c32a | medium | which goods and thresholds the original uses were not traced; ours is the cash-crop and manufactured list |
| R-802 | AI and AI first contact | talk at once on meeting (then every third turn) | own design | n/a | keeps two computer powers from fighting before any audience |
| R-803 | Foreign Affairs contents | relations only; with de Witt colonies, population, average size, military, naval, merchant marine | MANUAL p.79; PEDIA de Witt | high | |
| R-803 | report unavailable in the revolution | no report once independence is declared | GAME `@FOREIGNNOTAVAIL` | high | |
| R-803 | military / naval / merchant measures | summed attack of armed land units / of ships; holds afloat | own design | low | the original's figures were not traced |
| R-900 | sentiment to declare | 50%, no other test | VICEROY FUN_3000_c584; GAME `@TOOTORY` | high | |
| R-900 | effects of the Declaration | succession, friend/patron by size, withdrawal, seizure in Europe, permanent war, turn ends | VICEROY 3000:ba46 | high | |
| R-900 | Custom House in wartime | full price, untaxed | VICEROY FUN_2000_b258 (see R-403) | high | backlog and MAN p.87 say 50%; binary wins |
| R-900 | Continental muster | floor(pop x (SoL - 50) / 50), min 1, max pop/2; veterans only; no musket test | VICEROY FUN_3000_beea | high | resolves [VERIFY: 50 muskets]: `@CANTMOBILIZE` is never used by the program |
| R-900 | intervention bells | 2000 + 1500 x level | VICEROY FUN_3000_9e82; Revolution Now agrees | high | |
| R-900 | intervention force | formula in `INDEPENDENCE.force` | VICEROY 3000:bb2c | high (formula), medium (strength measures) | |
| R-900 | landings: target, need, wave size and mix | as in RULES | VICEROY FUN_3000_a9a2, FUN_3000_a62a | high; "defender count" medium | |
| R-900 | Man-of-War turnaround | back in the fleet on the next Crown move | own design | low | original sails it home (4000:fc13) |
| R-900 | units on a landing square | destroyed | simplified | medium | original captures or destroys |
| R-900 | Tory uprising | chance (d+1)/(d+2); n = floor(2 x pop x Tory%) + d + 1 - defence; once per colony | VICEROY FUN_3000_a6c6 | high | |
| R-901 | Bombard / Tory unrest / rebel unrest / REF in the open | +50%; x(1 + Tory%); x(1 + SoL%); +5% per level | VICEROY combat routine (see R-600 rows); MAN p.88 | high | |
| R-901 | Bombard for rebels after intervention | +50% attacking a colony | VICEROY combat step 7; MAN lines 3769-3772 | high | |
| R-901 | occupied colony's bells | minus half the bells it rings | VICEROY colony update (REF slot) | high; ours uses the free bells only | statesmen in a held colony are not counted |
| R-901 | intervention arrival | one ship a turn; 6 units, at most 2 cavalry and 2 artillery; port by lot weighted by population | VICEROY 3000:b110; Revolution Now agrees | high | |
| R-901 | wartime mercenaries | 1 in 3; n = 2..2+h; one cavalry or artillery; price 100 x (2(d+3) + 0..6) x (n + 2) | VICEROY 3000:c0e8 | high | arrive in the largest colony (original: by ship at a weighted port) |
| R-901 | defeat | no ports; no colonies; King's share >= 90%; warnings at < 3 ports, 80%, < 3 colonies | VICEROY 2000:d168 | high | |
| R-901 | victory | no REF colony; REF land units ashore < 1 (8 after a first win); reserve measure < 4 | VICEROY 2000:d064 | high | |
| R-901 | Crown unit orders | storm adjacent colony; attack in the open at even odds; else march on the nearest colony; one garrison per taken colony | own design | n/a | original not traced |
| R-902 | population points | 4 specialist / 2 free colonist / 1 servant, criminal, convert; units outside colonies too | VICEROY 3000:7ae2 (0x37d1a); MAN p.11 | high | the binary's stale-profession quirk for some units is not reproduced |
| R-902 | fathers, gold, sentiment, natives | 5 each; 1 per 1000; sentiment %; -(level + 1) per settlement | VICEROY 3000:7ae2; MAN p.11 | high | |
| R-902 | early Declaration | 2 x (1780 - year), only if the war is won | VICEROY 0x381f5 | high | resolves [VERIFY curve] |
| R-902 | bells after intervention | 1 per 100 bells, cap 100 | VICEROY 0x38304 | high | manual says one per bell; binary wins |
| R-902 | independence multiplier | (8 + (8 >> powers ahead)) / 8 | VICEROY 0x38496 | high | x2, x1.5, x1.25, x1.125 |
| R-902 | rating and rank | W = factor x score / 100, factor 4/5/6/8/10; rating W/2 %; rank r needs W > floor((r+1)^2/3) | VICEROY FUN_3000_85c0 | high | resolves [VERIFY difficulty factor] |
| R-902 | honours list | 24 entries of our own | own design | n/a | the original's list is not copied |
| R-902 | Hall of Fame order | rating, then score; ten kept | MAN p.12 for "score modified by difficulty"; size is ours | medium | the original's insert routine was not read |
| R-1009 | how often a brave calls at a colony | 12% of the turns it stands beside one | own design | n/a | the visit rule is the binary's (VICEROY 5000:483e); the original's brave movement was not traced. Calling every turn gave about 27 gifts a turn |
| R-1009 | computer powers: statesmen, build order, garrison, reprisal, first-colony haste | `AI_PLAN` | own design | n/a | added after the balance run to bring it toward Appendix L |
| R-804 | computer powers' wagon trains: build conditions, loading score, target, sale and purchase | `AI_WAGONS`; RULES.md "Computer powers: wagon trains" | VICEROY 4000:e3d3, 4000:d0fc, 5000:37a5, 5000:23e6, 4000:901c, 4000:7b18 | high for the round and the target, medium for loading, the build choice and the purchase | read with a linear disassembler; the listing has holes at these jump tables |
| R-804 | "price level in Europe" | the market's stored level (bid + 1) | derived: NAMES.TXT @CARGO start values are what our market stores | medium | the original's byte DS:0x84bc was not matched against the displayed bid |
| R-804 | a foreign unit that counts as a threat | armed unit of a power without a treaty, or of a tribe at alarm 50+, next to the colony | own design | n/a | the original weighs every foreign unit within 5 squares; the weights were not traced |
| R-804 | how a colony comes by trade goods and by the hammers for its wagon | 100 at Europe's ask, keeping 200 gold back; one colonist fells timber, then builds | own design | n/a | not traced |
| R-804 | a cargo the village will not look at | not loaded; taken home if carried | own design | n/a | not traced; without it wagons shuttle food the natives never buy |
| R-805 | computer powers' missionaries: when made, target score, entry choice, rank | `AI_MISSIONS`; RULES.md "Computer powers: missions" | VICEROY 4000:e665, 4000:901c, 5000:0498, FUN_5000_4708, 4000:c610, 4000:c674 | high for the journey, the entry table and rank; medium for the docks | |
| R-805 | a settlement where the tribe's alarm toward the power is 0 | still a candidate (score 0, first listed wins) | own reading | low | the starting value of the original's best score was not read; needed for missions among calm peoples |
| R-805 | a missionary with nowhere to go | walks to its nearest colony on the landmass and becomes a colonist there | own design | n/a | the original changes the unit type on the spot; our engine changes roles only in a colony |
| R-806 | station "load" | land units / 8 clamped to 3..99, +1 for each ship already sent to the station that turn | VICEROY 4000:bb96 (dispatcher) | high | resolves the backlog [VERIFY]; the acceptance test (3 x priority) >> 1 >= score / K gives the 11/19/34/47 ranges |
| R-806 | naval stations and priorities, firm peace, the blockade square, the privateer exception | `AI_NAVY`; RULES.md "Computer powers: warships and privateers" | VICEROY 4000:abaa, 4000:ad96, 4000:b316, 4000:ecb1, 4000:f630, 4000:c3a0 | high | |
| R-806 | which foreign ships a power "can see" | within a unit's sight range, or 2 squares of a colony | own design | n/a | the original's per-unit seen flag is not modelled |
| R-806 | how a computer power comes by a privateer | buys one with 4 colonies, none already, and the price + 1000 gold | own design | n/a | not traced |
| R-807 | computer powers' campaigns: attack, defend and invade requests, the size test, the beach, dispatch, scaled odds of 12, the assault test | `AI_CAMPAIGN`; RULES.md "Computer powers: campaigns" | VICEROY 4000:ac48, 4000:b7a9, 4000:b54c, 4000:afa6, 4000:b910, 4000:bb96, 4000:ecb1, 4000:f630 | high for the planner and the step chooser, medium for embarking and landing | replaces the R-802 war, reprisal and conquest rules |
| R-807 | passengers count toward a ship being full | yes | backlog (confirmed by the owner 2026-10-09); VICEROY 4000:a923 reads unit +0xC as holds occupied | medium | not re-read in the code |
| R-807 | strengths used in the scaled odds | the engine's attack and defence with all modifiers, in whole strength units | derived | medium | the resolver query itself was not read; the cost weighting of the original (step 2) is left out |
| R-807 | defenders a colony wants | 1, or 2 while at war with a power or the Crown | own design | n/a | the original's per-colony count (+0x8e) has an untraced writer |
| R-804 | a computer power's cargo at a village | never refused; priced by the usual formula | VICEROY 4000:7349 (refusal and haggling dialogs skipped for a computer power) | medium | supersedes the R-804 row above on unwanted cargoes; chosen by the owner 2026-10-09 over the load filter |
| R-804 | how a computer colony comes by hammers | one colonist on lumber and one on hammers while a project wants them, food permitting | FreeCol server/ai/ColonyPlan.java (building materials staffed ahead of cash crops) | medium | supersedes the wagon-only builder; the original was not traced; Revolution Now has no computer colonial powers |
| R-806 | how a computer power comes by a warship | free in Europe when it has no ship; else by chance strength / average x {0, 5, 10, 15, 20}% while under half the others' average; privateer or frigate by 100000 / price | FreeCol server/ai/EuropeanAIPlayer.java `cheat`; classic specification.xml `model.option.offensiveNavalUnitCheat` | medium | supersedes buy-at-four-colonies; FreeCol applies it in single-player games only, we always |
| R-807 | defenders a colony wants | badly defended with no troops; never with more than 5; else when defence strength < 0.95 x population - 2.5 | FreeCol common/model/Colony.java `isBadlyDefended` | medium | supersedes "1, or 2 at war"; strengths are our engine's, not FreeCol's |
| R-806 | how a computer power comes by its ships and guns, and its subsidy | the round of buying and the per-turn subsidy of RULES.md "Computer powers: the treasury and the fleet" (`AI_FLEET`) | VICEROY 4000:faf4-5000:0019, 4000:fa2c, 4000:01c0, 5000:0c1a | high | supersedes the FreeCol naval-aid row above and the R-802 "merchantman at 4000 gold" rule; the purchase percentages in the code are dead arguments |
| R-806 | which census byte is "colonists" in the buying tests | the people in the power's colonies | VICEROY DS:0x9410 (earlier notes disagree whether 0x9410 or 0x940c includes units afoot) | medium | |
| R-802 | how a computer power runs a colony: the order jobs are dealt out, the lumber sent out, the building list | RULES.md "Computer powers: the colony" (`AI_COLONY`) | VICEROY 5000:177e-5000:3e8c, 5000:1634, 5000:16a0 | high for the order and the building list, medium for the placement helper's inner scoring | supersedes the FreeCol builder row above and the R-1009 "statesmen, build order" row |
| R-802 | what the original's colony turn does besides jobs and building | now built: see the rows below on arming, upkeep and supplies | VICEROY 5000:2059-5000:2a07, 5000:3b6b-5000:3e8c | high that they exist | |
| R-807 | defenders a colony wants | max((people - 1) / 2, threat / 8), at most people / 2; +1 after the Declaration (`AI_MUSTER`) | VICEROY 5000:17bb-5000:1c19, 0000:6870 | high | supersedes the FreeCol "badly defended" row above |
| R-804 | wagon trains only in colonies of four or more | as traced (step 7 of the building list) | VICEROY 5000:373c | high | the sim's wagon check is now over the five seeds together (at least 3 with a sale before 1600) |
| R-807 | extra troops a colony wants, and its surplus | (3 x people / 2 - bent - turn / 128 + 2 quiet / + 1 defended) / (bent + 5 + 1 unmet - 1 to be taken); 0 on empty land with room; at most 1 among natives and rivals, Spain excepted | VICEROY 5000:1db4-5000:1f36, leader traits at DS:0x9566 (NAMES @LEADERNAME) | high for the arithmetic, medium for the region states it reads | region strength is our summed attack values |
| R-807 | a colony arms one of its own a turn, and takes units back in | RULES.md "Computer powers: arming and taking in colonists" (`AI_MUSTER`) | VICEROY 5000:204c-5000:239c | high | pioneers sent out, the musket reserve and the war-on-natives decision are left out; scouts' travels are ours |
| R-802 | whether a colonist founds or joins; colonies still wanted; which colony wants colonists | RULES.md "Computer powers: founding and joining" (`AI_SETTLE`) | VICEROY 4000:a1c0, a282, a31c, a3f0, c15e-c39b, cc78-ce38, 5000:1d8e-1fd4 | high for the formulas, medium for two census fields (people, native settlements per landmass) | replaces our colonies-wanted figure (4, +1 per 50 turns, 8 at most); site choice stays ours |
| R-802 | which port passengers are taken to | 4 x ((17 - people)^2 + 2) + 2 x (8 - people) + 20 shared with the human, +/- 25 for wanting colonists, - (distance / 2 + 1), + 0..8 | VICEROY 4000:da58-4000:dd3c | high | blockade terms and turns-since-a-ship left out |
| R-802 | upkeep of a computer colony: tools, land, carpenters, school, training, horses | RULES.md "Computer powers: upkeep of a colony" (`AI_UPKEEP`) | VICEROY 5000:24f1-5000:2a07, 5000:2e9d-2f6c, 5000:3b6b-5000:3e83 | high for tools, carpenters and horses; medium for which square is improved, the school's choice of trade and the training threshold | the square's score and the training threshold are ours |
| R-802 | goods a colony asks for, and where ships take them | RULES.md "Computer powers: supplies by ship" (`AI_SUPPLY`) | VICEROY 5000:239c-5000:24f1, 5000:1726, 5000:0c1a-0c5e, 4000:ddfa-4000:e168 | high for the asking, medium for the helper's exact test | surplus is still sold from the colony, not shipped |
| R-802 | the docks in Europe: recruit, fitting out, dragoons, supplies, sailing | RULES.md "Computer powers: on the docks" (`AI_DOCKS`) | VICEROY 5000:0082-5000:0b7d | high for the tests and odds | prices are the engine's (the original's own fares and free arms from reserves are left out); only the four supplies are bought on a cargo turn, where the original buys a lot of every good |
