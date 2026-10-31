/**
 * Master gate for the end-of-iteration Season Recap ("Wrapped"). When false or
 * absent the system is inert: `resetGameWorld` builds no recaps, voluntary/admin
 * retirements attach none, and the post-reset gate surfaces nothing. Fail-closed:
 * only an explicit `true` on the gameState singleton enables it. Flipped from the
 * admin Feature Gates panel (`/api/admin/feature-gates`, key `seasonRecapEnabled`).
 * Fresh worlds seed it on (DEFAULT_GAME_STATE_FLAGS).
 */
export function isSeasonRecapEnabled(
  preloaded?: {
    seasonRecapEnabled?: boolean | null;
  } | null
): boolean {
  return preloaded?.seasonRecapEnabled === true;
}
