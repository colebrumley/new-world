// The in-game screen: map canvas, sidebar with the New World view, and input. Redraws happen
// in a requestAnimationFrame loop only when the state or the view changed (dirty flag).
import { GOOD_NAMES, type GoodId } from '../engine/data/goods';
import { FATHERS, type FatherId } from '../engine/data/fathers';
import { NATIONS } from '../engine/data/nations';
import { INDEPENDENCE } from '../engine/data/independence';
import { CAPITAL_NAME, TECH_LEVELS, TRIBES } from '../engine/data/tribes';
import { UNIT_TYPES } from '../engine/data/units';
import { VILLAGE_ACTION_NAMES } from '../engine/data/village';
import { landlord, landPrice } from '../engine/land';
import { isShipUnit, laneFor } from '../engine/movement';
import { mayExplore } from '../engine/explore-order';
import { incitePrice } from '../engine/missions';
import type { ParleyReply } from '../engine/native-trade';
import { settlementAt, tribeOfOwner } from '../engine/settlements';
import { settlementMood, shipRefusal, villageActions } from '../engine/village';
import { PROFESSIONS } from '../engine/data/professions';
import { GOOD_IDS } from '../engine/data/goods';
import { validateAction, type Action, type GameEvent } from '../engine/actions';
import { playTurn } from '../ai/european';
import { analyseAttack } from '../engine/analysis';
import { alliancePrice } from '../engine/diplomacy';
import { askCombat } from '../ui/combat-analysis';
import { portraitCanvas } from '../ui/portraits';
import { checkCashTreasure, royalTransportCut, treasureQuote } from '../engine/royal';
import { showReport, type Report } from '../ui/report';
import { foreignAffairsReport } from '../ui/reports/foreign';
import { scoreReport } from '../ui/reports/score';
import { colonyReport, economicReport, indianReport, laborReport, navalReport, religiousReport, terrainReport } from '../ui/reports/advisers';
import { hallSection, readHall, recordGame, type HallEntry } from './hall-of-fame';
import { congressReport } from '../ui/reports/congress';
import { loadGame, saveGame, stepSession, type GameSession } from '../engine/save';
import { dateOfTurn } from '../engine/calendar';
import { showSaveLoad } from '../ui/save-dialog';
import { describeLoadError, exportName, keepDecade, listSlots, readSlot, writeSlot } from './slots';
import { colonyAt, type GameState, type Unit, type UnitId } from '../engine/state';
import { checkFound, coloniesOf, nextColonyName, siteWarnings } from '../engine/colony';
import { defaultRouteName, routesOf } from '../engine/trade-routes';
import { openColonyScreen } from '../ui/colony-screen';
import { ask, askText } from '../ui/dialog';
import { END_STATUS, endPageModel, openEndPage, type EndChoice, type EndPage } from '../ui/end-page';
import { europeCall } from '../ui/europe-model';
import { openEuropeScreen } from '../ui/europe-screen';
import { mapCommandFor, type MapCommand } from '../ui/keymap';
import { createMagnifiedNotice } from '../ui/magnified';
import { minimapLayout, minimapToTile, renderMinimap } from '../ui/minimap';
import { viewerIndex, renderGround, renderPieces } from '../ui/render';
import { createSidebar, formatMoves, sidebarModel, unitLabel } from '../ui/sidebar';
import { MENU_CHOICES, REPORT_CHOICES, createCommandBar, type BarChoice } from '../ui/command-bar';
import { PINCH_STEP, WHEEL_LINE, WHEEL_STEP, dragBlocked, mapClick, mapCursor, mapDrag, pinchTravel, wheelStep, type PointerMode } from '../ui/pointer';
import { editRoute } from '../ui/trade-routes';
import { createTileCache } from '../ui/tiles';
import { placeTooltip, slipUnits, tileTip, TOOLTIP_DELAY_MS, TOOLTIP_UNIT_LIMIT } from '../ui/tile-tooltip';
import { needsOrders, nextUnit, standsOnMap } from '../ui/unit-queue';
import { chiefSpokeText } from '../ui/village-text';
import { centerOn, isTileInView, makeView, panBy, resizeView, screenToTile, viewCenter, zoomAt, zoomBy, type View } from '../ui/view';
import { readHintsSeen, readOptions, writeAutosave, writeHintsSeen, writeOptions } from './storage';
import { COLONY_OPTIONS, GAME_OPTIONS, SOUND_OPTIONS, type Options } from '../ui/options';
import { cuesFor } from '../ui/audio-cues';
import { createAudioPlayer } from './audio';
import { showOptions } from '../ui/options-dialog';
import { showCheatConsole } from '../ui/cheat-console';
import { showPedia, type PediaTarget } from '../ui/pedia-screen';
import { isExploredBy, terrainOf } from '../engine/tile';
import { cargoNotices, colonyNotices, movementNotices, voyageNotices } from '../ui/notices';
import { nextHint, type HintContext } from '../ui/hints';

/** Direction keys: arrows, numeric keypad digits, and the keypad's navigation names. */
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
};

const EDGE_SCROLL_MARGIN = 14; // pixels from the canvas edge
const EDGE_SCROLL_SPEED = 14; // tiles per second
const DRAG_THRESHOLD = 4; // pixels before a press becomes a drag
const WHEEL_PAUSE_MS = 140; // least time between two zoom steps of the wheel

/** move: keys drive the active unit. view: keys drive a cursor. goto: picking a Go To destination. */
type Mode = PointerMode;

export interface GameScreenDebug {
  /** Force `frames` full redraws and return the mean time of one, in milliseconds. */
  benchmark(frames: number): number;
  /** How many colonies there are on the map. */
  colonies(): number;
  /** End the turn (the computer powers then move) and say how long it took, in milliseconds. */
  endTurnMs(): number;
}

declare global {
  interface Window {
    __newWorld?: GameScreenDebug;
  }
}

/** Commands that go on working on the map of a game that is over: looking, reading, and the menus that give no order. */
const OVER_COMMANDS: ReadonlySet<MapCommand> = new Set(['zoomIn', 'zoomOut', 'hiddenTerrain', 'report', 'menu']);
/** The menus that do give orders, by their Alt letter: Trade and Cheats. A game that is over does not open them. */
const ORDER_MENUS: ReadonlySet<string> = new Set(['t', 'c']);

export interface GameScreenOptions {
  /** A game just begun (never one loaded): it opens with an audience with the Crown. */
  readonly opening?: boolean;
  /** Puts the title screen up in place of the game, for New game on the end page. */
  readonly toTitle: () => void;
}

