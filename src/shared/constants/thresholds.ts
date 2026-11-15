/**
 * Single-value thresholds shared by rules and client display code.
 *
 * Each constant lives in its own module so a client surface that only needs the
 * number does not pull the whole formula file (and every function that uses it)
 * into the browser bundle.
 */

/** Favorability is stable at or below this value unless other systems reduce it. */
export const FAVORABILITY_NATURAL_DECAY_THRESHOLD = 60;
