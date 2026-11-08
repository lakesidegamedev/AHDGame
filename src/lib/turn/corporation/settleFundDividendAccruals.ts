import type { Db } from "mongodb";
import { workerConfig } from "@/lib/config/worker";

type FundDividendAccruals =
  import("@/lib/indexFunds/dividendPassThrough").FundDividendAccrualInput[];

/**
 * Phase 3c-fund: constituent corp dividends to index funds (75% reinvest /
 * 25% pass-through). Moved out of the corporation turn unchanged; see the
 * comments below for the batching and equivalence evidence.
 */
export async function settleFundDividendAccruals(
  db: Db,
  fundDividendAccruals: FundDividendAccruals,
  turn: number | undefined
): Promise<void> {
  if (fundDividendAccruals.length > 0) {
    const { isIndexFundsEnabled } = await import("@/lib/indexFunds/featureFlag");
    if (await isIndexFundsEnabled()) {
      // I/O batching: this step is ~42% of corporationTurn, dominated by ~5k
      // serial DB round-trips per turn against remote Mongo. The batch path
      // collapses them (4513 to 110 at 500 accruals). Equivalence is proved by
      // scripts/perf/dividend-equivalence.ts diffing all six written
      // collections over adversarial input, and pinned by
      // dividendPassThrough.test.ts. The paths are not bit-identical (double
      // addition order); worst drift is 1.5e-8 absolute, far below the cent
      // flooring discards. Set AHD_BATCH_FUND_DIVIDENDS=off to fall back.
      if (workerConfig.batchFundDividends() !== "off") {
        const { processIndexFundDividendsBatch } =
          await import("@/lib/indexFunds/dividendPassThrough");
        await processIndexFundDividendsBatch(db, fundDividendAccruals, {
          turn: typeof turn === "number" ? turn : undefined,
        });
      } else {
        const { processIndexFundDividend } = await import("@/lib/indexFunds/dividendPassThrough");
        const { getFundById, listFundPositions } = await import("@/lib/indexFunds/fundQueries");
        type FundDividendPrefetch = NonNullable<
          NonNullable<Parameters<typeof processIndexFundDividend>[5]>["prefetch"]
        >;
        const accrualsByFund = new Map<
          string,
          {
            fundId: (typeof fundDividendAccruals)[number]["fundId"];
            list: typeof fundDividendAccruals;
          }
        >();
        for (const accrual of fundDividendAccruals) {
          if (!Number.isFinite(accrual.amountAnchor) || accrual.amountAnchor <= 0) continue;
          const key = accrual.fundId.toString();
          const entry = accrualsByFund.get(key);
          if (entry) entry.list.push(accrual);
          else accrualsByFund.set(key, { fundId: accrual.fundId, list: [accrual] });
        }
        await Promise.all(
          [...accrualsByFund.values()].map(async ({ fundId, list }) => {
            // Read the fund + its unit-holder positions ONCE per fund, then reuse
            // across all of this fund's accruals, they're constant during
            // dividend processing (see processIndexFundDividend's prefetch doc).
            let prefetch: FundDividendPrefetch | undefined;
            try {
              const fund = await getFundById(db, fundId);
              if (fund) prefetch = { fund, positions: await listFundPositions(db, fundId) };
            } catch {
              prefetch = undefined; // fall back to per-call fetch on any read hiccup
            }
            for (const [index, accrual] of list.entries()) {
              await processIndexFundDividend(
                db,
                accrual.fundId,
                accrual.amountAnchor,
                accrual.corporationId,
                accrual.shares,
                {
                  turn: typeof turn === "number" ? turn : undefined,
                  prefetch,
                  payoutKey: String(index),
                }
              );
            }
          })
        );
      }
    }
  }
}
