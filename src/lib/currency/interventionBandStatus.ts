import { DEFENCE_MAX_PRESSURE } from "./intervention/rules/defence";

/**
 * How long a declared FX corridor would take to reach at maximum defence.
 *
 * The issue behind this (#4495) is a band declared far from the live rate: the
 * page says "Defending" every turn, interventions fire, and the corridor never
 * arrives. Settlement cannot be fixed by spending harder, so the honest fix is
 * to state the arithmetic: defence moves the rate at most
 * `DEFENCE_MAX_PRESSURE` a turn, so a gap of 40% needs about 40 turns of
 * uninterrupted maximum-strength defence even with no opposing drift.
 */
export const BAND_DEFENCE_HORIZON_TURNS = 48;

export interface BandDefenceStatus {
  defending: boolean;
  /** Turns of maximum-strength defence to the nearest boundary. 0 when in band. */
  turnsToReach: number;
  /** True when even a full game year of maximum defence would not close it. */
  unreachable: boolean;
  /** Distance to the nearest boundary, as a fraction of the live rate. */
  gapPct: number;
  /** Most the rate can move in one turn of defence, as a fraction. */
  defencePerTurnPct: number;
}

/**
 * Describe an active band against the live rate. Pure and tolerant: a
 * non-finite input yields the neutral in-band answer rather than a warning the
 * page cannot act on.
 */
export function bandDefenceStatus(rate: number, floor: number, ceiling: number): BandDefenceStatus {
  const finite = [rate, floor, ceiling].every((v) => Number.isFinite(v));
  const defencePerTurnPct = DEFENCE_MAX_PRESSURE;
  if (!finite || rate <= 0 || floor <= 0 || ceiling < floor) {
    return { defending: false, turnsToReach: 0, unreachable: false, gapPct: 0, defencePerTurnPct };
  }
  if (rate >= floor && rate <= ceiling) {
    return { defending: false, turnsToReach: 0, unreachable: false, gapPct: 0, defencePerTurnPct };
  }
  const gapPct = Math.abs((rate < floor ? floor : ceiling) - rate) / rate;
  const turnsToReach = Math.ceil(gapPct / defencePerTurnPct);
  return {
    defending: true,
    turnsToReach,
    unreachable: turnsToReach > BAND_DEFENCE_HORIZON_TURNS,
    gapPct,
    defencePerTurnPct,
  };
}

/** The subset the public exchange surfaces may publish. */
export function publicBandStatus(rate: number, floor: number, ceiling: number) {
  const status = bandDefenceStatus(rate, floor, ceiling);
  return {
    defending: status.defending,
    turnsToReach: status.turnsToReach,
    unreachable: status.unreachable,
    gapPct: status.gapPct,
  };
}
