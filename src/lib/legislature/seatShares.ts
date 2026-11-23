/**
 * Seat shares in percent to one decimal, rounded by the largest-remainder
 * method so the parties plus any vacant seats add up to exactly 100.0.
 * Returns shares index-aligned with `seats`.
 */
export function seatSharePercents(seats: readonly number[], total: number): number[] {
  if (!(total > 0)) return seats.map(() => 0);
  const filled = seats.reduce((sum, n) => sum + n, 0);
  const vacant = Math.max(0, total - filled);
  const slots = vacant > 0 ? [...seats, vacant] : [...seats];
  const scale = Math.max(total, filled);
  const exact = slots.map((n) => (n / scale) * 1000);
  const floors = exact.map(Math.floor);
  let left = 1000 - floors.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((value, index) => ({ index, rem: value - Math.floor(value) }))
    .sort((a, b) => b.rem - a.rem || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return floors.slice(0, seats.length).map((n) => n / 10);
}
