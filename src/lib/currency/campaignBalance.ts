/**
 * Campaign-fund balance in LOCAL currency, for affordability checks.
 *
 * When forex is ON, use `currencyBalances.campaign`, NOT the legacy `funds`
 * field: `funds` is USD-scaled, so in a high-denomination currency it reads as
 * a tiny local balance and falling back to it produces a false "insufficient
 * funds". When forex is OFF, the legacy `funds` field is the balance.
 */
export function localCampaignBalance(
  character: { currencyBalances?: { campaign?: number } | null; funds?: number },
  forexEnabled: boolean
): number {
  return forexEnabled ? (character.currencyBalances?.campaign ?? 0) : (character.funds ?? 0);
}
