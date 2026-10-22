"use client";

import { RingChart } from "../ledger/RingChart";
import type { LedgerSegment } from "../ledger/seriesColours";
import { signTone, Td, Th } from "../dense/DenseKit";
import type { Financials } from "../CorporationPageTypes";

type CountryRow = NonNullable<Financials["byCountry"]>[number];

/** Named slices before the smallest fold into "Other"; more is unreadable on a phone. */
const MAX_NAMED = 6;

/**
 * Six distinct hues (globals.css, stepped per light or dark theme), in an order
 * validated for colour-blind separation between neighbouring slices, the wrap
 * from last to first included. Red and green are left out: here they mean loss
 * and profit.
 */
const PALETTE = [1, 2, 3, 4, 5, 6].map((n) => `var(--corp-cat-${n})`);
const OTHER_COLOUR = "var(--color-muted)";

/**
 * Revenue by country: a ring sized by revenue and a table with each country's
 * plants, share and result. Each country gets its own hue, assigned in country
 * order rather than by revenue, so a country keeps its colour when the ranking
 * changes. The table names every slice, so colour is never the only label.
 * Choosing a country selects it.
 */
export function CountryRevenueRing({
  rows,
  countryName,
  money,
  signed,
  onSelect,
}: {
  rows: CountryRow[];
  countryName: (countryId: string) => string;
  /** Formats a daily figure for the current period. */
  money: (daily: number) => string;
  signed: (daily: number) => string;
  onSelect: (countryId: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.revenue), 0);
  if (!(total > 0)) return null;

  const named = rows.length > MAX_NAMED ? rows.slice(0, MAX_NAMED - 1) : rows;
  const rest = rows.slice(named.length);
  // Colours follow the country, not its rank: assigned in country order.
  const colourOrder = named.map((r) => r.countryId).sort();
  const shadeOf = (countryId: string) => {
    const i = colourOrder.indexOf(countryId);
    return i >= 0 ? PALETTE[i] : OTHER_COLOUR;
  };
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
      color: OTHER_COLOUR,
    });
  }
  const share = (revenue: number) => `${((Math.max(0, revenue) / total) * 100).toFixed(1)}%`;

  return (
    <div className="mb-4 grid items-center gap-x-8 gap-y-4 border-b border-card-border pb-4 sm:grid-cols-[170px_minmax(0,1fr)]">
      <RingChart
        segments={segments}
        label={`Revenue by country: ${segments.map((s) => `${s.label} ${share(s.value)}`).join(", ")}`}
        centreLabel="Gross revenue"
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
