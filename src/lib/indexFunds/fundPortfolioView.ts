import type { IndexFund, IndexFundPosition } from "@/lib/db/types";

/** One held fund as a portfolio page renders it. */
export interface FundPortfolioPositionView {
  fundId: string;
  slug: string | null;
  name: string | null;
  tickerSymbol: string | null;
  anchorCurrencyCode: string | null;
  units: number;
  legacyUnits: number;
  avgNavAnchor: number | null;
  currentNav: number | null;
  marketValueAnchor: number | null;
  status: string | null;
}

/**
 * Join fund positions to their fund definitions.
 *
 * `/api/character/me` and `/api/character/[id]/fund-portfolio` both show the
 * same holdings, so the join lives here rather than in either route. Values are
 * byte-for-byte what the fund route has always returned: a position whose fund
 * is missing keeps its id in `fundId` and reports nulls for the fund fields.
 */
export function enrichFundPositions(
  positions: IndexFundPosition[],
  funds: IndexFund[]
): FundPortfolioPositionView[] {
  const fundById = new Map(funds.map((fund) => [fund._id.toString(), fund]));
  return positions.map((pos) => {
    const fund = fundById.get(pos.fundId.toString()) ?? null;
    return {
      fundId: fund?.slug ?? pos.fundId.toString(),
      slug: fund?.slug ?? null,
      name: fund?.name ?? null,
      tickerSymbol: fund?.tickerSymbol ?? null,
      anchorCurrencyCode: fund?.anchorCurrencyCode ?? null,
      units: pos.units,
      // #857 grandfather: legacy units redeem rate-free. Default absent ->
      // full position (matches the redeem debit's `legacyUnits ?? units`).
      legacyUnits: pos.legacyUnits ?? pos.units,
      avgNavAnchor: pos.avgNavAnchor ?? null,
      currentNav: fund?.quotedNav ?? null,
      marketValueAnchor: fund ? pos.units * fund.quotedNav : null,
      status: fund?.status ?? null,
    };
  });
}
