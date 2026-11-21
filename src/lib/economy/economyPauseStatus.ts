export interface EconomyPauseStatus {
  /** True while the world is inside the window. */
  paused: boolean;
  /** First turn that runs the economy normally, or null when no pause is on. */
  resumesAtTurn: number | null;
  /** Turns left before the economy resumes, 0 when it is not paused. */
  turnsRemaining: number;
}
