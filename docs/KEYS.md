# Keyboard map

Generated from `src/ui/keymap.ts` (the table the key handlers use). Do not edit by hand:
run `UPDATE_FIXTURES=1 npm test` after changing the table.

## Map

| Key | Action | Status |
|---|---|---|
| Arrows, numpad 1-9, Home/End/PgUp/PgDn | Move the active unit one square (view mode: pan the view) | works |
| A | Activate: clear the orders of the unit under the cursor or the active unit | works |
| W | Wait: go on to the next unit and come back to this one later | works |
| Space | No orders: skip this unit for the turn | works |
| F | Fortify | works |
| S | Sentry | works |
| B | Build a colony, or join the colony on this square | works |
| P | Pioneer: clear forest or plow | works |
| R | Pioneer: build a road | works |
| G | Go to: choose a colony from the list (a ship that can reach the Sea Lane is offered Europe first), or pick a square with the arrows or the mouse and Enter | works |
| L | Load the most valuable cargo in this colony | works |
| U | Unload cargo into this colony | works |
| O | Dump cargo overboard | works |
| T | Begin a trade route | works |
| Shift-D | Disband the active unit | works |
| Shift-R | Retire: end the game now and have it scored (asks first) | works |
| Shift-I | Declare independence (asks first; needs half the colonists behind it) | works |
| V | View mode: move a cursor instead of a unit | works |
| M | Move mode | works |
| E | Open the Europe screen | works |
| Z / X | Zoom in / zoom out (15x12, 30x24, 60x48, 120x96 squares) | works |
| H | Show hidden terrain until the next key | works |
| C | Centre the view on the active unit | works |
| Enter | End the turn | works |
| F1 | Terrain Information | works |
| F2 | Religious Adviser: crosses, who is waiting to come over, missions | works |
| F3 | Continental Congress report | works |
| F4 | Labor Adviser: colonists by occupation and where they are | works |
| F5 | Economic Adviser: treasury, prices and trade | works |
| F6 | Colony Adviser: every colony and its warehouse | works |
| F7 | Naval Adviser: ships, where bound, cargo | works |
| F8 | Foreign Affairs report | works |
| F9 | Indian Adviser: the native peoples and their mood | works |
| F10 | Colonial Score | works |
| Alt+T | Trade menu: create, edit or delete a trade route | works |
| Alt+G | Game options: foreign and native moves, end of turn, autosave, combat analysis, hints | works |
| Alt+L | Save or load a game: ten slots, export to a file, import from one | works |
| Alt+S | Sound options: background music, event music, sound effects | works |
| Alt+P | Encyclopedia | works |
| Right-click | Open the encyclopedia at whatever is under the pointer (a unit, the terrain, a building, a cargo, a colonist) | works |
| Alt+O | Colony report options: labels, and which colony news is reported | works |
| Esc | Cancel (Go To targeting, panels) | works |
| Click / drag / pointer at edge | Centre on a square (or open your colony there) / pan / scroll the view | works |
| Click on your unit | Make it the active unit, waking it if it has orders (a list if several stand there); in view mode this also returns to move mode | works |
| Click beside the active unit | Move it one square; the pointer is an arrow showing which way | works |
| Click the near edge of a colony or unit beside the active unit | Move onto that square (the near corner, for a diagonal) where the pointer is an arrow; the rest of the square opens the colony or picks the unit | works |
| Drag from the active unit | Send it to the square where the button is let go: one step if adjacent, Go To if farther | works |
| Wheel / pinch | Zoom in / zoom out about the pointer (a pinch on a trackpad or a touch screen zooms the map, not the page) | works |
| Ctrl/Cmd + Plus / Minus | Zoom in / zoom out: the browser's zoom keys zoom the map while it has the keyboard | works |
| Sidebar buttons | Every order, End Turn, Europe, zoom, the reports and the menus, for play without the keyboard; while a Go To square is being picked, Go to reads Cancel | works |
| Enter (view mode, on your colony) | Open the colony | works |
| Click on the New World view | Centre the view there | works |

## Pop-up questions

| Key | Action | Status |
|---|---|---|
| Arrows | Move the highlight | works |
| Enter | Choose the highlighted answer | works |
| Esc | Take the cautious answer | works |

## Colony screen

| Key | Action | Status |
|---|---|---|
| Tab | Cycle through the views | works |
| Arrows | Move the highlight | works |
| Enter | Jobs and orders menu | works |
| L / = / + | Load the most valuable cargo / a hold of the selected good / some of it | works |
| U / - / _ | Unload the first cargo / all of the selected cargo / some of it | works |
| M | Step the multi-function view on | works |
| 1 / 2 / 3 | Production / units / construction view | works |
| N | Production numbers | works |
| C | Construction menu | works |
| B | Buy the item under construction | works |
| X | Custom House exports | works |
| F1 | Information | works |
| Esc | Leave the colony | works |
| Drag (Shift-drag for part) | Move people between squares, buildings and the gates; goods between warehouse and holds | works |
| Click, then click a place | Select a colonist, unit or cargo, then send it to the square, building, hold or warehouse clicked | works |
| Click the selected colonist or unit | Jobs menu / orders menu | works |

## Europe screen

| Key | Action | Status |
|---|---|---|
| R or 1 | Recruit | works |
| P or 2 | Purchase | works |
| T or 3 | Train | works |
| L / = / + | Buy a hold of the selected good (+ asks how many) | works |
| U / - / _ | Sell the selected cargo, or the first aboard (_ asks how many) | works |
| Arrows | Move the highlight | works |
| Esc or E | Leave Europe | works |
