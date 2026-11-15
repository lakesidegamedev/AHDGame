/**
 * Colours for the market-position ring and its legend.
 *
 * ORDER IS PART OF THE RESULT: adjacent slots must stay distinguishable, and
 * teal must not neighbour pink. These four pass contrast and colourblind
 * checks on both card surfaces. Never cycle past the end: four is the intended
 * cap, so a sector rarely shows more than a handful of player slices.
 */

/** Player-corp fallback slots, in validated order. Never cycle past the end. */
export const PLAYER_SLOT_COLORS = ["#3b82f6", "#db2777", "#d97706", "#0d9488"] as const;

/**
 * The NPP field's single arc: low chroma so it reads as ground rather than
 * figure, and distinct from the near-transparent "Unowned" grey it can sit
 * beside. The muting is what makes the player's own slice legible against a
 * field that may hold 90%+ of the market.
 */
export const NPP_ARC_COLOR = "#6b7280";

/**
 * A stable colour for a player corp that has not set a brand colour.
 *
 * Keyed off the corporation's identity, not its position in the array, so a
 * rival leaving the sector cannot repaint the corps after it. `fallbackIndex` is
 * only for the case where there is no id to hash.
 */
export function playerSlotColor(key: string | undefined, fallbackIndex: number): string {
  if (!key) return PLAYER_SLOT_COLORS[fallbackIndex % PLAYER_SLOT_COLORS.length];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PLAYER_SLOT_COLORS[Math.abs(hash) % PLAYER_SLOT_COLORS.length];
}
