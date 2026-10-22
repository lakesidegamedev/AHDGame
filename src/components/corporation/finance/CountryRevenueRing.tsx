"use client";

import { brandShades, resolveCorpColor } from "@/lib/corporations/brandColor";
import { RingChart } from "../ledger/RingChart";
import type { LedgerSegment } from "../ledger/seriesColours";
import { signTone, Td, Th } from "../dense/DenseKit";
import type { Financials } from "../CorporationPageTypes";

type CountryRow = NonNullable<Financials["byCountry"]>[number];

/** Named slices before the smallest fold into "Other"; more is unreadable on a phone. */
const MAX_NAMED = 6;

/**
 * Revenue by country: a ring sized by revenue and a table with each country's
 * plants, share and result. Slices are shades of the corporation's own colour
 * (the convention for one corporation's breakdowns), assigned in a fixed
 * country order so a country keeps its shade when the ranking changes. Red and
 * green stay free for the result column. Choosing a country selects it.
 */
export function CountryRevenueRing({
  rows,
  countryName,
  brandColor,
  corpId,
  money,
  signed,
  onSelect,
}: {
  rows: CountryRow[];
  countryName: (countryId: string) => string;
  brandColor: string | null | undefined;
  corpId: string;
  /** Formats a daily figure for the current period. */
  money: (daily: number) => string;
  signed: (daily: number) => string;
  onSelect: (countryId: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.revenue), 0);
  if (!(total > 0)) return null;

  const fixedOrder = rows.map((r) => r.countryId).sort();
  const shades = brandShades(resolveCorpColor(brandColor, corpId), fixedOrder.length + 1);
  const shadeOf = (countryId: string) => shades[fixedOrder.indexOf(countryId)];

  const named = rows.length > MAX_NAMED ? rows.slice(0, MAX_NAMED - 1) : rows;
  const rest = rows.slice(named.length);
  const segments: LedgerSegment[] = named.map((r) => ({
    key: r.countryId,
    label: countryName(r.countryId),
    value: Math.max(0, r.revenue),
    display: money(r.revenue),
    color: shadeOf(r.countryId),
  }));
  if (rest.length > 0) {
    const restRevenue = rest.reduce((sum, r) => sum + Math.max(0, r.revenue), 0);
    segments.push({
      key: "other",
      label: `${rest.length} other ${rest.length === 1 ? "country" : "countries"}`,
      value: restRevenue,
      display: money(restRevenue),
      color: shades[fixedOrder.length],
    });
  }
  const share = (revenue: number) => `${((Math.max(0, revenue) / total) * 100).toFixed(1)}%`;

  return (
    <div className="mb-4 grid items-center gap-x-8 gap-y-4 border-b border-card-border pb-4 sm:grid-cols-[170px_minmax(0,1fr)]">
      <RingChart
        segments={segments}
        label={`Revenue by country: ${segments.map((s) => `${s.label} ${share(s.value)}`).join(", ")}`}
        centreLabel="Revenue"
        centreValue={money(total)}
        legend={false}
      />
      <div className="min-w-0 overflow-x-auto">
        <table aria-label="Revenue by country" className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Country</Th>
              <Th align="right">Plants</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Share</Th>
              <Th align="right" title="Revenue less the costs and tax of this country's own plants">
                Result
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.countryId} className="hover:bg-card-elevated/40">
                <Td numeric={false}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.countryId)}
                    className="inline-flex items-center gap-2 text-left text-foreground hover:underline"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ background: shadeOf(r.countryId) }}
                    />
                    {countryName(r.countryId)}
                  </button>
                </Td>
                <Td align="right" className="text-muted">
                  {r.sectorCount.toLocaleString("en-US")}
                </Td>
                <Td align="right">{money(r.revenue)}</Td>
                <Td align="right" className="text-muted">
                  {share(r.revenue)}
                </Td>
                <Td align="right" className={signTone(r.result)}>
                  {signed(r.result)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
