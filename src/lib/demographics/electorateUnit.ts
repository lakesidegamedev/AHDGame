/**
 * One counted slice of a region's electorate: census cells that share a
 * quantized lean and turnout, with live (drift and campaign adjusted) values.
 * The vote engines iterate these directly.
 */
export interface ElectorateUnit {
  id: string;
  /** Share of the electorate, percent (0..100). */
  populationPct: number;
  economicLean: number;
  socialLean: number;
  /** Turnout rate, percent (0..100). */
  turnout: number;
}
