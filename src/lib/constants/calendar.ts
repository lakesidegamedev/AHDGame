/**
 * Game-calendar year of turn 1. Turn 1 = first week of January in this year.
 *
 * All canonical-cycle anchors (US House / Senate / President / Governor,
 * UK Commons, DE Bundestag, JP Shugiin / Sangiin) derive from this constant
 * via `(REAL_ELECTION_YEAR − STARTING_YEAR + 1) * TURNS_PER_YEAR` formulas,
 * so shifting STARTING_YEAR consistently moves every election by the same
 * number of turns. Real-world 2019 elections (UK Dec 2019 GE, JP Jul 2019
 * Sangiin Class 2) are bootstrap-skipped: the formulas reference the
 * NEXT real-world election (UK 2024, JP 2022) directly, so the 2019
 * cycle never spawns in-game.
 *
 * Lives in its own module because `turnTime` re-exports the corporation
 * constants for legacy callers; a client formatter that only needs the base
 * year must not pull that 96 KB module with it.
 */
export const STARTING_YEAR = 2019;

/** UK starting year. Mirrors STARTING_YEAR. */
export const UK_STARTING_YEAR = 2019;

/** Milliseconds per turn (1 real hour — cron runs hourly). Used for election timestamps. */
export const MS_PER_TURN = 60 * 60 * 1000;

/** Turns per year. 48 turns = 1 year. */
export const TURNS_PER_YEAR = 48;
