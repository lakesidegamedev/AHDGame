/**
 * Canada's provincial and territorial legislatures: seats at each one's last
 * general election before 2027 (778 in total, from each provincial elections
 * agency), and the year of its next fixed-date general election after January
 * 2027. NWT and Nunavut run consensus government; the game contests them by
 * party like the rest.
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
  CA_YT: { seats: 19, nextElectionYear: 2029 },
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
