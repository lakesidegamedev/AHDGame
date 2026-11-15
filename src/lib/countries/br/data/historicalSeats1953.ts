import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// BR executive 1953 — the PTB ticket won the Oct 1950 presidential election;
// that Second Republic president (inaugurated Jan 1951) is still sitting in
// 1953. Seed a generic NPP on the historically-correct PTB affiliation (same
// unnamed-officeholder pattern as US_EXECUTIVE_1953). No VP row: the 1951–54
// VP sat with PSP, which is not in the 1953 BR party roster. BR perpetual
// elections only spawn chamber races, so without this seed the presidency
// stays vacant for the whole game.
export const BR_EXECUTIVE_1953: HistoricalSeat[] = [
  { state: "BR", officeType: "president", party: "br_ptb" },
];
