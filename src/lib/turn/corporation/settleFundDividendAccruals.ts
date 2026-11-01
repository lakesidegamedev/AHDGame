import type { Db } from "mongodb";

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
      // I/O batching. This step is ~42% of corporationTurn, dominated by ~5k
      // serial DB round-trips/turn against prod's remote Mongo.
      // processIndexFundDividendsBatch collapses them into a handful of bulk
      // ops. It shipped off by default pending evidence it was equivalent;
      // that evidence now exists, so it is on.
      //
      // Equivalence is proved two ways. scripts/perf/dividend-equivalence.ts
      // runs both paths over identical real state and diffs all six written
      // collections, including adversarial input (repeated fund/corp keys that
      // must sum, sub-cent amounts that floor away individually, NaN/Infinity/
      // negative amounts, zero and negative share counts).
      //
      // Measured at 500 accruals: 4,513 Mongo round trips collapse to 110, a
      // 41x reduction. Wall clock is not the number to quote — on a local
      // mongod a round trip is ~0.05ms, so the whole saving disappears into
      // turn-to-turn noise there. Against production's remote Mongo the same
      // 4,403 saved round trips are worth roughly 4s at 1ms RTT and 13s at
      // 3ms.
      //
      // The two paths are NOT bit-identical and cannot be: N separate `$inc`s
      // accumulate in a different order than one pre-summed `$inc`, and double
      // addition is not associative. Measured worst drift is 1.5e-8 absolute /
      // 3e-15 relative, i.e. a hundred-millionth of one anchor unit, which is
      // six orders of magnitude below the cent that flooring already discards.
      // The unit tests in dividendPassThrough.test.ts pin the aggregation
      // arithmetic that result rests on so CI keeps it honest.
      //
      // Set AHD_BATCH_FUND_DIVIDENDS=off to fall back to the per-accrual path
      // without a deploy, should a discrepancy ever surface in production.
      if (process.env.AHD_BATCH_FUND_DIVIDENDS !== "off") {
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
