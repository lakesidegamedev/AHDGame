import type { TreasuryTransactionCategory } from "@/lib/db/types/treasuryTransaction";

/**
 * Typed as a total record so a new `TreasuryTransactionCategory` cannot ship
 * without a label here: the compiler catches it.
 */
export const TREASURY_CATEGORY_LABEL: Record<TreasuryTransactionCategory, string> = {
  donations: "Donations",
  caucus_tax: "Caucus tax",
  transfers: "Transfers",
  slate: "Slate",
  gotv: "GOTV",
  suppression: "Suppression",
  whip_ops: "Whip ops",
  recruitment: "Recruitment",
  operations: "Operations",
  fund_generation: "Fund generation",
  ps_investment: "Political Strength purchase",
  org_building: "Organization building",
  campaign_donation: "Campaign donation",
};
