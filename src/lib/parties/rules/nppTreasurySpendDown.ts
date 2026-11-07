/**
 * Treasury spend-down for NPP-run parties (#5704).
 *
 * A party no player leads never sets a Political Strength investment budget,
 * so its treasury only grows. Each turn it now spends a share of whatever it
 * holds above a reserve target through the same investment channel a chair
 * uses. The reserve is measured in that channel's own price, so it scales with
 * each country's currency and party economy.
 *
 * Plain data in, plain data out.
 */

/** Turns of maximum Political Strength investment an NPP party keeps in reserve. */
export const NPP_TREASURY_RESERVE_TURNS = 10;
/** Share of the treasury above the reserve put to work each turn. */
export const NPP_TREASURY_SPEND_SHARE = 0.1;

/** The leadership fields that decide whether a player runs the party. */
export interface SpendDownParty {
  createdBy?: unknown;
  chairId?: unknown;
  viceChairId?: unknown;
  isDefunct?: boolean;
}

/** True when no player founded or leads the live party, so the AI manages its money. */
export function isNppRunParty(party: SpendDownParty): boolean {
  return (
    party.isDefunct !== true &&
    party.createdBy == null &&
    party.chairId == null &&
    party.viceChairId == null
  );
}

/** Treasury an NPP party keeps before it spends: reserve turns of maximum investment. */
export function nppTreasuryReserve(ratePerPs: number, maxPsPerTurn: number): number {
  return NPP_TREASURY_RESERVE_TURNS * Math.max(0, maxPsPerTurn) * Math.max(0, ratePerPs);
}

/**
 * Per-turn investment budget for a party: its chair's own budget, or for an
 * NPP-run party the larger of that and the spend-down share of its surplus.
 */
export function effectivePsInvestmentBudget(input: {
  party: SpendDownParty;
  chairBudget: number;
  treasury: number;
  ratePerPs: number;
  maxPsPerTurn: number;
}): number {
  const chairBudget = Math.max(0, input.chairBudget);
  if (!isNppRunParty(input.party)) return chairBudget;
  const surplus = input.treasury - nppTreasuryReserve(input.ratePerPs, input.maxPsPerTurn);
  if (!(surplus > 0)) return chairBudget;
  return Math.max(chairBudget, surplus * NPP_TREASURY_SPEND_SHARE);
}
