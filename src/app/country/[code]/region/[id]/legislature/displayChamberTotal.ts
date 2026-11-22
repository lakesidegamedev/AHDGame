/**
 * Chamber size shown on the state legislature page. The configured total can be
 * smaller than the seats actually filled (stale or missing seat table entry),
 * which printed party percentages above 100. Never show a total below the
 * filled count.
 */
export function displayChamberTotal(totalSeats: number, filledSeats: number | undefined): number {
  return Math.max(totalSeats, filledSeats ?? 0);
}
