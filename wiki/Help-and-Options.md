The options, saving and loading, the hints, the encyclopedia and the tooltips.

## Options

![The game options dialog](images/screens/options.png)

There are three groups of options, each in its own dialog:

- **Game options** (Alt+G): how the game plays and what it tells you.
- **Colony report options** (Alt+O): labels on the colony screen, and which kinds of colony news reach the log.
- **Sound options** (Alt+S): music and sound effects.

Open them from the keyboard, or with **Menu...** in the sidebar. Each option is a check box, and a change takes effect at once. **Done** (or Esc) closes the dialog. Hold the pointer over an option to see what it does. Options are kept in your browser and apply to every game you play there.

<!-- table: options -->

### Game options

| Option | What it does | At first |
| :--- | :--- | :--- |
| Show Indian moves | Note in the log what native units were seen doing between our turns. | On |
| Show foreign moves | Note in the log what foreign units were seen doing between our turns. | On |
| Fast piece slide | Pieces move at once instead of sliding. | Off |
| End of turn | Wait for Enter when every unit has moved, instead of ending the turn at once. | On |
| Autosave | Keep the game in this browser after every action. | On |
| Combat analysis | Show the odds and ask before an attack. | On |
| Water shimmer | Animate the sea. | On |
| Tutorial hints | Advice in the log at the moments a newcomer needs it. | On |
| Terrain tooltips | Describe the square under the pointer: its terrain, features and yields. | On |

### Colony report options

| Option | What it does | At first |
| :--- | :--- | :--- |
| Labels on buildings | Name each building on the colony screen. | On |
| Labels on cargo and terrain | Name each cargo and what each square yields. | On |
| Report when colonists are trained | A line when a colonist is taught a trade at school, or learns one by doing it. | On |
| Report food shortages | A warning when a colony's food will run out in a few turns, and when the last of it is eaten. | On |
| Report raw materials shortages | A warning when work stops in a building for want of the goods it works up. | On |
| Report tools needed for production | A warning when what a colony is building needs more tools than it has. | On |
| Report inefficient government | A warning when Tory feeling slows every worker in a colony, and a line when it no longer does. | On |
| Report new cargos available | A line when a colony has a full load of a good ready to ship, and when its warehouse cannot hold all of a good. | On |
| Report Sons of Liberty membership | A line when a colony's Sons of Liberty membership rises or falls. | On |
| Report rebel majorities | A line when half or all of a colony stands with the Sons of Liberty, and when it slips back and a production bonus is lost. | On |

### Sound options

| Option | What it does | At first |
| :--- | :--- | :--- |
| Background music | A quiet tune made up as it goes, in an old mode. | Off |
| Event music | A short flourish when something is built, someone arrives, or the drums of war sound. | On |
| Sound effects | Footfalls, gunfire, the turn of the year. | On |

<!-- /table -->

Some news is always reported, whatever the colony report options say: a colonist starving, a building finished and a unit finished.

**Sound.** Every sound is made by the browser as the game plays; nothing recorded is shipped. There are six cues: a footfall when a unit of yours moves, gunfire for a fight you are in, a flourish when a colony finishes a building or a unit, a ship's bell when an immigrant comes forward, a rising figure as your turn begins, and drums when a native people turns to war against you, burns one of your colonies or joins the Crown. The background music, if you turn it on, is made up phrase by phrase as you play.

## Saving and loading

![The Save or Load Game dialog with its ten slots](images/screens/saves.png)

Press **Alt+L** (or **Menu...** then **Save or load a game**) to open **Save or Load Game**. It has ten slots:

- **Slots 1 to 8** are yours. **Save** writes the game as it stands into a slot; **Load** brings a saved game back. Each slot shows who was playing, the date in the game, the difficulty and how many colonies there were.
- **Autosave (decade)** holds a copy of the game from the start of the latest decade (a year ending in nought). Use it to go back a few turns.
- **Autosave (last turn)** is the game as it stands, written as you play. When it is the only save there is, **Load Game** on the title screen goes straight to it.

The two autosave slots are kept only while the **Autosave** game option is on (it is on at first). You cannot save into them yourself.

Loading replaces the game in front of you; nothing is merged. A save that will not load says why: it is not a saved game, it was saved by a newer version of the game, it is too old to be read, or it is incomplete or damaged.

**Files.** **Export to a file** downloads the game as a `.json` file, and **Import from a file** loads one. Use files to keep a game safe, to move it to another browser or computer, or to send it to someone.

**Where saves live.** Saves, options and the Hall of Fame are kept in your browser's storage for this site, and nowhere else. Nothing is sent to a server. Clearing the browser's data for the site (cookies and site data) deletes them, and a private window may forget them when it closes. Another browser, or another computer, does not see them. Export a file of any game you want to be sure of keeping.

## Hints

While **Tutorial hints** is on, the game gives advice at the moments a newcomer needs it: when your ship first sees land, when a good colony site is underfoot, when a colony eats more than it grows, when a pioneer could build a road, the first time you open Europe, and so on. There are nineteen such hints. Each is given once a game, in the log beside the map, set apart from the news. They never stop play or ask a question. To turn them off, open the game options (Alt+G) and clear **Tutorial hints**.

The log itself keeps the last 200 lines of news and hints, and scrolls.

## The encyclopedia

![The encyclopedia, open at a page](images/screens/encyclopedia.png)

The encyclopedia (**Alt+P**, or **Menu...** then **Encyclopedia**) has a page for everything in the game, grouped by kind: cargo, units, terrain, skills, buildings, Founding Fathers and twelve concepts such as prices, taxes, liberty bells and crosses. Each page gives the facts from the game's own rule tables and a short note on what the thing is for.

**Right-click** anything to open the encyclopedia at its page: a unit or the terrain on the map (squares you have explored), or a building, a cargo or a colonist on the colony screen.

## Tooltips

Hold the pointer over a map square to see a slip describing it: the terrain, any river, road, plowing, resource or rumor, what a colonist working it would bring in, the cost of moving onto it and its value in defence. Turn the **Terrain tooltips** game option off if you would rather not see it; the same facts for the active unit's square stay in the sidebar, and **F1** (Terrain Information) lists every kind of terrain.

Elsewhere, hold the pointer over a sidebar button to see its name and key, over an option to see what it does, and over the Europe button to see which of your ships are in port there or crossing, and when each arrives. [[Controls]] lists every key; [[Reports and Advisers]] describes the reports.
