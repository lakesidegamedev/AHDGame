import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// Republican ticket, from the 2024 election, sitting in January 2027 two years
// into the term that began 20 Jan 2025. Unlike the 1992 and 2020 pairs these
// rows carry fixed identities: the 2027 roster
// (`src/lib/npp/rosters/p2027-us.ts`) seats a fictional president and vice
// president. No preset seats a real politician.
export const US_EXECUTIVE_2027: HistoricalSeat[] = [
  { state: "US", officeType: "president", party: "republican" },
  { state: "US", officeType: "vicePresident", party: "republican" },
];
