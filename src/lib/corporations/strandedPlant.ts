/**
 * Stranded-plant thresholds. A plant is STRANDED when it chronically cannot
 * sell what it makes; `lowFillTurns` in sectorTurn is the chronic signal.
 * WARN shows the player a warning; DIVEST makes an NPP corp exit the plant
 * (capacity is not returned to the unowned pool, to avoid the next founding
 * refilling the glut). DIVEST is double WARN: NPPs get the same info later.
 */

/** soldFraction below this counts a turn toward `lowFillTurns`. */
export const STRANDED_LOW_FILL_THRESHOLD = 0.5;

/** Consecutive low-fill turns before the player-facing warning shows. */
export const STRANDED_WARN_TURNS = 6;

/** Consecutive low-fill turns before an NPP corp divests the plant. */
export const STRANDED_DIVEST_TURNS = 12;

/**
 * Cap on stranded divests per NPP corp per turn. Divests are instant deletes;
 * one per turn keeps a corp's exit gradual and its sector count stable enough
 * for the rest of the decision pass to reason about.
 */
export const STRANDED_DIVEST_MAX_PER_TURN = 1;