export function startGame(root: HTMLElement, initial: GameSession, { opening = false, toTitle }: GameScreenOptions): void {
  const screen = document.createElement('div');
  screen.className = 'game';
  // the stylesheet seals what it shows with wax of the player's colour (--nation)
  const seat = initial.state.players[viewerIndex(initial.state)];
  if (seat) screen.dataset['nation'] = seat.nation;
  /** Set when another game is loaded over this one: this screen's loop ends. */
  let stopped = false;
  let options: Options = readOptions();
  const audio = createAudioPlayer();
  const applyOptions = (next: Options): void => {
    options = next;
    writeOptions(next);
    audio.setMusic(next);
    // the colony screen reads these two from the page
    screen.dataset['buildingLabels'] = next.buildingLabels ? 'on' : 'off';
    screen.dataset['cargoLabels'] = next.cargoLabels ? 'on' : 'off';
  };
  applyOptions(options);
  // A pinch on a trackpad (a wheel event with Ctrl held) would magnify the page itself, and the game
  // fills the window with nothing to scroll back to: the edges of every screen would be cut off.
  // Over the map the wheel and the pinch zoom the map; anywhere else in the game a pinch does nothing.
  screen.addEventListener('wheel', (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
  for (const gesture of ['gesturestart', 'gesturechange']) screen.addEventListener(gesture, (event) => event.preventDefault()); // Safari's pinch
  // a page magnified all the same (restored that way, or by a gesture the browser keeps to itself) says so
  const magnified = createMagnifiedNotice();
  const save = (): void => {
    if (options.autosave) writeAutosave(session);
  };

  const onResize = (): void => resize();
  /** Leave this game: its loop ends, its listeners on the window go, and its music stops. */
  const stopGame = (): void => {
    stopped = true;
    window.removeEventListener('resize', onResize);
    magnified.stop();
    hideTip();
    overMap.disconnect();
    audio.stop();
  };
  /** Put another game on the table in place of this one. */
  const switchTo = (other: GameSession): void => {
    stopGame();
    startGame(root, other, { toTitle });
  };
  /** Save/Load Game: the ten slots, and a file in or out. Stays open after a save so the player sees it took. */
  const saveLoadMenu = async (): Promise<void> => {
    let notice = '';
    for (;;) {
      const choice = await showSaveLoad(screen, listSlots(), !session.state.over, notice);
      if (!choice) return;
      if (choice.kind === 'save') {
        notice = writeSlot(choice.slot, session) ? `Saved in slot ${choice.slot + 1}.` : 'The browser would not keep the save.';
        continue;
      }
      if (choice.kind === 'export') {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([saveGame(session)], { type: 'application/json' }));
        link.download = exportName(session);
        link.click();
        URL.revokeObjectURL(link.href);
        notice = `Exported as ${link.download}.`;
        continue;
      }
      try {
        const loaded = choice.kind === 'load' ? readSlot(choice.slot) : loadGame(choice.text);
        if (!loaded) {
          notice = 'That slot is empty.';
          continue;
        }
        switchTo(loaded);
        return;
      } catch (error) {
        notice = describeLoadError(error);
      }
    }
  };
  const canvas = document.createElement('canvas');
  canvas.className = 'map';
  canvas.tabIndex = 0;
  const sidebar = createSidebar();
  // the slip that says what the square under a resting pointer is
  const tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  screen.append(canvas, sidebar.element, magnified.element, tooltip);
  root.replaceChildren(screen);

  const ctx = canvas.getContext('2d');
  const miniCtx = sidebar.minimap.getContext('2d');
  if (!ctx || !miniCtx) throw new Error('Canvas 2D is not available');

  const dpr = window.devicePixelRatio || 1;
  const cache = createTileCache();
  const revealAll = new URLSearchParams(location.search).has('reveal');

  let session = initial;
  let mode: Mode = 'move';
  let cursor: { x: number; y: number } | null = null;
  let activeId: UnitId | null = null;
  /** The unit each held direction key (by code) began moving; that key's repeats move no other. */
  const heldFor = new Map<string, UnitId | null>();
  const waiting = new Set<UnitId>();
  let notice = '';
  let dirty = true;
  let shownPointer = '';
  /** The ground as last painted, and what it was painted for. */
  const ground = document.createElement('canvas');
  let groundOf: { map: GameState['map'] | null; view: View | null; water: number } = { map: null, view: null, water: -1 };
  let frames = 0;
  /** Redraws made only to move an animation on. */
  let ticks = 0;
  // --- small animations: the active piece's frame blinks, the sea moves, a piece slides to its new square ---
  /** `?still` freezes all three, for screenshots that must not change from one moment to the next. */
  const still = new URLSearchParams(location.search).has('still');
  const BLINK_MS = 450;
  const WATER_MS = 700;
  const SLIDE_MS = 120;
  let slide: { unitId: string; fromX: number; fromY: number; began: number } | null = null;
  /** The square of the piece most recently awaiting orders. */
  let lastSpot: { x: number; y: number } | null = null;
  let shownBlink = true;
  let shownWater = 0;
  const blinkAt = (time: number): boolean => still || Math.floor(time / BLINK_MS) % 2 === 0;
  const waterAt = (time: number): number => (still || !options.waterShimmer ? 0 : Math.floor(time / WATER_MS) % 4);
  /** How far along its slide the moving piece is, as the part of the way still to go; null when nothing is sliding. */
  const slideAt = (time: number): { unitId: string; dx: number; dy: number } | null => {
    if (!slide) return null;
    const unit = session.state.units[slide.unitId];
    const left = 1 - (time - slide.began) / SLIDE_MS;
    if (!unit || left <= 0 || unit.voyage !== null) {
      slide = null;
      return null;
    }
    return { unitId: unit.id, dx: (slide.fromX - unit.x) * left, dy: (slide.fromY - unit.y) * left };
  };

  let pointer: { x: number; y: number } | null = null;
  /** A press on the map: `aim` when it began on the active unit, which is then being sent somewhere rather than the view panned. */
  let drag: { x: number; y: number; moved: boolean; aim: boolean; unitId: UnitId | null } | null = null;
  /** The square an aimed drag is over. */
  let aimAt: { x: number; y: number } | null = null;
  /** Whether letting go over `aimAt` would be refused: worked out once for each square the aim moves to, and again when the game changes under it. */
  let aimBlocked = false;
  /** The game `aimBlocked` was worked out for; null when it is to be worked out again. */
  let aimJudged: GameState | null = null;
  let wheelKept = 0;
  let wheelAt = 0;
  let lastTime = 0;
  /** The wait before the slip appears, while the pointer rests; 0 when none is running. */
  let tipTimer = 0;
  /** The square the slip describes while it is up. */
  let tipAt: { x: number; y: number } | null = null;
  /** What the slip says while it is up, to tell when the same square has something new to say. */
  let tipSaid = '';
  /** Take the slip away and give up the wait: the next movement of the pointer starts it again. Never redraws the map. */
  const hideTip = (): void => {
    if (tipTimer) window.clearTimeout(tipTimer);
    tipTimer = 0;
    if (!tipAt) return;
    tipAt = null;
    tooltip.hidden = true;
  };
  /**
   * Describe the square under the pointer on the slip, or take the slip away where there is nothing to say. Only the slip
   * changes, and only when the square does; with `again` (each drawing of the map) also when the same square reads differently.
   */
  const showTip = (again = false): void => {
    if (!again) tipTimer = 0;
    const tile = pointer && !drag ? screenToTile(view, session.state.map, pointer.x, pointer.y) : null;
    if (!again && tile && tipAt && tile.x === tipAt.x && tile.y === tipAt.y) return;
    // never with the option off, on a device that cannot hover, or under a question, a report or another screen
    const allowed = !stopped && options.terrainTooltips && window.matchMedia('(hover: hover)').matches && !screen.querySelector('[role="dialog"]');
    const tip = tile && allowed ? tileTip(session.state, tile.x, tile.y, revealAll, activeId) : null;
    if (!pointer || !tile || !tip) {
      hideTip();
      return;
    }
    const line = (text: string, className = ''): HTMLElement[] => {
      if (!text) return [];
      const p = document.createElement('p');
      if (className) p.className = className;
      p.textContent = text;
      return [p];
    };
    const build = (limit: number): HTMLElement[] => [
      ...line(tip.title, 'map-tooltip-title'), ...tip.features.flatMap((feature) => line(feature)), ...line(tip.yields, 'map-tooltip-yields'), ...line(tip.ground, 'map-tooltip-ground'),
      // with the pieces hidden (H) the map shows no unit, so the slip names none; a great stack is cut short
      ...(view.showHidden ? [] : slipUnits(tip.units, limit)).flatMap((unit) => [...line(unit.line, 'map-tooltip-unit'), ...line(unit.carried, 'map-tooltip-carried')]),
    ];
    const lines = build(TOOLTIP_UNIT_LIMIT);
    const said = lines.map((p) => p.textContent).join('\n');
    if (tipAt && tile.x === tipAt.x && tile.y === tipAt.y && said === tipSaid) return;
    tooltip.replaceChildren(...lines);
    tipSaid = said;
    tipAt = tile;
    tooltip.hidden = false;
    // units with long loads may still stand taller than the map: name fewer of them until the slip fits
    for (let limit = TOOLTIP_UNIT_LIMIT - 1; limit >= 1 && tooltip.offsetHeight > canvas.clientHeight; limit--) tooltip.replaceChildren(...build(limit));
    const at = placeTooltip(pointer, { width: tooltip.offsetWidth, height: tooltip.offsetHeight }, { width: canvas.clientWidth, height: canvas.clientHeight });
    tooltip.style.left = `${canvas.offsetLeft + at.x}px`;
    tooltip.style.top = `${canvas.offsetTop + at.y}px`;
  };
  /** The pointer moved over the map with no button down: the slip follows it from square to square at once, or the wait begins again. */
  const hoverTip = (): void => {
    if (tipAt) {
      showTip();
      return;
    }
    if (tipTimer) window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => showTip(), TOOLTIP_DELAY_MS);
  };
  // a question, a report, the colony screen, Europe or the encyclopedia laid over the map takes the slip away
  const overMap = new MutationObserver(() => {
    if (screen.querySelector('[role="dialog"]')) hideTip();
  });
  overMap.observe(screen, { childList: true });

  const me = (): string => session.state.players[viewerIndex(session.state)]?.id ?? '';
  const activeUnit = (): Unit | null => (activeId ? (session.state.units[activeId] ?? null) : null);

  const first = nextUnit(session.state, me(), null, waiting);
  activeId = session.state.over ? null : (first?.id ?? null);
  let view: View = makeView(session.state.map, 1, 1, first?.x ?? session.state.map.width / 2, first?.y ?? session.state.map.height / 2, { revealAll });

  const setView = (next: View): void => {
    if (next.originX === view.originX && next.originY === view.originY && next.tileSize === view.tileSize
      && next.showHidden === view.showHidden && next.width === view.width && next.height === view.height) return;
    view = next;
    dirty = true;
    canvas.dataset['view'] = JSON.stringify(view);
    hideTip(); // the squares have moved under the pointer
  };

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mini = sidebar.minimap;
    mini.width = Math.round(mini.clientWidth * dpr);
    mini.height = Math.round(mini.clientHeight * dpr);
    miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = resizeView(view, session.state.map, width, height);
    dirty = true;
    hideTip();
  };

  const say = (text: string): void => {
    notice = text;
    dirty = true;
  };

  const followUnit = (): void => {
    const unit = activeUnit();
    if (unit && unit.x >= 0 && !isTileInView(view, unit.x, unit.y, 1)) setView(centerOn(view, session.state.map, unit.x, unit.y));
  };

  /** Move on to another unit if the active one is done for the turn. */
  const settle = (): void => {
    // nobody takes orders in a game that is over
    if (session.state.over) {
      activeId = null;
      dirty = true;
      return;
    }
    const unit = activeUnit();
    if (unit && needsOrders(unit, me())) return;
    const next = nextUnit(session.state, me(), activeId, waiting);
    activeId = next?.id ?? null;
    followUnit();
    dirty = true;
  };

  /** Apply an action if it is valid; otherwise show why not. Returns whether it was applied. */
  const dispatch = (action: Action): boolean => perform(action) !== null;

  /**
   * Apply a `cheat` action from the console (R-1062): the session steps as it does for any action,
   * the log beside the map says what was done, and the summary goes back to the console. A Founding
   * Father the cheat seated is announced as one seated by a turn is; a Congress it convened puts its
   * question at once, over the console.
   */
  const runCheat = (action: Action): string | null => {
    const events = perform(action);
    const applied = events?.find((e) => e.type === 'cheatApplied');
    if (!events || !applied || applied.type !== 'cheatApplied') return null;
    record(`Cheat: ${applied.summary}`);
    for (const e of events) if (e.type === 'fatherJoined' && e.player === me()) say(fatherJoinedText(e.father));
    if (events.some((e) => e.type === 'congressConvened' && e.player === me())) void congressBusiness();
    return applied.summary;
  };

  /** The one body of `dispatch` and `runCheat`: step the session and do all that follows on the screen. The events, or null if the action was refused. */
  const perform = (action: Action): readonly GameEvent[] | null => {
    const check = validateAction(session.state, action);
    if (!check.ok) {
      say(check.error.message);
      return null;
    }
    const before = session.state;
    const first = stepSession(session, action);
    session = first.session;
    // a piece of ours that stepped to the next square slides there, unless the player wants it at once
    if (action.type === 'moveUnit' && !options.fastPieceSlide && !still) {
      const was = before.units[action.unitId];
      const now = session.state.units[action.unitId];
      if (was && now && now.voyage === null && was.voyage === null && (was.x !== now.x || was.y !== now.y) && Math.max(Math.abs(was.x - now.x), Math.abs(was.y - now.y)) === 1) {
        slide = { unitId: now.id, fromX: was.x, fromY: was.y, began: performance.now() };
      }
    }
    // the computer powers take their turns at once, through the same actions, so the log replays
    const turnEnded = action.type === 'endTurn' || action.type === 'declareIndependence' || action.type === 'continuePlaying';
    const rivals: GameEvent[] = [];
    for (let guard = 0; guard < 16 && turnEnded && !session.state.over && session.state.players[session.state.current]?.kind === 'ai'; guard++) {
      const turn = playTurn(session.state);
      rivals.push(...turn.events);
      session = { options: session.options, log: [...session.log, ...turn.actions], state: turn.state };
    }
    const stepped = { session, events: rivals.length === 0 ? first.events : [...first.events, ...rivals] };
    save();
    notice = '';
    dirty = true;
    if (turnEnded) {
      waiting.clear();
      activeId = null;
    }
    settle();
    europeScreen?.refresh();
    if (turnEnded) {
      // the autosave slots: the game as it stands is kept as play goes on; a copy is put by as each decade opens
      if (options.autosave && session.state.players[session.state.current]?.id === me()) keepDecade(session);
      for (const line of [...colonyNotices(stepped.events, session.state, me(), options), ...cargoNotices(before, session.state, me(), options), ...movementNotices(before, session.state, me(), options), ...voyageNotices(stepped.events, session.state, me())]) record(line);
      for (const e of stepped.events) {
        if (e.type === 'independenceDeclared' && e.player === me()) record(`Independence is declared, with ${e.sentiment}% of our colonists behind it. The other powers have left the New World; the Crown's army is coming.`);
        if (e.type === 'unitsSeized' && e.player === me()) record(`The Crown has seized everything of ours in Europe and on the ocean: ${e.ships.length} ship${e.ships.length === 1 ? '' : 's'} and ${e.others} other unit${e.others === 1 ? '' : 's'}.`);
        if (e.type === 'continentalsMustered' && e.player === me()) record(`${e.unitIds.length} veteran unit${e.unitIds.length === 1 ? '' : 's'} in ${session.state.colonies[e.colonyId]?.name ?? 'a colony'} now serve${e.unitIds.length === 1 ? 's' : ''} in the Continental Army.`);
        if (e.type === 'interventionConsidered' && e.player === me()) record(`${NATIONS[session.state.players.find((p) => p.id === e.friend)?.nation ?? 'france'].name} may enter the war on our side once our colonies have rung ${e.bells} more liberty bells.`);
        if (e.type === 'refLanded' && e.player === me()) record(`The Royal Expeditionary Force has landed ${e.unitIds.length} units beside ${session.state.colonies[e.colonyId]?.name ?? 'a colony'}${e.last ? '; it is the last of them' : ''}.`);
        if (e.type === 'unitOverrun' && e.owner === me()) record('One of our units was caught where the King\'s men came ashore and is lost.');
        if (e.type === 'interventionBegan' && e.player === me()) record(`${NATIONS[session.state.players.find((p) => p.id === e.friend)?.nation ?? 'france'].name} has declared war on the Crown and is sending ships and troops to our ports.`);
        if (e.type === 'interventionArrived' && e.player === me()) record(`A Man-of-War has put ${e.unitIds.length} allied units ashore at ${session.state.colonies[e.colonyId]?.name ?? 'our port'}; the ship is ours to command.`);
        if (e.type === 'refBeaten' && e.player === me()) record('We have beaten the King\'s troops in battle. Retake any colony he holds and wear his army down to a remnant, and the war is won.');
        if (e.type === 'warWarning' && e.player === me()) {
          record(e.danger === 'ports' ? `Only ${e.value} of our ports remain${e.value === 1 ? 's' : ''}: lose them all and the war is lost.`
            : e.danger === 'colonies' ? `We hold only ${e.value} ${e.value === 1 ? 'colony' : 'colonies'}: lose them all and the war is lost.`
              : `The King now holds ${e.value}% of the people of the colonies; at ${INDEPENDENCE.lostShare}% the war is lost.`);
        }
        if (e.type === 'toryUprising' && e.player === me()) record(`Tories have taken up arms outside ${session.state.colonies[e.colonyId]?.name ?? 'a colony'}: ${e.unitIds.length} units.`);
        if (e.type === 'battle') record(battleLine([e], before));
        if (e.type === 'immigrantArrived' && e.player === me()) say(`${PROFESSIONS[e.profession].name} has arrived on the docks in Europe.`);
        if (e.type === 'kingDeclaredWar' && e.player === me()) say(`The Crown is at war in Europe and sends ${e.gold} gold and ${e.soldiers} veteran soldiers to the docks.`);
        if (e.type === 'refGrew' && e.player === me()) say(`The Crown has added ${e.unit} to its Expeditionary Force.`);
        if (e.type === 'succession') say('The War of Succession is over in Europe; one power has ceded its colonies to another.');
        if (e.type === 'independenceGranted') say('A rival power has been granted its independence.');
        if (e.type === 'fatherJoined' && e.player === me()) say(fatherJoinedText(e.father));
        if (e.type === 'colonyCaptured' && e.from === me()) say(`${e.name} has fallen to the enemy${e.plunder > 0 ? `, who carried off ${e.plunder} gold` : ''}.`);
        if (e.type === 'shipSunk' && e.owner === me()) say('One of our ships has been sunk.');
        if (e.type === 'fortFired' && session.state.colonies[e.colonyId]?.owner === me()) say(e.hit ? 'Our fort has hit an enemy ship.' : 'Our fort fired on an enemy ship and missed.');
        if (e.type === 'shipDamaged' && e.owner === me()) say(`One of our ships has been damaged and must lie up ${e.turns} turns for repair.`);
        if (e.type === 'shipRepaired' && e.owner === me()) say('A ship has been repaired and is ready for sea.');
        if (e.type === 'colonyBurned' && e.owner === me()) say(`${e.name} has been burned to the ground by the ${TRIBES[e.tribe].name}.`);
        if (e.type === 'colonyRaided' && session.state.colonies[e.colonyId]?.owner === me()) {
          const name = session.state.colonies[e.colonyId]?.name ?? 'our colony';
          const what = e.outcome === 'goods' && e.good ? `carried off ${e.amount} ${GOOD_NAMES[e.good]}` : e.outcome === 'gold' ? `plundered ${e.amount} gold` : e.outcome === 'building' ? 'burned a building' : 'were driven off';
          say(`${TRIBES[e.tribe].name} raiders at ${name} ${what}.`);
        }
        if (e.type === 'nativeGift' && session.state.colonies[e.colonyId]?.owner === me()) say(`Natives brought a gift of ${e.amount} ${GOOD_NAMES[e.good]} to ${session.state.colonies[e.colonyId]?.name ?? 'our colony'}.`);
        if (e.type === 'convertJoined' && e.player === me()) say('A native convert has joined one of our colonies.');
      }
      for (const e of stepped.events) {
        if ((e.type === 'buildingCompleted' || e.type === 'unitBuilt') && session.state.colonies[e.colonyId]?.owner === me() && !finished.includes(e.colonyId)) finished.push(e.colonyId);
      }
    }
    // a colony of ours given up, from its own screen
    for (const e of stepped.events) {
      if (e.type === 'colonyAbandoned' && before.colonies[e.colonyId]?.owner === me()) say(`${e.name} has been abandoned.`);
    }
    // a treasure train that has just come into one of our colonies, by a move, a Go To or being put ashore there
    const arrived = action.type === 'moveUnit' || action.type === 'goTo' || action.type === 'endTurn' || action.type === 'goAshore' ? treasuresArrived(before, session.state) : [];
    const moving = action.type === 'moveUnit' || action.type === 'goTo' || action.type === 'goToEurope' || action.type === 'explore' || action.type === 'foundColony' || action.type === 'endTurn';
    // our scouts that spoke with a chief on their own, under the Explore order (the owner as it was: a scout put to death is gone)
    const chiefs = action.type === 'explore' || action.type === 'endTurn'
      ? new Set(stepped.events.flatMap((e) => (e.type === 'chiefSpoke' && (before.units[e.unitId] ?? session.state.units[e.unitId])?.owner === me() ? [e.unitId] : [])))
      : new Set<string>();
    // an exploring unit that has run out of places to go
    for (const e of stepped.events) {
      if (e.type !== 'exploreDone') continue;
      const done = session.state.units[e.unitId];
      if (done?.owner === me()) record(`${unitLabel(done)} at (${e.x}, ${e.y}): nothing left to explore.`);
    }
    /** What the move turned up, being shown: the turn may end by itself only once it is all answered. */
    let shown: Promise<void> | null = null;
    if (session.state.over) {
      // the end page comes up in place of anything the turn would have asked: no answer could be given now
      announceEnd();
    } else if (turnEnded) {
      // the turn's questions come one after another (both ask for audiences); then the player is taken to each colony with a finished project
      void royalBusiness().then(() => (moving ? afterMoving(stepped.events, arrived, false, chiefs) : undefined)).then(visitFinished);
    } else if (moving) {
      shown = afterMoving(stepped.events, arrived, true, chiefs);
    } else if (arrived.length > 0) {
      // put ashore from the colony screen: ask once that screen has redrawn and taken focus, so the question keeps it
      queueMicrotask(() => void offerTreasures(arrived, false));
    }
    audio.play(cuesFor(stepped.events, session.state, me()), options);
    canvas.dataset['cues'] = audio.played.slice(-6).join(',');
    offerHint({ where: colonyScreen ? 'colony' : europeScreen ? 'europe' : 'map', activeUnitId: activeId, colonyId: canvas.dataset['colony'] || null });
    // with "End of turn" off, the turn ends by itself once the last unit has had its orders
    // (a treasure's question comes first: afterMoving ends the turn once it is answered; a rumour's or a chief's
    // dialog is closed first, so the check is made once afterMoving is done)
    if (!turnEnded && arrived.length === 0 && UNIT_ORDER_ACTIONS.has(action.type)) {
      if (shown) void shown.then(endTurnIfDone);
      else queueMicrotask(endTurnIfDone);
    }
    return stepped.events;
  };

  /** With "End of turn" off, end the turn once the last unit has had its orders and nothing is being asked. */
  const endTurnIfDone = (): void => {
    if (options.endOfTurn || activeId !== null || colonyScreen || europeScreen || session.state.over || screen.querySelector('[role="dialog"]')) return;
    dispatch({ type: 'endTurn' });
  };

  /** Treasure trains of ours that stand in one of our colonies now and did not before, and could be cashed there. */
  const treasuresArrived = (before: GameState, after: GameState): UnitId[] =>
    Object.values(after.units)
      .filter((u) => u.owner === me() && u.type === 'treasure' && checkCashTreasure(after, me(), u.id).ok)
      .filter((u) => {
        const was = before.units[u.id];
        return !was || was.x !== u.x || was.y !== u.y || was.aboard !== u.aboard;
      })
      .map((u) => u.id);

  const fatherJoinedText = (father: FatherId): string => `${FATHERS[father].name} has joined the Continental Congress. ${FATHERS[father].effect}`;

  /** The Continental Congress wants to know whom to work toward: asked at the opening of a turn, and when a cheat convenes it. */
  const congressBusiness = async (): Promise<void> => {
    const mine = (): (typeof session.state.players)[number] | undefined => session.state.players.find((p) => p.id === me());
    for (let guard = 0; guard < 6 && (mine()?.fatherOffer.length ?? 0) > 0; guard++) {
      const names = mine()?.fatherOffer ?? [];
      const labels = names.map((id) => `${FATHERS[id].name} (${FATHERS[id].category}): ${FATHERS[id].effect}`);
      const pick = await ask(screen, { text: 'Which Founding Father shall the Continental Congress next seek to seat?', choices: labels, choicePictures: names.map((id) => portraitCanvas(id)) });
      const father = names[pick] ?? names[0];
      if (!father) break;
      const joined = stepSession(session, { type: 'chooseFather', father }).events.find((e) => e.type === 'fatherJoined');
      if (!dispatch({ type: 'chooseFather', father })) break;
      if (joined && joined.type === 'fatherJoined') await ask(screen, { text: fatherJoinedText(joined.father), choices: ['Continue'], escape: 0, picture: portraitCanvas(joined.father, 2) });
    }
  };

  /** Questions the turn has left for the player: a tax rise, an offer from the Crown, a choice of immigrant. */
  const royalBusiness = async (): Promise<void> => {
    const mine = (): (typeof session.state.players)[number] | undefined => session.state.players.find((p) => p.id === me());
    const tax = mine()?.pendingTax;
    if (tax) {
      const where = session.state.colonies[tax.colonyId]?.name ?? 'the colonies';
      const pick = await ask(screen, {
        text: `The Crown has raised the tax rate by ${tax.increase}%, to ${mine()?.taxRate}%. The people of ${where} talk of throwing their ${tax.good} into the harbor.`,
        choices: ['Pay the new tax', `Hold a ${tax.good} party in ${where}`], escape: 0, picture: portraitCanvas('king', 2),
      });
      dispatch({ type: 'answerTax', party: pick === 1 });
    }
    await congressBusiness();
    const offer = mine()?.pendingOffer;
    if (offer) {
      const text = offer.kind === 'frigate'
        ? `Foreign warships threaten our colonies. The Crown will send a frigate if we accept ${offer.tax} more points of tax.`
        : offer.kind === 'continentals'
          ? `The Crown of ${NATIONS[offer.from].name} will hire out trained troops for our cause: ${offer.army} Continental Army${offer.cavalry ? `, ${offer.cavalry} Continental Cavalry` : ''}${offer.artillery ? `, ${offer.artillery} artillery` : ''} for ${offer.price} gold, all or none.`
          : `The Crown of ${NATIONS[offer.from].name} offers mercenaries: ${offer.dragoons} veteran dragoons${offer.artillery ? ` and ${offer.artillery} artillery` : ''} for ${offer.price} gold, all or none.`;
      const pick = await ask(screen, { text, choices: ['Decline', 'Accept'], escape: 0, picture: portraitCanvas('king', 2) });
      dispatch({ type: 'answerOffer', accept: pick === 1 });
    }
    for (let guard = 0; guard < 20 && (mine()?.demands.length ?? 0) > 0; guard++) {
      const demand = mine()?.demands[0];
      if (!demand) break;
      const town = session.state.colonies[demand.colonyId]?.name ?? 'our colony';
      const people = TRIBES[session.state.settlements[demand.settlementId]?.tribe ?? 'sioux'].name;
      const text = demand.kind === 'beg'
        ? `${people} from a hungry village are at the gates of ${town}, begging ${demand.amount} food.`
        : `${people} braves at ${town} demand ${demand.amount} ${GOOD_NAMES[demand.good]} for the wrongs done them.`;
      const pick = await ask(screen, { text, choices: ['Give it to them', 'Send them away'] });
      dispatch({ type: 'answerDemand', index: 0, give: pick === 0 });
    }
    await audiences();
    // with Brewster in the Congress the player says which of the three comes over
    const pool = mine()?.immigrantDue ? mine()?.pool : null;
    if (pool) {
      const pick = await ask(screen, { text: 'Word has spread in Europe that a man may worship as he will across the ocean. Who shall come over?', choices: pool.map((p) => PROFESSIONS[p].name) });
      dispatch({ type: 'chooseImmigrant', slot: pick });
    }
  };

  // --- the end of the game: the end page, and the map of a game that is over -----------------------
  let endPage: EndPage | null = null;
  /** The Hall of Fame as it stood when this game was entered: shown in the reckoning even if the browser would not keep it. */
  let hallAtEnd: readonly HallEntry[] | null = null;
  /** Say on the canvas how the game stands: the reason it ended, or nothing while it is played. */
  const markOver = (): void => {
    canvas.dataset['over'] = session.state.over?.reason ?? '';
  };
  const closeEnd = (): void => {
    endPage?.close();
    endPage = null;
    dirty = true;
    canvas.focus();
  };
  /** Put the end page up, if the game is over and the page is not up already. */
  const showEnd = (): void => {
    const model = endPageModel(session.state);
    if (!model || endPage) return;
    hideTip();
    mode = 'move';
    cursor = null;
    notice = '';
    dirty = true;
    endPage = openEndPage(screen, model, (choice) => void endChoice(choice));
  };
  const endChoice = async (choice: EndChoice): Promise<void> => {
    const over = session.state.over;
    // one thing at a time: a choice clicked under the reckoning or the load dialog is not taken
    if (!over || !endPage || screen.querySelector('[role="dialog"]:not(.end-page)')) return;
    switch (choice) {
      case 'reckoning':
        canvas.dataset['report'] = 'score';
        await showReport(screen, scoreReport(session.state, over.player, [hallSection(hallAtEnd ?? readHall())]));
        canvas.dataset['report'] = '';
        return;
      case 'playOn':
        closeEnd();
        hallAtEnd = null;
        dispatch({ type: 'continuePlaying' });
        markOver();
        return;
      case 'newGame':
        // the finished game stays where it was saved; nothing of it goes on running
        stopGame();
        toTitle();
        root.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
        return;
      case 'loadGame':
        // a game loaded takes this screen's place; cancelled, the page is still here
        await saveLoadMenu();
        return;
      case 'lookOver':
        closeEnd();
        return;
    }
  };
  /** The game has just ended: a place in the Hall of Fame, once, and the end page. */
  const announceEnd = (): void => {
    const over = session.state.over;
    if (!over) return;
    hallAtEnd = recordGame(session.state, over.player);
    markOver();
    showEnd();
  };

  const RUMOR_TEXT: Readonly<Record<string, string>> = {
    nothing: 'The rumors of a lost city here were nothing but rumors.',
    ruins: 'Our party has found the ruins of a lost colony.',
    cibola: 'Our party has come upon a city of gold, one of the fabled seven of Cibola. Its treasure must be carried home.',
    fountain: 'Our party has found a Fountain of Youth! Word of it draws the hopeful of Europe to the docks.',
    burial: 'Our party has come upon native burial mounds.',
    vanished: 'Our party has vanished without a trace.',
    gift: 'A small friendly village welcomed our party with gifts.',
    shrines: 'Our party has trespassed on holy shrines, and the natives are angered.',
    survivors: 'Survivors of a lost colony have joined our party.',
  };

  /**
   * What moving about has turned up: a rumor explored, a chief our exploring scouts (`chiefs`, by
   * unit) spoke with on their own, mounds to decide on, the Fountain's followers, a tribe met.
   */
  const afterMoving = async (events: readonly GameEvent[], treasures: readonly UnitId[] = [], byOrders = false, chiefs: ReadonlySet<string> = new Set()): Promise<void> => {
    const mine = (): (typeof session.state.players)[number] | undefined => session.state.players.find((p) => p.id === me());
    for (const e of events) {
      if (e.type === 'chiefSpoke' && chiefs.has(e.unitId)) {
        await ask(screen, { text: chiefSpokeText(e), choices: ['Continue'], escape: 0 });
        continue;
      }
      if (e.type !== 'rumorExplored' || e.player !== me()) continue;
      const gold = e.gold > 0 ? ` We gained ${e.gold} gold.` : '';
      await ask(screen, { text: `${RUMOR_TEXT[e.outcome] ?? ''}${gold}`, choices: ['Continue'], escape: 0 });
    }
    if (mine()?.pendingBurial) {
      const pick = await ask(screen, { text: 'Shall we search the burial mounds for treasure?', choices: ['Leave them in peace', 'Search them'], escape: 0 });
      const action = { type: 'answerBurial', search: pick === 1 } as const;
      if (validateAction(session.state, action).ok) {
        const dug = stepSession(session, action).events.find((x) => x.type === 'burialSearched');
        dispatch(action);
        if (dug && dug.type === 'burialSearched' && dug.find !== 'left') {
          const what = dug.find === 'empty' ? 'Nothing lies in the mounds but earth.' : dug.find === 'trinkets' ? `We found trinkets worth ${dug.gold} gold.` : 'We found a great treasure, to be carried home.';
          const curse = dug.sacredTo ? ` But these were the sacred grounds of the ${TRIBES[dug.sacredTo].name}, who now swear vengeance.` : '';
          await ask(screen, { text: `${what}${curse}`, choices: ['Continue'], escape: 0 });
        }
      }
    }
    for (let guard = 0; guard < 16 && (mine()?.fountain ?? 0) > 0 && !mine()?.immigrantDue; guard++) {
      const pool = mine()?.pool ?? [];
      const pick = await ask(screen, { text: `Who shall come to the New World? (${mine()?.fountain} more may follow)`, choices: pool.map((p) => PROFESSIONS[p].name) });
      if (!dispatch({ type: 'chooseImmigrant', slot: pick })) break;
    }
    await greetTribes();
    await audiences();
    if (treasures.length > 0) await offerTreasures(treasures, byOrders);
  };

  // --- combat: the analysis beforehand, a flash of the result, and a line in the log --------------
  const log: string[] = [];
  const logList = document.createElement('ol');
  logList.className = 'event-log';
  logList.dataset['field'] = 'log';
  logList.setAttribute('aria-label', 'Recent events');
  screen.append(logList);
  const LOG_KEPT = 200;
  const HINT_MARK = '\u0001';
  /** Orders that can use up the last unit's turn. */
  const UNIT_ORDER_ACTIONS: ReadonlySet<Action['type']> = new Set(['moveUnit', 'goTo', 'goToEurope', 'explore', 'setOrders', 'skipUnit', 'attack', 'pioneerWork', 'foundColony', 'joinColony', 'disbandUnit', 'enterSettlement']);
  const record = (text: string, hint = false): void => {
    if (!text) return;
    log.push(hint ? `${HINT_MARK}${text}` : text);
    if (log.length > LOG_KEPT) log.splice(0, log.length - LOG_KEPT);
    logList.replaceChildren(...log.map((line) => {
      const item = document.createElement('li');
      // advice is set apart from news
      if (line.startsWith(HINT_MARK)) item.className = 'hint';
      item.textContent = line.startsWith(HINT_MARK) ? line.slice(HINT_MARK.length) : line;
      return item;
    }));
    logList.scrollTop = logList.scrollHeight;
  };

  /** Advice for the moment, once each per game, if the player wants it. It goes in the log, not in the way. */
  const hintsSeen = readHintsSeen(session.state.seed);
  const offerHint = (context: HintContext): void => {
    if (!options.tutorialHints || session.state.over || session.state.players[session.state.current]?.id !== me()) return;
    const hint = nextHint(session.state, me(), context, hintsSeen);
    if (!hint) return;
    hintsSeen.add(hint.id);
    writeHintsSeen(session.state.seed, hintsSeen);
    record(`Adviser: ${hint.text}`, true);
  };
  const flash = (text: string, won: boolean): void => {
    const banner = document.createElement('div');
    banner.className = `combat-flash ${won ? 'combat-won' : 'combat-lost'}`;
    banner.dataset['field'] = 'combat-result';
    banner.textContent = text;
    screen.append(banner);
    setTimeout(() => banner.remove(), 1600);
  };
  /** Whether to show the analysis before attacking (a Game Option; on unless switched off). */
  const wantsAnalysis = (): boolean => options.combatAnalysis;
  const unitName = (id: string | null, before: GameState): string => {
    const u = id ? before.units[id] : undefined;
    if (!u) return 'the defenders';
    const tribe = tribeOfOwner(u.owner);
    const whose = u.owner === me() ? 'Our' : tribe ? TRIBES[tribe].adjective : NATIONS[before.players.find((p) => p.id === u.owner)?.nation ?? 'england'].adjective;
    return `${whose} ${UNIT_TYPES[u.type].name}`;
  };
  /** A sentence for the log about one fight, whoever fought it. */
  const battleLine = (events: readonly GameEvent[], before: GameState): string => {
    const battle = events.find((e) => e.type === 'battle');
    if (!battle || battle.type !== 'battle') return events.some((e) => e.type === 'shipEvaded') ? 'A ship we chased outran us.' : '';
    const place = colonyAt(before, battle.x, battle.y)?.name ?? (settlementAt(before, battle.x, battle.y) ? 'a native settlement' : `(${battle.x}, ${battle.y})`);
    const attacker = unitName(battle.attackerId, before);
    const defender = battle.defenderId ? unitName(battle.defenderId, before) : 'the defenders';
    return `${attacker} attacked ${defender} at ${place} and ${battle.attackerWon ? 'won' : 'lost'}.`;
  };

  /** Order an attack on the neighbouring square, after showing what the odds are. */
  const orderAttack = async (unitId: UnitId, dx: number, dy: number): Promise<void> => {
    const action = { type: 'attack', unitId, dx, dy } as const;
    const unit = session.state.units[unitId];
    if (!unit || !validateAction(session.state, action).ok) return;
    const analysis = analyseAttack(session.state, unit, dx, dy);
    const tired = unit.movesLeft < 3 ? 'Our men are tired and will fight below their strength.' : '';
    const go = analysis && wantsAnalysis()
      ? await askCombat(screen, analysis, tired)
      : (await ask(screen, { text: `Shall we attack? ${tired}`.trim(), choices: ['Hold', 'Attack'], escape: 0 })) === 1;
    if (!go) return;
    const before = session.state;
    const events = stepSession(session, action).events;
    if (!dispatch(action)) return;
    const battle = events.find((e) => e.type === 'battle');
    const taken = events.find((e) => e.type === 'colonyCaptured');
    const report = taken && taken.type === 'colonyCaptured' ? `${taken.name} is ours!${taken.plunder > 0 ? ` We seized ${taken.plunder} gold.` : ''}` : battleReport(events);
    say(report);
    record(battleLine(events, before));
    if (battle && battle.type === 'battle') flash(battle.attackerWon ? 'Victory' : 'Defeat', battle.attackerWon);
  };

  /** Receive every envoy waiting, and see each audience through. */
  const audiences = async (): Promise<void> => {
    const mine = (): (typeof session.state.players)[number] | undefined => session.state.players.find((p) => p.id === me());
    // the menu's answer when it was given along with the treaty: the question is not put twice
    let chosen: number | null = null;
    // what the talk has brought about, said once the next answer has gone in (sending one clears the notice)
    const held: string[] = [];
    const tell = (text: string): void => {
      held.push(text);
    };
    const flush = (): void => {
      if (held.length === 0) return;
      say(held.join(' '));
      held.length = 0;
    };
    for (let guard = 0; guard < 40; guard++) {
      const talk = session.state.audience;
      if (!talk) {
        chosen = null;
        const envoy = mine()?.audiencesDue[0];
        if (envoy === undefined || !dispatch({ type: 'holdAudience', with: envoy })) return;
        continue;
      }
      const them = NATIONS[session.state.players.find((p) => p.id === talk.ai)?.nation ?? 'england'];
      const tone = talk.hostile ? `The ${them.adjective} envoy is curt.` : `The ${them.adjective} envoy is courteous.`;
      let action: Action;
      if (talk.stage === 'menu') {
        const others = session.state.players.filter((p) => p.id !== talk.ai && p.id !== talk.human && !p.withdrawn);
        const pick = chosen ?? await ask(screen, {
          text: `${tone} There is peace between us. What have we to say?`,
          choices: ['Go in peace', 'Pull your forces back from our colonies', 'What are your lives worth to you?', 'Join us against an enemy'], escape: 0,
        });
        chosen = null;
        if (pick === 3) {
          const names = [...others.map((p) => `Against the ${NATIONS[p.nation].adjective} (${alliancePrice(session.state, talk.human, p.id)} gold)`), 'Never mind'];
          const who = await ask(screen, { text: 'Against whom shall they take up arms?', choices: names, escape: names.length - 1 });
          const target = others[who]?.id;
          action = target === undefined ? { type: 'audienceReply', reply: 'goInPeace' } : { type: 'audienceReply', reply: 'alliance', target };
        } else action = { type: 'audienceReply', reply: (['goInPeace', 'withdraw', 'valueLives'] as const)[pick] ?? 'goInPeace' };
      } else if (talk.stage === 'worthy') {
        // a treaty is proposed: agreeing opens the menu, so its answers are offered here and the menu is not put as a second question
        const pick = await ask(screen, {
          text: `${tone} They propose a treaty of peace between our peoples.`,
          choices: ['Agree, and go in peace', 'Agree, and ask them to pull their forces back from our colonies', 'Agree, and ask what their lives are worth to them', 'Agree, and ask them to join us against an enemy', 'Refuse'],
          escape: 4,
        });
        chosen = pick === 4 ? null : pick;
        action = { type: 'audienceReply', reply: chosen === null ? 'no' : 'yes' };
      } else if (talk.stage === 'withdraw') {
        const pick = await ask(screen, { text: `They will withdraw for ${talk.gold} gold.`, choices: [`Pay ${talk.gold} gold`, 'Threaten them', 'Let it be'], escape: 2 });
        action = { type: 'audienceReply', reply: (['pay', 'threaten', 'no'] as const)[pick] ?? 'no' };
      } else {
        const text = {
          piracy: `${tone} They complain that our privateers prey on their shipping, and ask that we call them home.`,
          sieges: `${tone} They object to our soldiers at the gates of their colonies, and ask that we withdraw them.`,
          tribute: `${tone} They demand ${talk.gold} gold as the price of peace.`,
          cash: `Rather than fight, they offer ${talk.gold} gold for peace.`,
        }[talk.stage];
        const pick = await ask(screen, { text, choices: ['Agree', 'Refuse'], escape: 1 });
        action = { type: 'audienceReply', reply: pick === 0 ? 'yes' : 'no' };
      }
      const check = validateAction(session.state, action);
      if (!check.ok) {
        say(check.error.message);
        chosen = null;
        action = { type: 'audienceReply', reply: talk.stage === 'menu' ? 'goInPeace' : 'no' };
      }
      const events = stepSession(session, action).events;
      if (!dispatch(action)) return;
      for (const e of events) {
        if (e.type === 'warDeclared') await ask(screen, { text: `The ${NATIONS[session.state.players.find((p) => p.id === e.by)?.nation ?? 'england'].adjective} have declared war!`, choices: ['Continue'], escape: 0 });
        if (e.type === 'treatySigned') tell('A treaty of peace is signed.');
        if (e.type === 'forcesWithdrawn') tell(e.player === me() ? 'Our forces have been called home to Europe.' : 'They have withdrawn their forces.');
        if (e.type === 'goldPaid' && e.to === me()) tell(`They have paid us ${e.amount} gold.`);
      }
      if (chosen === null) flush();
    }
  };

  /** The advisers' reports, by function key. */
  const REPORTS: Readonly<Record<string, () => Report | string>> = {
    F3: () => congressReport(session.state, me()),
    F1: () => terrainReport(),
    F2: () => religiousReport(session.state, me()),
    F4: () => laborReport(session.state, me()),
    F5: () => economicReport(session.state, me()),
    F6: () => colonyReport(session.state, me()),
    F7: () => navalReport(session.state, me()),
    F9: () => indianReport(session.state, me()),
    F10: () => scoreReport(session.state, me()),
    F8: () => foreignAffairsReport(session.state, me()) ?? 'The Foreign Affairs adviser makes no report while the War of Independence is being fought.',
  };

  /** One line on how a fight went, from our side. */
  const battleReport = (events: readonly GameEvent[]): string => {
    if (events.some((e) => e.type === 'shipEvaded')) return 'They crowded on sail and outran us.';
    const battle = events.find((e) => e.type === 'battle');
    if (!battle || battle.type !== 'battle') return '';
    const prizes = events.filter((e) => e.type === 'cargoCaptured').length;
    const sunk = events.some((e) => e.type === 'shipSunk');
    const ours = session.state.units[battle.attackerId]?.owner === me() || events.some((e) => e.type === 'unitLost' && e.unitId === battle.attackerId && e.owner === me());
    const won = battle.attackerWon === ours;
    const destroyed = events.find((e) => e.type === 'settlementDestroyed');
    if (destroyed && destroyed.type === 'settlementDestroyed') {
      return destroyed.treasure > 0 ? `The settlement is destroyed. Among the ruins: treasure worth ${destroyed.treasure} gold.` : 'The settlement is destroyed. Nothing of value was found.';
    }
    const promoted = events.some((e) => e.type === 'unitPromoted') ? ' Our men are promoted for valor.' : '';
    const sea = sunk ? ' A ship has gone down.' : '';
    const loot = prizes > 0 && won ? ` We took ${prizes} ${prizes === 1 ? 'hold' : 'holds'} of cargo.` : '';
    return won ? `Victory!${promoted}${sea}${loot}` : `We are beaten.${sea}`;
  };

  /** A tribe just met proposes a treaty; put the question once per tribe. */
  const greetTribes = async (): Promise<void> => {
    for (const tribe of session.state.players.find((p) => p.id === me())?.pendingTreaties ?? []) {
      const count = Object.values(session.state.settlements).filter((v) => v.tribe === tribe).length;
      const level = TECH_LEVELS[TRIBES[tribe].tech];
      const pick = await ask(screen, {
        text: `We have met the ${TRIBES[tribe].name}, a ${level.name.toLowerCase()} people of ${count} ${count === 1 ? level.settlement.toLowerCase() : level.plural.toLowerCase()}. They offer to live in peace beside us.`,
        choices: ['Accept their friendship', 'Refuse'], escape: 0,
      });
      if (validateAction(session.state, { type: 'answerTreaty', tribe, accept: pick === 0 }).ok) dispatch({ type: 'answerTreaty', tribe, accept: pick === 0 });
    }
  };

  const MOOD_TEXT = { happy: 'The people here greet us warmly.', wary: 'The people here watch us warily.', sullen: 'The people here are sullen and unfriendly.', war: 'The people here are openly hostile.' } as const;

  /** The unit has been sent against a native settlement: say how it is received and ask what it should do. */
  const visitSettlement = async (unitId: UnitId, dx: number, dy: number): Promise<void> => {
    const unit = session.state.units[unitId];
    const village = unit ? settlementAt(session.state, unit.x + dx, unit.y + dy) : null;
    if (!unit || !village) return;
    const tribe = TRIBES[village.tribe];
    const place = `${tribe.adjective} ${village.capital ? CAPITAL_NAME.settlement.toLowerCase() : TECH_LEVELS[tribe.tech].settlement.toLowerCase()}`;
    const options = villageActions(session.state, unit, village);
    if (options.length === 0) {
      const refused = UNIT_TYPES[unit.type].domain === 'sea' ? shipRefusal(session.state, village, unit.owner) : null;
      say(refused && !refused.ok ? refused.message : `There is nothing this unit can do at the ${place}.`);
      return;
    }
    const labels = [...options.map((o) => VILLAGE_ACTION_NAMES[o]), 'Cancel Action'];
    const pick = await ask(screen, { text: `${place.charAt(0).toUpperCase()}${place.slice(1)} (${village.population}). ${MOOD_TEXT[settlementMood(session.state, village, unit.owner)]}`, choices: labels, escape: labels.length - 1 });
    const chosen = options[pick];
    if (!chosen) return;
    if (chosen === 'attack') {
      await orderAttack(unitId, dx, dy);
      return;
    }
    let target: string | undefined;
    if (chosen === 'incite') {
      // name the power, and hear the price
      const rivals = session.state.players.filter((p) => p.id !== unit.owner && !p.withdrawn);
      const price = incitePrice(session.state, unit, village);
      const names = [...rivals.map((p) => `Against the ${NATIONS[p.nation].adjective}`), 'Never mind'];
      const who = await ask(screen, { text: `For ${price} gold they will take up arms. Against whom?`, choices: names, escape: names.length - 1 });
      target = rivals[who]?.id;
      if (target === undefined) return;
    }
    let good: GoodId | undefined;
    if (chosen === 'trade' || chosen === 'enterHostile') {
      const aboard = GOOD_IDS.filter((g) => (unit.cargo[g] ?? 0) > 0);
      if (aboard.length > 0) {
        const names = [...aboard.map((g) => `${GOOD_NAMES[g]} (${Math.min(100, unit.cargo[g] ?? 0)})`), 'Never mind'];
        const which = await ask(screen, { text: 'Which cargo shall we offer them?', choices: names, escape: names.length - 1 });
        good = aboard[which];
        if (good === undefined) return;
      }
    }
    const action = { type: 'enterSettlement', unitId, settlementId: village.id, action: chosen, ...(target === undefined ? {} : { target }), ...(good === undefined ? {} : { good }) } as const;
    const check = validateAction(session.state, action);
    if (!check.ok) {
      say(check.error.message);
      return;
    }
    const before = session;
    if (!dispatch(action)) return;
    const events = stepSession(before, action).events;
    for (const e of events) {
      if (e.type === 'chiefSpoke') {
        await ask(screen, { text: chiefSpokeText(e), choices: ['Continue'], escape: 0 });
      } else if (e.type === 'battle') {
        await ask(screen, { text: battleReport(events), choices: ['Continue'], escape: 0 });
      } else if (e.type === 'hostileEntry' && e.outcome !== 'admitted') {
        await ask(screen, { text: e.outcome === 'destroyed' ? 'They fell upon our people; the cargo and all with it are lost.' : 'They drove us off before we could unpack.', choices: ['Continue'], escape: 0 });
      } else if (e.type === 'nativesWant') {
        await ask(screen, { text: e.wants.length ? `We have nothing to offer. They would trade for ${e.wants.map((g) => GOOD_NAMES[g]).join(', ')}.` : 'We have nothing to offer, and they want for nothing.', choices: ['Continue'], escape: 0 });
      } else if (e.type === 'nativesTaught') {
        const result = {
          taught: `After a season among them our colonist is a ${PROFESSIONS[e.skill].name}.`,
          angry: 'They are in no mood to teach us anything.',
          criminal: 'They will have nothing to do with such a rogue.',
          master: 'They honor one so skilled, and say they have nothing to teach him.',
          already: 'They have already taught one of ours all they know.',
          slow: 'They are wary of us and the lessons came to nothing. We may try again.',
        }[e.outcome];
        await ask(screen, { text: result, choices: ['Continue'], escape: 0 });
      } else if (e.type === 'missionFounded') {
        await ask(screen, { text: e.alarm < 0 ? 'The mission is founded, and the people welcome it.' : 'The mission is founded, though the people grumble at so many.', choices: ['Continue'], escape: 0 });
      } else if (e.type === 'heresyDenounced') {
        await ask(screen, { text: e.success ? 'The council has heard us: the rival mission is cast out and ours stands in its place.' : 'The council would not hear us, and our missionary is lost.', choices: ['Continue'], escape: 0 });
      } else if (e.type === 'tribeIncited') {
        await ask(screen, { text: `For ${e.price} gold the ${TRIBES[e.tribe].name} have taken up the hatchet.`, choices: ['Continue'], escape: 0 });
      } else if (e.type === 'tributeDemanded') {
        const result = {
          laughed: 'They laughed at our demand.',
          refused: 'They refused to pay.',
          poor: 'They say they have nothing left to give.',
          paid: `They sent ${e.amount} ${e.good ? GOOD_NAMES[e.good] : ''} to ${e.colonyId ? (session.state.colonies[e.colonyId]?.name ?? 'our colony') : 'our colony'}.`,
        }[e.outcome];
        await ask(screen, { text: result, choices: ['Continue'], escape: 0 });
      }
    }
    await bargain();
    settle();
  };

  /** Carry trade talks through: their price for our cargo, then what they will sell us. */
  const bargain = async (): Promise<void> => {
    const reply = (action: Action): readonly GameEvent[] => {
      if (!validateAction(session.state, action).ok) return [];
      const events = stepSession(session, action).events;
      dispatch(action);
      return events;
    };
    for (let guard = 0; guard < 12 && session.state.parley; guard++) {
      const parley = session.state.parley;
      if (parley.stage === 'selling') {
        const choices = ['Accept', 'Ask for more', ...(parley.haggled ? [] : ['Give it as a gift']), 'Walk away'];
        const pick = await ask(screen, { text: `For our ${parley.amount} ${GOOD_NAMES[parley.good]} they offer ${parley.price} gold.`, choices, escape: choices.length - 1 });
        const replies: ParleyReply[] = parley.haggled ? ['accept', 'haggle', 'leave'] : ['accept', 'haggle', 'gift', 'leave'];
        const answer = replies[pick] ?? 'leave';
        const events = reply({ type: 'parley', reply: answer });
        if (events.some((e) => e.type === 'nativeHaggle' && !e.success)) await ask(screen, { text: 'They are insulted and will hear no more of it.', choices: ['Continue'], escape: 0 });
        if (events.some((e) => e.type === 'nativeSale' && e.gift)) say('They accept our gift with thanks.');
      } else {
        const labels = [...parley.offers.flatMap((o) => [`Buy ${parley.amount} ${GOOD_NAMES[o.good]} for ${o.price} gold`, `Haggle over the ${GOOD_NAMES[o.good]}`]), 'Nothing, thank you'];
        const pick = await ask(screen, { text: 'They have goods of their own to sell.', choices: labels, escape: labels.length - 1 });
        const offer = parley.offers[Math.floor(pick / 2)];
        if (!offer) {
          reply({ type: 'parley', reply: 'leave' });
          break;
        }
        const action: Action = { type: 'parley', reply: pick % 2 === 0 ? 'accept' : 'haggle', good: offer.good };
        const check = validateAction(session.state, action);
        if (!check.ok) {
          say(check.error.message);
          continue;
        }
        const events = reply(action);
        if (events.some((e) => e.type === 'nativeHaggle' && !e.success)) await ask(screen, { text: 'They put their goods away and will sell us nothing.', choices: ['Continue'], escape: 0 });
      }
    }
  };

  /** A treasure train that has just entered one of our colonies: the Crown (or, after the Declaration, agents) may cash it. */
  /** Put the question for each treasure in turn; then, if a unit's orders brought them, end the turn if that was all. */
  const offerTreasures = async (unitIds: readonly UnitId[], byOrders: boolean): Promise<void> => {
    for (const id of unitIds) await offerTreasure(id);
    if (byOrders) endTurnIfDone();
  };

  const offerTreasure = async (unitId: UnitId): Promise<void> => {
    const unit = session.state.units[unitId];
    const player = session.state.players.find((p) => p.id === me());
    if (!unit || !player || unit.type !== 'treasure' || !checkCashTreasure(session.state, player.id, unitId).ok) return;
    const quote = treasureQuote(session.state, unit);
    if (!quote) return;
    const crown = quote.carrier === 'crown';
    const text = crown
      ? `The Crown will carry this treasure of ${quote.value} gold home to ${NATIONS[player.nation].homePort}. The King keeps ${quote.fee} gold (${royalTransportCut(session.state, player.id)} percent) for his trouble; we receive ${quote.net}.`
      : `Agents will buy this treasure for ${quote.value} gold.`;
    const pick = await ask(screen, { text, choices: ['Decline', 'Accept'], escape: 0, ...(crown ? { picture: portraitCanvas('king', 2) } : {}) });
    if (pick !== 1 || !dispatch({ type: 'cashTreasure', unitId })) return;
    colonyScreen?.refresh();
    await ask(screen, { text: `The treasure is ours: ${quote.net} gold has been added to the treasury.`, choices: ['Continue'], escape: 0 });
    settle();
  };

  /** One step for a unit, putting the question to the player when the move raises one. */
  const tryMove = async (unitId: UnitId, dx: number, dy: number): Promise<void> => {
    const move = { type: 'moveUnit', unitId, dx, dy } as const;
    const check = validateAction(session.state, move);
    if (!check.ok && check.error.code === 'settlement') {
      await visitSettlement(unitId, dx, dy);
      return;
    }
    const assault = { type: 'attack', unitId, dx, dy } as const;
    const stranger = session.state.units[unitId];
    const theirTown = stranger ? colonyAt(session.state, stranger.x + dx, stranger.y + dy) : null;
    if (!check.ok && stranger && theirTown && theirTown.owner !== stranger.owner && UNIT_TYPES[stranger.type].holds > 0) {
      // a ship or wagon train at a foreign colony: sell them a cargo, if their laws and ours allow
      const lots = GOOD_IDS.filter((g) => (stranger.cargo[g] ?? 0) > 0);
      const sellable = lots.filter((g) => validateAction(session.state, { type: 'sellAbroad', unitId, colonyId: theirTown.id, good: g }).ok);
      if (sellable.length === 0) {
        const why = lots[0] ? validateAction(session.state, { type: 'sellAbroad', unitId, colonyId: theirTown.id, good: lots[0] }) : null;
        say(why && !why.ok ? why.error.message : 'We have nothing aboard to offer them.');
        return;
      }
      const labels = [...sellable.map((g) => `Sell ${Math.min(100, stranger.cargo[g] ?? 0)} ${GOOD_NAMES[g]}`), 'Nothing'];
      const pick = await ask(screen, { text: `${theirTown.name} will trade with us.`, choices: labels, escape: labels.length - 1 });
      const good = sellable[pick];
      if (good) {
        const sale = { type: 'sellAbroad', unitId, colonyId: theirTown.id, good } as const;
        const sold = stepSession(session, sale).events.find((e) => e.type === 'soldAbroad');
        if (dispatch(sale) && sold && sold.type === 'soldAbroad') say(`Sold ${sold.amount} ${GOOD_NAMES[good]} for ${sold.gold} gold.`);
      }
      return;
    }
    if (!check.ok && stranger && theirTown && theirTown.owner !== stranger.owner && (stranger.type === 'scout' || validateAction(session.state, assault).ok)) {
      // at the gates of a foreign colony: a scout may slip in; fighting units may storm it
      const sneak = { type: 'infiltrateColony', unitId, dx, dy } as const;
      const options: { label: string; run: () => void }[] = [];
      if (validateAction(session.state, sneak).ok) {
        options.push({ label: 'Infiltrate the colony', run: () => {
          const caught = stepSession(session, sneak).events.some((e) => e.type === 'colonyInfiltrated' && e.caught);
          if (!dispatch(sneak)) return;
          if (caught) say('Our scout was seized as a spy.');
          else openColony(theirTown.id);
        } });
      }
      const parley = { type: 'meetMayor', unitId, dx, dy } as const;
      if (validateAction(session.state, parley).ok) options.push({ label: 'Meet with the mayor', run: () => { if (dispatch(parley)) void audiences(); } });
      if (validateAction(session.state, assault).ok) {
        options.push({ label: 'Attack the colony', run: () => void orderAttack(unitId, dx, dy) });
      }
      const labels = [...options.map((o) => o.label), 'Do nothing'];
      const pick = await ask(screen, { text: `${theirTown.name}, a colony of the ${NATIONS[session.state.players.find((p) => p.id === theirTown.owner)?.nation ?? 'england'].adjective}.`, choices: labels, escape: labels.length - 1 });
      options[pick]?.run();
      return;
    }
    if (!check.ok && check.error.code === 'occupied' && validateAction(session.state, assault).ok) {
      await orderAttack(unitId, dx, dy);
      return;
    }
    if (check.ok || (check.error.code !== 'needsSailChoice' && check.error.code !== 'needsLandfall')) {
      dispatch(move);
      followUnit();
      return;
    }
    if (check.error.code === 'needsSailChoice') {
      const answer = await ask(screen, {
        text: 'The open ocean lies ahead. Shall we set course for Europe?',
        choices: ['Yes, make for Europe', 'No, stay in these waters'],
        escape: 1,
      });
      if (validateAction(session.state, { ...move, sail: answer === 0 }).ok) dispatch({ ...move, sail: answer === 0 });
      followUnit();
    } else {
      const answer = await ask(screen, {
        text: 'Shall the passengers go ashore here and leave the ship behind?',
        choices: ['Stay aboard', 'Make landfall'],
        escape: 0,
      });
      if (answer === 1 && dispatch({ ...move, landfall: true })) {
        // the first passenger woken becomes the active unit, ready to be marched ashore
        const woken = Object.values(session.state.units).find((u) => u.aboard === unitId && needsOrders(u, me()));
        if (woken) activeId = woken.id;
        dirty = true;
      }
    }
  };

  // --- the colony screen -------------------------------------------------------------------
  let colonyScreen: { element: HTMLElement; refresh(): void; chooseProject(): Promise<void> } | null = null;
  const closeColony = (): void => {
    colonyScreen?.element.remove();
    colonyScreen = null;
    canvas.dataset['colony'] = '';
    settle();
    dirty = true;
    canvas.focus();
    void visitFinished();
  };
  /** Colonies that finished a building or a unit this turn, still to be taken to for their next project. */
  const finished: string[] = [];
  /** Takes the player to the next colony whose project is finished, on the question of what to build now. */
  const visitFinished = async (): Promise<void> => {
    if (colonyScreen || europeScreen || session.state.over || screen.querySelector('[role="dialog"]')) return;
    for (let next = finished.shift(); next !== undefined; next = finished.shift()) {
      if (session.state.colonies[next]?.owner !== me()) continue;
      openColony(next);
      const opened = colonyScreen as { chooseProject(): Promise<void> } | null;
      await opened?.chooseProject();
      return;
    }
  };
  const openColony = (colonyId: string): void => {
    if (colonyScreen || session.state.colonies[colonyId]?.owner !== me()) return;
    canvas.dataset['colony'] = colonyId;
    offerHint({ where: 'colony', colonyId });
    colonyScreen = openColonyScreen(screen, colonyId, {
      state: () => session.state,
      dispatch,
      refusal: (action) => {
        const check = validateAction(session.state, action);
        return check.ok ? null : check.error.message;
      },
      player: me,
      close: closeColony,
    });
  };

  // --- the Europe screen -------------------------------------------------------------------
  let europeScreen: { element: HTMLElement; refresh(): void } | null = null;
  const closeEurope = (): void => {
    europeScreen?.element.remove();
    europeScreen = null;
    canvas.dataset['europe'] = '';
    settle();
    dirty = true;
    canvas.focus();
  };
  const openEurope = (): void => {
    if (europeScreen || colonyScreen) return;
    canvas.dataset['europe'] = 'open';
    offerHint({ where: 'europe' });
    europeScreen = openEuropeScreen(screen, {
      state: () => session.state,
      player: me,
      dispatch: (action) => {
        const check = validateAction(session.state, action);
        if (!check.ok) return null;
        const stepped = stepSession(session, action);
        session = stepped.session;
        save();
        dirty = true;
        return stepped.events;
      },
      refusal: (action) => {
        const check = validateAction(session.state, action);
        return check.ok ? null : check.error.message;
      },
      close: closeEurope,
    });
  };

  const setCursorToCenter = (): void => {
    // where the player was last looking: the piece last given orders if it is still in view, else the middle
    const c = viewCenter(view);
    cursor = lastSpot && isTileInView(view, lastSpot.x, lastSpot.y, 0) ? { ...lastSpot } : { x: Math.round(c.x), y: Math.round(c.y) };
    dirty = true;
  };

  const confirmGoto = (x: number, y: number): void => {
    const unit = activeUnit();
    mode = 'move';
    cursor = null;
    if (unit) dispatch({ type: 'goTo', unitId: unit.id, x, y });
    dirty = true;
  };

  const WARNING_TEXT = {
    noPort: 'This square has no access to the ocean, so no ship will ever call here. Build here anyway?',
    noForest: 'No forest borders this square, so lumber will be hard to come by. Build here anyway?',
    fewSpaces: 'Little of the land around this square can be worked, so a colony here will grow slowly. Build here anyway?',
  } as const;

  /** B: join the colony the unit stands in, or found one here after any warnings and a name. */
  const settleDown = async (unit: Unit): Promise<void> => {
    if (colonyAt(session.state, unit.x, unit.y)) {
      dispatch({ type: 'joinColony', unitId: unit.id });
      return;
    }
    const check = checkFound(session.state, unit);
    if (!check.ok) {
      say(check.message);
      return;
    }
    for (const warning of siteWarnings(session.state, unit.x, unit.y, unit.owner)) {
      const answer = await ask(screen, { text: WARNING_TEXT[warning], choices: ['Cancel', 'Build the colony'], escape: 0 });
      if (answer !== 1) return;
    }
    const name = await askText(screen, { text: 'Name of the new colony:', initial: nextColonyName(session.state, unit.owner) });
    if (name !== null && dispatch({ type: 'foundColony', unitId: unit.id, name })) {
      // a new colony opens straight away, as its first order of business is choosing work
      const founded = colonyAt(session.state, unit.x, unit.y);
      if (founded) openColony(founded.id);
    }
  };

  /** The Trade menu: create, edit or delete a trade route. */
  const tradeMenu = async (): Promise<void> => {
    const colonies = coloniesOf(session.state, me()).map((c) => ({ id: c.id, name: c.name }));
    const routes = routesOf(session.state, me());
    const pick = await ask(screen, { text: 'Trade', choices: ['Create Trade Route', 'Edit Trade Route', 'Delete Trade Route', 'Cancel'], escape: 3 });
    if (pick === 0) {
      if (colonies.length === 0) {
        say('A trade route needs a colony to call at.');
        return;
      }
      const start = await ask(screen, { text: 'Where does the route start?', choices: [...colonies.map((c) => c.name), 'Cancel'], escape: colonies.length });
      const first = colonies[start];
      if (!first) return;
      const kind = await ask(screen, { text: 'Is this a sea route or a land route?', choices: ['Sea route', 'Land route', 'Cancel'], escape: 2 });
      if (kind > 1) return;
      const stops = [{ colonyId: first.id, unload: [], load: [] }];
      const draft = await editRoute(screen, { title: 'New Trade Route', name: defaultRouteName(session.state, me(), stops), colonies, stops });
      if (draft) dispatch({ type: 'createTradeRoute', kind: kind === 0 ? 'sea' : 'land', stops: draft.stops, name: draft.name });
    } else if (pick === 1 || pick === 2) {
      if (routes.length === 0) {
        say('No trade routes are defined.');
        return;
      }
      const which = await ask(screen, { text: pick === 1 ? 'Edit which route?' : 'Delete which route?', choices: [...routes.map((r) => r.name), 'Cancel'], escape: routes.length });
      const route = routes[which];
      if (!route) return;
      if (pick === 2) {
        dispatch({ type: 'deleteTradeRoute', routeId: route.id });
        return;
      }
      const draft = await editRoute(screen, { title: 'Edit Trade Route', name: route.name, colonies, stops: route.stops });
      if (draft) dispatch({ type: 'editTradeRoute', routeId: route.id, stops: draft.stops, name: draft.name });
    }
  };

  const runCommand = async (command: MapCommand, key: string): Promise<void> => {
    const unit = activeUnit();
    if (session.state.over) {
      // a game that is over takes no orders, and says nothing about the ones it is given: Enter and Esc bring the end page back
      if (notice) say('');
      if (command === 'endTurn' || command === 'cancel') {
        showEnd();
        return;
      }
      if (!OVER_COMMANDS.has(command) || (command === 'menu' && ORDER_MENUS.has(key))) return;
    }
    switch (command) {
      case 'zoomIn':
      case 'zoomOut':
        setView(zoomBy(view, session.state.map, command === 'zoomIn' ? 1 : -1));
        return;
      case 'center':
        if (unit && unit.x >= 0) setView(centerOn(view, session.state.map, unit.x, unit.y));
        return;
      case 'hiddenTerrain':
        // from the command bar (the H key is handled as it is pressed): on until pressed again, or until the next key
        setView({ ...view, showHidden: !view.showHidden });
        return;
      case 'viewMode':
        mode = 'view';
        setCursorToCenter();
        return;
      case 'moveMode':
      case 'cancel':
        mode = 'move';
        cursor = null;
        dirty = true;
        return;
      case 'europe':
        openEurope();
        return;
      case 'endTurn': {
        // Enter confirms a Go To, opens the colony under the view cursor, or else ends the turn.
        const under = mode === 'view' && cursor ? colonyAt(session.state, cursor.x, cursor.y) : null;
        if (mode === 'goto' && cursor) confirmGoto(cursor.x, cursor.y);
        else if (under && under.owner === me()) openColony(under.id);
        else dispatch({ type: 'endTurn' });
        return;
      }
      case 'activate': {
        // In view mode, wake whatever of ours stands under the cursor; otherwise the active unit.
        const at = mode === 'view' && cursor ? cursor : unit ? { x: unit.x, y: unit.y } : null;
        const target = at
          ? Object.values(session.state.units).find((u) => u.owner === me() && u.x === at.x && u.y === at.y && u.orders !== 'none' && u.aboard === null)
          : undefined;
        if (target && dispatch({ type: 'setOrders', unitId: target.id, orders: 'none' })) {
          activeId = target.id;
          mode = 'move';
          cursor = null;
        }
        return;
      }
      case 'menu':
        if (key === 't') await tradeMenu();
        else if (key === 'p') await showPedia(screen);
        else if (key === 'l') await saveLoadMenu();
        else if (key === 'g') await showOptions(screen, 'Game Options', GAME_OPTIONS, options, applyOptions);
        else if (key === 'o') await showOptions(screen, 'Colony Report Options', COLONY_OPTIONS, options, applyOptions);
        else if (key === 's') await showOptions(screen, 'Sound Options', SOUND_OPTIONS, options, applyOptions);
        else if (key === 'c') {
          await showCheatConsole(screen, {
            state: () => session.state,
            context: () => {
              const active = activeUnit();
              return { player: me(), active: active?.id ?? null, here: active && active.x >= 0 ? { x: active.x, y: active.y } : null };
            },
            run: runCheat,
          });
        } else say('There is no such menu. Alt+T is Trade, Alt+G the game options, Alt+O the colony report options, Alt+S sound, Alt+L save and load, Alt+P the encyclopedia, Alt+C the cheats.');
        canvas.focus();
        return;
      case 'retire': {
        const answer = await ask(screen, { text: 'Retire as Viceroy now? The game will be scored as it stands and will end.', choices: ['No, carry on', 'Yes, retire'], escape: 0 });
        if (answer === 1) dispatch({ type: 'retire' });
        return;
      }
      case 'declare': {
        const check = validateAction(session.state, { type: 'declareIndependence' });
        if (!check.ok) {
          say(check.error.code === 'tooTory' ? `We cannot declare yet: ${check.error.message}.` : 'Independence has already been declared.');
          return;
        }
        const answer = await ask(screen, { text: 'Declare independence from the Crown? There is no going back: Europe will be closed to us, and the King will send his army.', choices: ['Not yet', 'Yes, declare independence'], escape: 0, picture: portraitCanvas('king', 2) });
        if (answer === 1) dispatch({ type: 'declareIndependence' });
        return;
      }
      case 'report': {
        const build = REPORTS[key];
        if (!build) say('That report is not available yet.');
        else {
          const report = build();
          if (typeof report === 'string') {
            say(report);
            return;
          }
          canvas.dataset['report'] = key;
          const spot = await showReport(screen, report);
          canvas.dataset['report'] = '';
          // a row that was picked: show that place
          if (spot) setView(centerOn(view, session.state.map, spot[0], spot[1]));
          canvas.focus();
        }
        return;
      }
      default:
        break;
    }
    if (!unit) {
      say('No unit is waiting for orders. Press Enter to end the turn.');
      return;
    }
    switch (command) {
      case 'wait':
        waiting.add(unit.id);
        activeId = nextUnit(session.state, me(), unit.id, waiting)?.id ?? unit.id;
        followUnit();
        dirty = true;
        return;
      case 'skip':
        dispatch({ type: 'skipUnit', unitId: unit.id });
        return;
      case 'fortify':
      case 'sentry':
        dispatch({ type: 'setOrders', unitId: unit.id, orders: command });
        return;
      case 'explore':
        if (!mayExplore(unit)) say(`${unitLabel(unit)} cannot explore: only a scout or a ship can.`);
        else dispatch({ type: 'explore', unitId: unit.id });
        return;
      case 'plow':
      case 'road': {
        // clearing a forest or laying a road on the natives' land: they ask us to stop
        const tile = session.state.map.tiles[unit.y * session.state.map.width + unit.x];
        const work = { type: 'pioneerWork', unitId: unit.id, job: command } as const;
        if (validateAction(session.state, work).ok && landlord(session.state, unit.owner, unit.x, unit.y) && (command === 'road' || tile?.forest)) {
          const price = landPrice(session.state, unit.owner, unit.x, unit.y);
          const rich = (session.state.players.find((p) => p.id === unit.owner)?.gold ?? 0) >= price;
          const choices = ['Cancel the order', ...(rich ? [`Pay ${price} gold for the land`] : []), 'Carry on regardless'];
          const pick = await ask(screen, { text: `The natives ask us not to work their land. They would sell it for ${price} gold.`, choices, escape: 0 });
          if (pick === 0) return;
          if (rich && pick === 1) dispatch({ type: 'acquireLand', x: unit.x, y: unit.y, pay: true });
        }
        dispatch(work);
        return;
      }
      case 'buildColony':
        await settleDown(unit);
        return;
      case 'tradeRoute': {
        const routes = routesOf(session.state, me());
        if (routes.length === 0) {
          say('No trade routes are defined. Alt+T opens the Trade menu.');
          return;
        }
        const cancelled = routes.length;
        const pick = await ask(screen, { text: 'Begin which trade route?', choices: [...routes.map((r) => r.name), 'Cancel'], escape: cancelled });
        const route = routes[pick];
        if (route) dispatch({ type: 'assignTradeRoute', unitId: unit.id, routeId: route.id });
        return;
      }
      case 'goTo': {
        // Named destinations first (Europe for a ship that can reach the Sea Lane, then our colonies), with the map as the last choice.
        const colonies = coloniesOf(session.state, me());
        const europe = isShipUnit(unit) && laneFor(session.state, unit) !== null ? ['Europe'] : [];
        if (europe.length + colonies.length > 0) {
          const cancelled = europe.length + colonies.length + 1;
          const pick = await ask(screen, { text: 'Go to which place?', choices: [...europe, ...colonies.map((c) => c.name), 'Pick a square on the map'], escape: cancelled });
          if (pick === cancelled) return;
          if (pick < europe.length) {
            dispatch({ type: 'goToEurope', unitId: unit.id });
            return;
          }
          const colony = colonies[pick - europe.length];
          if (colony) {
            dispatch({ type: 'goTo', unitId: unit.id, x: colony.x, y: colony.y });
            return;
          }
        }
        mode = 'goto';
        cursor = { x: unit.x, y: unit.y };
        say('Go to where? Arrows or click, then Enter. Esc cancels.');
        return;
      }
      case 'load':
        dispatch({ type: 'loadMostValuable', unitId: unit.id });
        return;
      case 'unload':
      case 'dump': {
        const good = GOOD_IDS.find((g) => (unit.cargo[g] ?? 0) > 0);
        if (!good) {
          say('There is no cargo aboard.');
          return;
        }
        const amount = unit.cargo[good] ?? 0;
        if (command === 'unload') dispatch({ type: 'unloadCargo', unitId: unit.id, good, amount });
        else if (colonyAt(session.state, unit.x, unit.y)) say('Unload cargo in a colony rather than dumping it.');
        else dispatch({ type: 'dumpCargo', unitId: unit.id, good, amount });
        return;
      }
      case 'disband': {
        const answer = await ask(screen, { text: 'Disband this unit for good?', choices: ['No, keep it', 'Yes, disband'], escape: 0 });
        if (answer === 1) dispatch({ type: 'disbandUnit', unitId: unit.id });
        return;
      }
      default:
        return;
    }
  };

  canvas.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const command = mapCommandFor(event);
    // H shows the terrain under forests and pieces until the next key press.
    if (command === 'hiddenTerrain') {
      hideTip();
      setView({ ...view, showHidden: true });
      event.preventDefault();
      return;
    }
    if (view.showHidden) setView({ ...view, showHidden: false });

    // with Ctrl or Cmd held a direction key is the browser's, as every key but the zoom keys is
    const step = event.ctrlKey || event.metaKey ? undefined : (DIRECTIONS[event.code] ?? DIRECTIONS[event.key]);
    if (step) {
      event.preventDefault();
      hideTip(); // the view or the active unit may move under a resting pointer
      if (session.state.over) {
        // nothing is left to move: the arrows scroll the map
        setView(panBy(view, session.state.map, step[0], step[1]));
        return;
      }
      if (mode === 'move') {
        const unit = activeUnit();
        // a key held down past the end of one unit's moves does not carry on with the next one
        if (!event.repeat) heldFor.set(event.code, unit?.id ?? null);
        else if (unit === null || heldFor.get(event.code) !== unit.id) return;
        if (unit) void tryMove(unit.id, step[0], step[1]);
        else say('No unit is waiting for orders. Press Enter to end the turn.');
        return;
      }
      // view and goto modes move the cursor; the view follows it
      const from = cursor ?? { x: Math.round(viewCenter(view).x), y: Math.round(viewCenter(view).y) };
      const { map } = session.state;
      cursor = { x: Math.min(map.width - 1, Math.max(0, from.x + step[0])), y: Math.min(map.height - 1, Math.max(0, from.y + step[1])) };
      if (mode === 'view') setView(panBy(view, map, step[0], step[1]));
      else if (!isTileInView(view, cursor.x, cursor.y, 1)) setView(centerOn(view, map, cursor.x, cursor.y));
      dirty = true;
      return;
    }
    if (!command) return;
    event.preventDefault();
    hideTip();
    void runCommand(command, command === 'menu' ? event.code.replace('Key', '').toLowerCase() : key);
  });

  canvas.addEventListener('keyup', (event) => heldFor.delete(event.code));
  canvas.addEventListener('blur', () => heldFor.clear());

  const local = (event: MouseEvent, el: HTMLElement): { x: number; y: number } => {
    const box = el.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  /** Make one of our units the active one, asking which when the square holds several. Wakes it if it has orders. */
  const selectUnit = async (unitIds: readonly UnitId[]): Promise<void> => {
    let id = unitIds[0];
    if (unitIds.length > 1) {
      const labels = unitIds.map((u) => {
        const unit = session.state.units[u];
        return unit ? `${unitLabel(unit)}, moves ${formatMoves(unit.movesLeft)}` : u;
      });
      const pick = await ask(screen, { text: 'Which unit?', choices: [...labels, 'Cancel'], escape: unitIds.length });
      id = unitIds[pick];
    }
    const picked = id ? session.state.units[id] : undefined;
    if (!picked) return;
    if (picked.orders !== 'none' && !dispatch({ type: 'setOrders', unitId: picked.id, orders: 'none' })) return;
    const unit = session.state.units[picked.id];
    if (!unit || !needsOrders(unit, me())) {
      say(`${unitLabel(picked)} has no moves left this turn.`);
      return;
    }
    waiting.delete(unit.id);
    activeId = unit.id;
    mode = 'move';
    cursor = null;
    dirty = true;
  };

  /**
   * Put the destination marker on the square under the pointer: the Go To cursor while a destination
   * is being picked, the aim of a drag begun on the active unit. Called when the pointer moves and
   * when the view moves under it (edge-scroll, the wheel), so the marker is always the square a
   * click or a release would take.
   */
  const retarget = (): void => {
    if (!pointer) return;
    const tile = screenToTile(view, session.state.map, pointer.x, pointer.y);
    if (drag?.aim && drag.moved) {
      // the drag is dropped if its unit is no longer the one being ordered about
      const held = drag.unitId === activeId && mode === 'move' ? tile : null;
      if (held?.x !== aimAt?.x || held?.y !== aimAt?.y) {
        aimAt = held;
        aimJudged = null;
        judgeAim();
        dirty = true;
      }
    } else if (!drag && mode === 'goto' && tile && (tile.x !== cursor?.x || tile.y !== cursor.y)) {
      cursor = tile;
      dirty = true;
    }
  };

  /** Work out again whether letting go over the aimed square would be refused, if the square or the game has changed since. */
  const judgeAim = (): void => {
    if (aimJudged === session.state) return;
    const unit = activeUnit();
    aimBlocked = aimAt !== null && unit !== null && dragBlocked(session.state, unit, aimAt);
    aimJudged = session.state;
  };

  /** The active unit while a drag begun on it is under way, as the release would take it: its piece follows the pointer. */
  const draggedNow = (): Unit | null => {
    const unit = activeUnit();
    return drag?.aim && drag.moved && pointer && unit && unit.id === drag.unitId && mode === 'move' ? unit : null;
  };

  /** What a click at a canvas pixel would ask for, or null off the map. */
  const clickAt = (p: { x: number; y: number }): ReturnType<typeof mapClick> | null => {
    const tile = screenToTile(view, session.state.map, p.x, p.y);
    const at = { x: view.originX + p.x / view.tileSize, y: view.originY + p.y / view.tileSize };
    // on the map of a game that is over a click only shows the place
    if (session.state.over) return tile ? { kind: 'center', x: tile.x, y: tile.y } : null;
    return tile ? mapClick(session.state, me(), activeUnit(), mode, tile, at) : null;
  };

  /** The pointer's shape says what a click would do: an arrow the way the active unit would step, a hand on what would open. */
  const showPointer = (): void => {
    const click = pointer && !drag ? clickAt(pointer) : null;
    const shape = click ? mapCursor(click) : '';
    if (shape === shownPointer) return;
    shownPointer = shape;
    canvas.style.cursor = shape;
  };

  canvas.addEventListener('mousedown', (event) => {
    hideTip();
    if (event.button !== 0) return;
    const p = local(event, canvas);
    const tile = screenToTile(view, session.state.map, p.x, p.y);
    const unit = activeUnit();
    const aim = mode === 'move' && unit !== null && tile !== null && tile.x === unit.x && tile.y === unit.y;
    drag = { ...p, moved: false, aim, unitId: aim ? unit.id : null };
    canvas.focus();
  });
  canvas.addEventListener('mousemove', (event) => {
    const p = local(event, canvas);
    pointer = p;
    if (!drag) {
      retarget();
      showPointer();
      // a button held from a press that began elsewhere (or left the map and came back) is not a rest
      if (event.buttons === 0) hoverTip();
      else hideTip();
      return;
    }
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (drag.aim) {
      drag.moved = true;
      retarget();
      // the piece being dragged follows the pointer within a square too
      if (draggedNow()) dirty = true;
      return;
    }
    drag = { x: p.x, y: p.y, moved: true, aim: false, unitId: null };
    setView(panBy(view, session.state.map, -dx / view.tileSize, -dy / view.tileSize));
  });
  canvas.addEventListener('mouseup', (event) => {
    if (event.button !== 0 || !drag) return;
    const { moved, aim, unitId } = drag;
    drag = null;
    aimAt = null;
    aimBlocked = false;
    dirty = true;
    const p = local(event, canvas);
    const tile = screenToTile(view, session.state.map, p.x, p.y);
    const unit = activeUnit();
    if (moved) {
      // a drag from the active unit sends it where the button was let go; any other drag was a pan.
      // The order is for the unit the drag began on: if another has become the active one since
      // (a key pressed with the button held), or it is somewhere else in the game, the drag is dropped.
      const dragged = aim && unit && unit.id === unitId && mode === 'move' && !screen.querySelector('[role="dialog"]') ? unit : null;
      const sent = dragged ? mapDrag(dragged, tile) : null;
      if (dragged && sent?.kind === 'step') void tryMove(dragged.id, sent.dx, sent.dy);
      else if (dragged && sent?.kind === 'goto') dispatch({ type: 'goTo', unitId: dragged.id, x: sent.x, y: sent.y });
      return;
    }
    const click = clickAt(p);
    if (!tile || !click) return;
    switch (click.kind) {
      case 'goto':
        confirmGoto(click.x, click.y);
        return;
      case 'colony':
        cursor = tile;
        openColony(click.colonyId);
        return;
      case 'select':
        void selectUnit(click.unitIds);
        return;
      case 'step':
        if (unit) void tryMove(unit.id, click.dx, click.dy);
        return;
      default:
        cursor = tile;
        setView(centerOn(view, session.state.map, tile.x, tile.y));
    }
  });
  /** Wheel travel, from the wheel or a pinch, zooms the map about a canvas pixel once it adds up to `full`. */
  const zoomWheel = (travel: number, full: number, p: { x: number; y: number }, time: number): void => {
    const turned = wheelStep(wheelKept, travel, full);
    wheelKept = turned.kept;
    if (turned.step === 0 || time - wheelAt < WHEEL_PAUSE_MS) return;
    wheelAt = time;
    setView(zoomAt(view, session.state.map, turned.step, p.x, p.y));
    retarget();
  };
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    hideTip();
    // a trackpad's pinch, and the browser's own Ctrl+wheel zoom, come as a wheel event with Ctrl held
    zoomWheel(event.deltaMode === 1 ? event.deltaY * WHEEL_LINE : event.deltaY, event.ctrlKey ? PINCH_STEP : WHEEL_STEP, local(event, canvas), event.timeStamp);
  }, { passive: false });
  /** A pinch zooms by how far apart its fingers are now over how far they were when last heard of. */
  const pinchBy = (was: number, now: number, p: { x: number; y: number }, time: number): void => {
    hideTip();
    if (was > 0 && now > 0) zoomWheel(pinchTravel(now / was), PINCH_STEP, p, time);
  };
  /** Fingers are on the map. Safari on a touch screen tells of their pinch twice over, in touches and in gestures: the touches are heard, the gestures not. */
  let touching = false;
  // Safari tells of a trackpad's pinch in events of its own, with the scale since the fingers came down
  let gestureScale = 0;
  canvas.addEventListener('gesturestart', () => {
    hideTip();
    gestureScale = 1;
  });
  canvas.addEventListener('gesturechange', (event) => {
    if (touching) return;
    const gesture = event as MouseEvent & { scale?: number };
    const scale = gesture.scale ?? 1;
    pinchBy(gestureScale, scale, local(gesture, canvas), event.timeStamp);
    gestureScale = scale;
  });
  // two fingers on a touch screen, by the pixels between them
  let touchSpan = 0;
  const fingers = (event: TouchEvent): { span: number; at: { x: number; y: number } } | null => {
    const [a, b] = [event.touches[0], event.touches[1]];
    if (event.touches.length !== 2 || !a || !b) return null;
    const box = canvas.getBoundingClientRect();
    return { span: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), at: { x: (a.clientX + b.clientX) / 2 - box.left, y: (a.clientY + b.clientY) / 2 - box.top } };
  };
  // a finger put down or lifted starts the measure again
  const touched = (event: TouchEvent): void => {
    hideTip();
    touching = event.touches.length > 0;
    touchSpan = fingers(event)?.span ?? 0;
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) canvas.addEventListener(type, touched, { passive: true });
  canvas.addEventListener('touchmove', (event) => {
    hideTip();
    const held = fingers(event);
    if (!held) return;
    event.preventDefault();
    pinchBy(touchSpan, held.span, held.at, event.timeStamp);
    touchSpan = held.span;
  }, { passive: false });

  // --- the command bar: every map command as a button ---
  const pickFrom = async (text: string, choices: readonly BarChoice[]): Promise<void> => {
    const pick = await ask(screen, { text, choices: [...choices.map((c) => c.label), 'Cancel'], escape: choices.length });
    const choice = choices[pick];
    if (choice) await runCommand(choice.command, choice.key);
  };
  const commandBar = createCommandBar((button) => {
    // nothing on the map answers while a question, a report or another screen is up
    if (screen.querySelector('[role="dialog"]')) return;
    hideTip(); // a button worked from the keyboard may change the square under a resting pointer
    canvas.focus();
    if (view.showHidden && button.id !== 'hiddenTerrain') setView({ ...view, showHidden: false });
    if (session.state.over && (button.id === 'endTurn' || button.id === 'europe' || button.needsUnit)) {
      // the one button left to press is The end, where End turn was
      if (button.id === 'endTurn') showEnd();
    } else if (button.id === 'endTurn') {
      // the button does what it says: Enter's other meanings (confirm a Go To, open the colony under the view cursor) are not its own
      mode = 'move';
      cursor = null;
      dispatch({ type: 'endTurn' });
    } else if (button.id === 'goTo' && mode === 'goto') void runCommand('cancel', 'Escape');
    else if (button.run === 'reports') void pickFrom('Which report?', REPORT_CHOICES);
    else if (button.run === 'menus') void pickFrom('Which menu?', session.state.over ? MENU_CHOICES.filter((c) => c.command === 'menu' && !ORDER_MENUS.has(c.key)) : MENU_CHOICES);
    else void runCommand(button.run.command, button.run.key);
  });
  sidebar.element.querySelector('.sidebar-info')?.after(commandBar.element);

  /** What the encyclopedia has to say about the thing under the pointer, on the map or on the colony screen. */
  const pediaTargetAt = (event: MouseEvent): PediaTarget | null => {
    const hit = event.target instanceof Element ? event.target : null;
    if (hit === canvas) {
      const p = local(event, canvas);
      const tile = screenToTile(view, session.state.map, p.x, p.y);
      const under = tile ? session.state.map.tiles[tile.y * session.state.map.width + tile.x] : undefined;
      if (!tile || !under || !isExploredBy(under, session.state.players.findIndex((pl) => pl.id === me()))) return null;
      const inColony = Object.values(session.state.colonies).some((c) => c.x === tile.x && c.y === tile.y);
      // the piece the map draws there: the active one first, which in a colony may be aboard a ship
      const here = Object.values(session.state.units).filter((u) => u.x === tile.x && u.y === tile.y && standsOnMap(u, activeId, inColony));
      const unit = here.find((u) => u.id === activeId) ?? here[0];
      return unit ? { category: 'units', id: unit.type } : { category: 'terrain', id: terrainOf(under) };
    }
    const building = hit?.closest<HTMLElement>('[data-building]');
    const token = hit?.closest<HTMLElement>('.token');
    const [kind, id, extra] = (token?.dataset['key'] ?? '').split(':');
    if (kind === 'good' && id) return { category: 'cargo', id };
    if (kind === 'cargo' && extra) return { category: 'cargo', id: extra };
    if ((kind === 'unit' || kind === 'carrier') && id && session.state.units[id]) return { category: 'units', id: (session.state.units[id] as Unit).type };
    if (kind === 'colonist' && id) {
      const person = Object.values(session.state.colonies).flatMap((c) => c.colonists).find((c) => c.id === id);
      if (person) return { category: 'skills', id: person.profession };
    }
    return building?.dataset['building'] ? { category: 'buildings', id: building.dataset['building'] } : null;
  };
  screen.addEventListener('contextmenu', (event) => {
    if (screen.querySelector('[role="dialog"]:not(.colony-screen)')) return;
    const target = pediaTargetAt(event);
    if (!target) return;
    event.preventDefault();
    void showPedia(screen, target).then(() => (colonyScreen ? undefined : canvas.focus()));
  });
  canvas.addEventListener('mouseleave', () => {
    hideTip();
    pointer = null;
    if (aimAt || draggedNow()) dirty = true;
    drag = null;
    aimAt = null;
    aimBlocked = false;
  });

  sidebar.minimap.addEventListener('click', (event) => {
    const p = local(event, sidebar.minimap);
    const { map } = session.state;
    const layout = minimapLayout(map.width, map.height, sidebar.minimap.clientWidth, sidebar.minimap.clientHeight);
    const tile = minimapToTile(layout, map.width, map.height, p.x, p.y);
    setView(centerOn(view, map, tile.x, tile.y));
    canvas.focus();
  });

  const edgeScroll = (dt: number): void => {
    // (a unit being dragged to its destination may need the view to scroll to reach it)
    if (!pointer || (drag && !drag.aim)) return;
    const dx = pointer.x < EDGE_SCROLL_MARGIN ? -1 : pointer.x > view.width - EDGE_SCROLL_MARGIN ? 1 : 0;
    const dy = pointer.y < EDGE_SCROLL_MARGIN ? -1 : pointer.y > view.height - EDGE_SCROLL_MARGIN ? 1 : 0;
    if (dx === 0 && dy === 0) return;
    const step = EDGE_SCROLL_SPEED * Math.min(dt, 0.05);
    setView(panBy(view, session.state.map, dx * step, dy * step));
    retarget();
  };

  const draw = (time = performance.now()): void => {
    const unit = activeUnit();
    const held = draggedNow();
    // a move made with the button held (a key) changes what the release would do
    if (aimAt) judgeAim();
    const showCursor = aimAt ? { ...aimAt, blocked: aimBlocked } : mode !== 'move' ? cursor : null;
    const dragged = held && pointer ? { unitId: held.id, x: pointer.x, y: pointer.y } : null;
    // the unit under orders, or the view, may have changed under a pointer that has not moved
    showPointer();
    // a slip that is up follows what now stands on its square; it never asks for this drawing
    if (tipAt) showTip(true);
    shownBlink = blinkAt(time);
    shownWater = waterAt(time);
    if (unit && unit.x >= 0) lastSpot = { x: unit.x, y: unit.y };
    // the ground is kept from one redraw to the next and painted again only when the map, the view or the water changes
    if (ground.width !== canvas.width || ground.height !== canvas.height || groundOf.map !== session.state.map || groundOf.view !== view || groundOf.water !== shownWater) {
      ground.width = canvas.width;
      ground.height = canvas.height;
      const groundCtx = ground.getContext('2d');
      if (groundCtx) {
        groundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderGround(groundCtx, session.state, view, cache, shownWater);
      }
      groundOf = { map: session.state.map, view, water: shownWater };
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground, 0, 0, view.width, view.height);
    renderPieces(ctx, session.state, view, cache, { activeUnitId: unit?.id ?? null, cursor: showCursor, dragged, blinkOn: shownBlink, waterPhase: shownWater, slide: slideAt(time) });
    renderMinimap(miniCtx, session.state, view, sidebar.minimap.clientWidth, sidebar.minimap.clientHeight, unit?.id ?? null);
    const focus = mode !== 'move' || !unit || unit.x < 0 ? cursor : { x: unit.x, y: unit.y };
    const status = notice || (session.state.over ? END_STATUS : unit ? '' : 'End of turn. Press Enter.');
    sidebar.update(sidebarModel(session.state, mode === 'view' ? null : unit, focus, revealAll, status));
    commandBar.update(unit !== null && mode !== 'view', mode === 'goto', europeCall(session.state, me()), session.state.over !== null, unit !== null && mayExplore(unit));
  };

  const frame = (time: number): void => {
    if (stopped) return;
    edgeScroll(lastTime ? (time - lastTime) / 1000 : 0);
    lastTime = time;
    // an animation step redraws too, but is counted apart: `frames` are redraws the game asked for
    if (!dirty && (slide !== null || (activeUnit() !== null && blinkAt(time) !== shownBlink) || waterAt(time) !== shownWater)) {
      draw(time);
      ticks++;
      canvas.dataset['ticks'] = String(ticks);
    }
    if (dirty) {
      dirty = false;
      draw(time);
      frames++;
      canvas.dataset['frames'] = String(frames);
      canvas.dataset['turn'] = String(session.state.turn);
      canvas.dataset['view'] = JSON.stringify(view);
      canvas.dataset['aim'] = aimAt ? `${aimAt.x},${aimAt.y},${aimBlocked ? 'blocked' : 'ok'}` : '';
      canvas.dataset['hidden'] = String(view.showHidden);
      canvas.dataset['mode'] = mode;
      canvas.dataset['active'] = activeId ?? '';
    }
    requestAnimationFrame(frame);
  };

  window.__newWorld = {
    benchmark(count) {
      const began = performance.now();
      for (let i = 0; i < count; i++) draw();
      return (performance.now() - began) / count;
    },
    colonies: () => Object.keys(session.state.colonies).length,
    endTurnMs() {
      const began = performance.now();
      dispatch({ type: 'endTurn' });
      return performance.now() - began;
    },
  };

  window.addEventListener('resize', onResize);
  resize();
  save();
  requestAnimationFrame(frame);
  const begin = (): void => {
    offerHint({ where: 'map', activeUnitId: activeId });
    canvas.focus();
  };
  markOver();
  if (session.state.over) {
    // a finished game resumed or loaded: its end page at once; it had its place in the Hall of Fame when it ended
    showEnd();
  } else if (opening && seat) {
    // the first thing seen: the Crown's commission, over the map with the ship already on it
    const court = NATIONS[seat.nation];
    void ask(screen, {
      heading: [`In the year of Our Lord ${dateOfTurn(session.state.turn).year}`, `An audience with ${court.court}`],
      text: `${seat.name}: for the glory of ${court.name} we name you Viceroy of the New World. Cross the ocean, settle the land you find, and send its wealth home to our Crown.`,
      choices: ['So be it'], escape: 0, picture: portraitCanvas('king', 2),
    }).then(begin);
  } else begin();
}
