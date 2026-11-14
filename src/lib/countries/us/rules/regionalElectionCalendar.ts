/** State-specific 2027 opening calendars; upper chambers retain aggregate renewal. */
const GOVERNOR_2028 = new Set(["DE", "IN", "MO", "MT", "NC", "ND", "UT", "WA", "WV", "NH", "VT"]);
const GOVERNOR_2027 = new Set(["KY", "LA", "MS"]);
const GOVERNOR_2029 = new Set(["NJ", "VA"]);
const ODD_SENATES = new Set(["LA", "MS", "NJ", "VA"]);
const SENATE_2030 = new Set(["AL", "MD", "MI", "MN"]);

/**
 * Governor terms: https://www.nga.org/governors/powers-and-authority/
 * State terms: https://www.ncsl.org/resources/details/number-of-legislators-and-length-of-terms-in-years
 * Kentucky 2027: https://web.sos.ky.gov/CandidateFilingDocuments/Governor_RepublicanDemocraticPrimary.pdf
 * Staggered senates still renew as one aggregate chamber in the game.
 */
export function usRegionalElectionYear2027(
  state: string,
  type: string,
  cycle: number
): number | undefined {
  if (type !== "governor" && type !== "stateSenate") return undefined;
  if (!Number.isSafeInteger(cycle) || cycle < 1) throw new Error("Invalid election cycle");
  if (type === "governor") {
    const first = GOVERNOR_2027.has(state)
      ? 2027
      : GOVERNOR_2028.has(state)
        ? 2028
        : GOVERNOR_2029.has(state)
          ? 2029
          : 2030;
    return first + (cycle - 1) * (state === "NH" || state === "VT" ? 2 : 4);
  }
  let year = ODD_SENATES.has(state) ? 2027 : SENATE_2030.has(state) ? 2030 : 2028;
  for (let n = 1; n < cycle; n++)
    year +=
      state === "MN"
        ? year % 10 === 0
          ? 2
          : 4
        : state === "NJ"
          ? year % 10 === 1
            ? 2
            : 4
          : ODD_SENATES.has(state) || SENATE_2030.has(state) || state === "KS"
            ? 4
            : 2;
  return year;
}

export function usRegionalElectionYearForWorld(
  state: string,
  type: string,
  cycle: number,
  countryId: string,
  preset: string
): number | undefined {
  if (countryId !== "US" || preset !== "2027-default") return undefined;
  return usRegionalElectionYear2027(state, type, cycle);
}
