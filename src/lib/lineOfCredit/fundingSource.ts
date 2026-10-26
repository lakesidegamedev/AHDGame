import type { LoanFundingSource } from "@/lib/db/types/character";

export const DEFAULT_LOAN_FUNDING_SOURCE: LoanFundingSource = "both";

export function isValidFundingSource(value: unknown): value is LoanFundingSource {
  return value === "deposits" || value === "reserves" || value === "both";
}
