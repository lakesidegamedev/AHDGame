import { RingChart } from "../ledger/RingChart";
import { type LedgerSegment, SERIES_ORDER } from "../ledger/seriesColours";
import type { BalanceSheet } from "../CorporationPageTypes";

/**
 * The asset and claim rings for the balance sheet. Asset segments are the
 * components the server sums into totalAssets, so the ring adds up to the
 * displayed total; bank equity and escrow are not part of that sum.
 */
export function balanceSheetSegments(
  sheet: BalanceSheet,
  fmt: (n: number) => string
): { assets: LedgerSegment[]; claims: LedgerSegment[] } {
  const a = sheet.assets;
  const assetLines: Array<[string, string, number | undefined]> = [
    ["sector", "Sector NPV", a.totalSectorNPV],
    ["cash", "Cash", a.cashOnHand],
    ["bank-valuation", "Bank valuation", a.bankValuation],
    ["bank-npv", "Banking NPV", a.bankNPV],
    ["stock", "Stock holdings", a.stockHoldingsValue],
    ["bond", "Bond holdings", a.bondHoldingsValue],
    ["fund", "Index fund holdings", a.fundHoldingsValue],
    ["imf", "IMF facility loans", a.imfFacilityReceivablesValue],
    ["tech", "Technology", a.techAssetValue],
  ];
  const assets = assetLines
    .filter((line): line is [string, string, number] => isPositive(line[2]))
    .sort((x, y) => y[2] - x[2])
    .map(([key, label, value], i) => ({
      key,
      label,
      value,
      display: fmt(value),
      tone: SERIES_ORDER[i % SERIES_ORDER.length],
    }));

  const { totalDebt, bondCount } = sheet.liabilities;
  const claims: LedgerSegment[] = [];
  if (isPositive(sheet.equity.bookValue)) {
    claims.push({
      key: "book",
      label: "Book value",
      value: sheet.equity.bookValue,
      display: fmt(sheet.equity.bookValue),
      tone: "success",
    });
  }
  if (isPositive(totalDebt)) {
    claims.push({
      key: "debt",
      label: `Bond debt, ${bondCount} ${bondCount === 1 ? "issue" : "issues"}`,
      value: totalDebt,
      display: fmt(totalDebt),
      tone: "error",
    });
  }
  return { assets, claims };
}

function isPositive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** What the corporation owns, beside who has a claim on it. */
export function BalanceSheetRings({
  sheet,
  fmt,
}: {
  sheet: BalanceSheet;
  fmt: (n: number) => string;
}) {
  const { assets, claims } = balanceSheetSegments(sheet, fmt);
  const debt = sheet.liabilities.totalDebt;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <RingChart
        segments={assets}
        label={`Assets, total ${fmt(sheet.assets.totalAssets)}`}
        centreLabel="Total"
        centreValue={fmt(sheet.assets.totalAssets)}
      />
      <div className="min-w-0">
        <RingChart
          segments={claims}
          label={`Liabilities and equity, book value ${fmt(sheet.equity.bookValue)}`}
          centreLabel="Book value"
          centreValue={fmt(sheet.equity.bookValue)}
        />
        <p className="mt-2 flex items-center justify-between text-xs">
          {isPositive(debt) ? (
            <>
              <span className="text-muted">Total liabilities</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {fmt(debt)}
              </span>
            </>
          ) : (
            <span className="text-muted">No outstanding debt</span>
          )}
        </p>
      </div>
    </div>
  );
}
