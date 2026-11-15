/** Fixed-date provincial legislatures renew every four years. */
export const CA_PROVINCIAL_TERM_YEARS = 4;

/** Label the same fixed-date cycle used by the provincial election scheduler. */
export function provincialElectionYearForWorld(
  firstElectionYear: number | undefined,
  electionType: string,
  cycle: number,
  country: string,
  preset: string | undefined
): number | undefined {
  if (country !== "CA" || electionType !== "provincialLegislature" || preset !== "2027-default")
    return undefined;
  return firstElectionYear === undefined
    ? undefined
    : firstElectionYear + (cycle - 1) * CA_PROVINCIAL_TERM_YEARS;
}
