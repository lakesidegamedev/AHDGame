"use client";

import { StatementGroup, StatementLine, StatementTable } from "../dense/DenseKit";
import type { Financials } from "../CorporationPageTypes";

type CountryRow = NonNullable<Financials["byCountry"]>[number];

/**
 * One country's slice of the income statement: what its plants earn and what
 * its plants cost, with the tax charged on them. Formatting comes from the
 * Financials tab so the figures read exactly like the full statement.
 */
export function CountryStatement({
  row,
  name,
  money,
  cost,
  signed,
}: {
  row: CountryRow;
  name: string;
  /** Formats a daily figure for the current period. */
  money: (daily: number) => string;
  /** A daily cost, shown as (x). */
  cost: (daily: number) => string;
  signed: (daily: number) => string;
}) {
  const pct = (daily: number) =>
    row.revenue > 0 ? `${((daily / row.revenue) * 100).toFixed(1)}%` : null;
  const tax = row.federalTax + row.stateTax;
  const lines: Array<[label: string, daily: number, title?: string]> = [
    ["Maintenance", row.maintenanceCosts],
    ["Wages", row.laborCosts],
    ["Freight charges", row.freightCosts],
    ["Growth", row.growthCosts],
    ["Regulatory burden", row.regulatoryBurden],
    [
      "Corporate tax",
      tax,
      `National ${money(row.federalTax)}, regional ${money(row.stateTax)}: the tax charged on this country's plants.`,
    ],
  ];
  return (
    <>
      <StatementTable>
        <StatementGroup>{name}</StatementGroup>
        <StatementLine
          strong
          label={`Gross revenue, ${row.sectorCount} ${row.sectorCount === 1 ? "plant" : "plants"}`}
          amount={money(row.revenue)}
          pct={row.revenue > 0 ? "100%" : null}
        />
        {row.freightIncome > 0 && (
          <StatementLine
            indent
            label="Freight revenue"
            amount={money(row.freightIncome)}
            note="Included in gross revenue"
          />
        )}
        <StatementGroup>Costs of its plants</StatementGroup>
        {lines
          .filter(([, daily]) => daily !== 0)
          .map(([label, daily, title]) => (
            <StatementLine
              key={label}
              indent
              label={label}
              amount={cost(daily)}
              pct={pct(daily)}
              title={title}
            />
          ))}
        <StatementLine
          strong
          label={`Result in ${name}`}
          amount={signed(row.result)}
          amountClass={row.result >= 0 ? "text-success" : "text-error"}
          pct={pct(row.result)}
          title="Gross revenue less the costs and tax of this country's own plants."
        />
      </StatementTable>
      <p className="pt-2 text-xs text-muted">
        Corporation-wide costs (marketing, logistics, R&amp;D, CEO pay, pensions and bond interest)
        belong to no one country, so they appear only under All.
      </p>
    </>
  );
}
