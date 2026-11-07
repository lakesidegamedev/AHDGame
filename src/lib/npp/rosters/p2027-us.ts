import type { RosterMap } from "../historicalRosters";

/**
 * January 2027 US executive. Only the president and vice president are
 * authored; every other 2027 seat keeps a generated identity until its own
 * roster is written.
 */
export const ROSTER_2027_US: RosterMap = {
  // 47th president, second term began 20 Jan 2025 after the November 2024
  // election. https://www.whitehouse.gov/administration/donald-j-trump/
  "US|president|US|republican|0": {
    name: "Donald Trump",
    birthYear: 1946,
    gender: "male",
    ethnicity: "white",
    portraitId: "donald-trump",
  },
  // 50th vice president, sworn in 20 Jan 2025 on the same ticket.
  // https://www.whitehouse.gov/administration/jd-vance/
  "US|vicePresident|US|republican|0": {
    name: "JD Vance",
    birthYear: 1984,
    gender: "male",
    ethnicity: "white",
  },
};
