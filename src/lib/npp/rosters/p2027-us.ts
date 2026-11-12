import type { RosterMap } from "../historicalRosters";

/**
 * January 2027 US executive. Only the president and vice president are
 * authored; every other 2027 seat keeps a generated identity.
 *
 * Both identities are fictional. The ticket is Republican and two years into
 * the term that began in January 2025, which is the only thing it carries over
 * from the real world: party, office and timing, never a real person.
 */
export const ROSTER_2027_US: RosterMap = {
  "US|president|US|republican|0": {
    name: "Warren Hollister",
    birthYear: 1951,
    gender: "male",
    ethnicity: "white",
    // Two years into a second term, so the term limit bars a third election
    // and he cannot run in 2028.
    priorExecutiveTerms: 2,
  },
  "US|vicePresident|US|republican|0": {
    name: "Colin Ashby",
    birthYear: 1982,
    gender: "male",
    ethnicity: "white",
  },
};
