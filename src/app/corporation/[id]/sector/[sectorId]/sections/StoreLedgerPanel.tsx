"use client";

import { useCurrency } from "@/contexts/CurrencyContext";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commoditiesCore";
import { MONEY_PERIOD_FACTOR } from "@/lib/constants/moneyTimescale";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { StoreLedgerView } from "@/lib/stores/rules/storeLedgerView";

const COST_LABELS: Record<StoreLedgerView["runningCostRows"][number]["key"], string> = {
  wages: "Wages",
  site: "Site bills",
  inputs: "Running supplies",
  other: "Other running costs",
};

/**
 * A store's last settled turn. Revenue is the full value of the goods
 * households bought through the store; the store paid producers the market
 * price for them, and the difference is its markup:
 *
 *   revenue - cost of goods resold = markup (gross profit)
 *   markup  - running costs        = profit
 */
export default function StoreLedgerPanel({
  ledger,
  liquidCurrencyCode,
}: {
  ledger: StoreLedgerView;
  liquidCurrencyCode?: string | null;
}) {
  const { formatAmount } = useCurrency();
  const code = (liquidCurrencyCode as CurrencyCode | undefined) ?? undefined;
  const money = (daily: number) => formatAmount(daily * MONEY_PERIOD_FACTOR.turn, code);
  const noSales = ledger.soldToHouseholds <= 0;
  return (
    <section
      aria-labelledby="store-ledger-heading"
      className="mb-6 rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="store-ledger-heading" className="text-body-lg font-semibold">
        Store sales, per turn
      </h2>
      <p className="mt-1 text-body-sm text-muted">
        Households in this state buy groceries, electronics and consumer goods through stores. The
        store pays producers the market price, so its revenue is the full value of the goods it sold
        and its gross profit is the markup. Each line below adds up to the next.
      </p>
      <dl className="mt-3 divide-y divide-border text-body-sm">
        <Row strong label="Revenue (goods sold to households)" value={money(ledger.revenue)} />
        <Row label="Cost of goods resold" value={`- ${money(ledger.costOfGoods)}`} />
        {ledger.wholesaleByCommodity.map((row) => (
          <Row
            key={row.commodity}
            indent
            label={COMMODITY_LABELS[row.commodity as CommodityType] ?? row.commodity}
            value={money(row.value)}
          />
        ))}
        <Row
          strong
          label={
            ledger.markupRate != null
              ? `Markup (gross profit, ${percent(ledger.markupRate)} of cost)`
              : "Markup (gross profit)"
          }
          value={money(ledger.grossProfit)}
        />
        <Row label="Running costs" value={`- ${money(ledger.runningCosts)}`} />
        {ledger.runningCostRows
          .filter((row) => row.key !== "other" || Math.abs(row.value) > 1e-9)
          .map((row) => (
            <Row key={row.key} indent label={COST_LABELS[row.key]} value={money(row.value)} />
          ))}
        <Row strong label="Profit (markup minus running costs)" value={money(ledger.margin)} />
      </dl>
      {ledger.capacityUsedShare != null && (
        <p className="mt-3 text-body-sm text-muted">
          Capacity used: {percent(ledger.capacityUsedShare)}. A store pays wages, site bills and
          running supplies only for the capacity its sales need; the rest stands idle and pays only
          its upkeep.
        </p>
      )}
      {noSales && (
        <p className="mt-3 text-body-sm text-muted">
          No household bought through this store last turn. Other stores in the state, or households
          buying direct from producers, took the demand.
        </p>
      )}
    </section>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function Row({
  label,
  value,
  indent,
  strong,
}: {
  label: string;
  value: string;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${indent ? "pl-4 text-muted" : ""}`}>
      <dt className={strong ? "font-semibold" : ""}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
