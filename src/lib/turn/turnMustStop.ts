/**
 * A phase whose failure must stop the turn instead of being recorded as a
 * warning: advancing past it would leave the world in a state later turns
 * cannot reconcile (the funded producer market settles every plant once per
 * turn). The lock is released and the next attempt resumes this turn, rerunning
 * this phase: everything it writes must be safe to repeat.
 */
export class TurnMustStopError extends Error {
  constructor(
    readonly phase: string,
    cause: unknown
  ) {
    super(
      `${phase} must succeed before the turn can advance: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause }
    );
    this.name = "TurnMustStopError";
  }
}
