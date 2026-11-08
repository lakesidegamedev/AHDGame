/**
 * Party/state-party treasury reserves are persisted in the party's local home
 * currency, matching the treasury they gate. The input value, the stored DB
 * value, and the runtime reserve check all speak the same units.
 */
export function formatTreasuryReserveInputValue(amount: number | null | undefined): string {
  const value = Number.isFinite(amount) && (amount ?? 0) > 0 ? (amount as number) : 0;
  return Math.round(value).toString();
}
