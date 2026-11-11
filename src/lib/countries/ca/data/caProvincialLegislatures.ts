/**
 * Canada's thirteen provincial and territorial legislatures.
 *
 * Seats: each legislature's size at its most recent general election before
 * 2027 (Elections Ontario, Elections Quebec, Elections BC, Elections Alberta,
 * Elections Saskatchewan, Elections Manitoba, Elections Nova Scotia, Elections
 * New Brunswick, Elections NL, Elections PEI, Elections Yukon, Elections NWT,
 * Elections Nunavut). 780 in total.
 *
 * Next election: the calendar year of each legislature's next fixed-date
 * general election after January 2027, under its own fixed-date law.
 *
 * The Northwest Territories and Nunavut run consensus government without
 * parties; the game contests their seats between parties like every other
 * legislature.
 */
export const CA_PROVINCIAL_LEGISLATURES: Readonly<
  Record<string, { seats: number; nextElectionYear: number }>
> = {
  CA_ON: { seats: 124, nextElectionYear: 2029 },
  CA_QC: { seats: 125, nextElectionYear: 2030 },
  CA_BC: { seats: 93, nextElectionYear: 2028 },
  CA_AB: { seats: 87, nextElectionYear: 2027 },
  CA_MB: { seats: 57, nextElectionYear: 2027 },
  CA_SK: { seats: 61, nextElectionYear: 2028 },
  CA_NS: { seats: 55, nextElectionYear: 2028 },
  CA_NB: { seats: 49, nextElectionYear: 2028 },
  CA_NL: { seats: 40, nextElectionYear: 2029 },
  CA_PE: { seats: 27, nextElectionYear: 2027 },
  CA_YT: { seats: 21, nextElectionYear: 2029 },
  CA_NT: { seats: 19, nextElectionYear: 2027 },
  CA_NU: { seats: 22, nextElectionYear: 2029 },
};

/** Seats per province or territory, for the chamber spec. */
export const CA_PROVINCIAL_SEATS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(CA_PROVINCIAL_LEGISLATURES).map(([id, l]) => [id, l.seats])
);

export const CA_PROVINCIAL_SEATS_TOTAL = Object.values(CA_PROVINCIAL_SEATS).reduce(
  (sum, seats) => sum + seats,
  0
);
