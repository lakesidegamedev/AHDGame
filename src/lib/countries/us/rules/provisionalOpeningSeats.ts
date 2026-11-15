/** Provisional results seed party allocations, with explicit modeled gap filling. */
import type { HistoricalSeat } from "@/lib/constants/historicalSeats";
import { largestRemainderAllocate } from "@/lib/redistricting/budget";

export function openingParty(code: string): HistoricalSeat["party"] {
  if (code === "D") return "democrat";
  if (code === "R") return "republican";
  return "independent";
}

export function provisionalHouseSeats(
  rows: readonly { district: string; party: string }[]
): HistoricalSeat[] {
  const groups = new Map<string, HistoricalSeat>();
  for (const row of rows) {
    const state = row.district.split("-")[0];
    const party = openingParty(row.party);
    const key = `${state}:${party}`;
    const entry = groups.get(key) ?? { state, party, officeType: "house", seatsHeld: 0 };
    entry.seatsHeld = (entry.seatsHeld ?? 0) + 1;
    groups.set(key, entry);
  }
  return [...groups.values()];
}

export function provisionalSenateSeats(
  base: readonly HistoricalSeat[],
  rows: readonly { state: string; senateClass: number; party: string }[]
): HistoricalSeat[] {
  return base.map((seat) => {
    const result = rows.find((r) => r.state === seat.state && r.senateClass === seat.senateClass);
    return result ? { ...seat, party: openingParty(result.party) } : { ...seat };
  });
}

export function provisionalStateSenates(
  rows: readonly { state: string; seats: number; counts: Record<string, number | undefined> }[]
): HistoricalSeat[] {
  return rows.flatMap((row) => {
    const entries = Object.entries(row.counts).filter(
      (entry): entry is [string, number] => (entry[1] ?? 0) > 0
    );
    if (!entries.length) throw new Error(`No modeled state-senate weights for ${row.state}`);
    const seats = largestRemainderAllocate(
      row.seats,
      entries.map(([, count]) => count)
    );
    return entries.flatMap(([party], index) =>
      seats[index]
        ? [
            {
              state: row.state,
              officeType: "stateSenate" as const,
              party: openingParty(party),
              seatsHeld: seats[index],
            },
          ]
        : []
    );
  });
}
