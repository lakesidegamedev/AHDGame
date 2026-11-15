/**
 * The preset assumed when a world does not state one.
 *
 * Prefer the world's own `gameState.preset` via `getGameStatePresetOrDefault`;
 * use this only where there is genuinely no world to ask.
 *
 * Lives in `constants/` because CLIENT components need it. Importing it from
 * `db/collections/gameState` dragged `mongodb` into the browser bundle and
 * broke `next build`.
 */
export const DEFAULT_SEED_PRESET = "2019-default";
