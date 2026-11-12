/**
 * Game-calendar year of turn 1. All canonical-cycle election anchors derive
 * from this via `(REAL_ELECTION_YEAR - STARTING_YEAR + 1) * TURNS_PER_YEAR`,
 * so shifting it moves every election by the same number of turns. Lives in
 * its own module so formatters can avoid pulling in `turnTime`.
 */
export const STARTING_YEAR = 2019;

/** UK starting year. Mirrors STARTING_YEAR. */
export const UK_STARTING_YEAR = 2019;

/** Milliseconds per turn (1 real hour — cron runs hourly). Used for election timestamps. */
export const MS_PER_TURN = 60 * 60 * 1000;

/** Turns per year. 48 turns = 1 year. */
export const TURNS_PER_YEAR = 48;
