/**
 * NPP construction finance attempts for one corporation turn: request each
 * selected loan, count the outcomes, and tally why the failures failed.
 *
 * About 900 requests a turn reach this stage and fewer than 30 are funded, and
 * the corporation turn only counted failures, so the binding reason (bank
 * reserves, borrower credit, collateral, quote, missing lender) could not be
 * read. The tally keys the bank's error message with digits stripped, so one
 * reason with different amounts lands in one bucket.
 */
import type { Db } from "mongodb";
import { requestConstructionFinance } from "@/lib/banking/constructionFinance";

type FinanceRequest = Omit<
  Parameters<typeof requestConstructionFinance>[0],
  "db" | "enabled" | "requestId"
>;

export interface NppConstructionFinanceCandidate extends Omit<
  FinanceRequest,
  "collateralCostLocal" | "constructionCostLocal" | "maximumCostLocal"
> {
  costLocal: number;
}

/** Bucket key for a failure message: digits and amounts removed, length capped. */
export function financeFailureReason(error: string | undefined | null): string {
  const text = (error ?? "unknown")
    .replace(/[0-9][0-9.,]*/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 120) || "unknown";
}

export async function attemptNppConstructionFinance(input: {
  db: Db;
  turn: number;
  requests: readonly NppConstructionFinanceCandidate[];
  /** Requests that never reached a bank (no lender, over cap), counted as failed. */
  backlogCount: number;
}): Promise<{
  funded: number;
  pending: number;
  failed: number;
  failureReasons: Record<string, number>;
}> {
  let funded = 0;
  let pending = 0;
  let failed = input.backlogCount;
  const failureReasons: Record<string, number> = {};
  if (input.backlogCount > 0)
    failureReasons["not attempted (no lender or over cap)"] = input.backlogCount;
  for (const candidate of input.requests) {
    const { costLocal, ...rest } = candidate;
    const result = await requestConstructionFinance({
      ...rest,
      db: input.db,
      enabled: true,
      requestId: `npp-${input.turn}-${candidate.sector._id.toHexString()}`,
      constructionCostLocal: costLocal,
      collateralCostLocal: costLocal,
      maximumCostLocal: costLocal,
    });
    if (!result.ok) {
      failed += 1;
      const reason = financeFailureReason(result.error);
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
      continue;
    }
    if (result.pending) pending += 1;
    else funded += 1;
  }
  return { funded, pending, failed, failureReasons };
}
