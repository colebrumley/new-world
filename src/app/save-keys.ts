// Where saved games live in the browser's store. Kept free of imports so the title screen can
// ask whether there is anything to load without fetching the engine.
export const AUTOSAVE_KEY = 'new-world:autosave';
export const SLOT_COUNT = 10;
export const DECADE_SLOT = 8;
export const LAST_TURN_SLOT = 9;

/** The key of a slot; the last slot is the autosave of the game in play. */
export const slotKey = (index: number): string => (index === LAST_TURN_SLOT ? AUTOSAVE_KEY : `new-world:slot:${index}`);

/** Is there any saved game at all, in any slot? Looks only at whether the keys exist. */
export function hasAnySave(): boolean {
  try {
    for (let i = 0; i < SLOT_COUNT; i++) if (localStorage.getItem(slotKey(i)) !== null) return true;
    return false;
  } catch {
    return false;
  }
}
