"use client";

import { useState } from "react";
import Link from "next/link";
import { CorporationLogo } from "@/components/corporation/CorporationLogo";
import { formatUnits } from "../lib/helpers";
import { PER_TURN } from "@/lib/commodities/perTurnUnits";
import { listRowsWithOthers, type MarketRow } from "../lib/marketRows";
import type { FundedCountryMarket } from "@/lib/market/producerMarket/fundedCountryViewRules";
import { formatCurrencyFull } from "@/lib/utils/formatters";
import type { MarketingBudget, CorpVolume, SyntheticDemandSource } from "../types";
import { COMMODITY_LABELS, EXTRACTABLE_RESOURCES } from "@/lib/constants/commoditiesCore";
import {
  governmentBoughtGoods,
  governmentBuysCommodity,
} from "@/lib/market/governmentCommodityDemand";

const PAGE_SIZE = 10;

interface TopProducersConsumersProps {
  topProducers: CorpVolume[];
  topConsumers: CorpVolume[];
  marketingBudgets?: MarketingBudget[];
  syntheticDemandSources: SyntheticDemandSource[];
  unit: string;
  commodity: string;
  consumerNote?: string;
  /** Units supplied to this market, so listed buyer receipts can be reconciled against it. */
  marketSupply?: number;
  /** Recorded demand for this market, so the listed buyers can be reconciled against it. */
  marketDemand?: number;
  marketLabel?: string;
  /** The funded market in scope; with its split the lists add up to its totals. */
  market?: FundedCountryMarket | null;
  /** True when company rows are what each company offered and ordered on the market. */
  settled?: boolean;
}

/** Says governments do not buy this good, naming what they do buy. Null when they buy it. */
export function governmentDemandNote(commodity: string): string | null {
  if (governmentBuysCommodity(commodity)) return null;
  const bought = governmentBoughtGoods().map(
    (g) =>
      `${(COMMODITY_LABELS[g.commodity] ?? g.commodity).toLowerCase()}${g.plannedOnly ? " (planned economies only)" : ""}`
  );
  const list =
    bought.length > 1 ? `${bought.slice(0, -1).join(", ")} and ${bought.at(-1)}` : bought[0];
  return `Governments do not buy this good. They buy only ${list}.`;
}

/**
 * Demand the listed buyers do not account for, so the list sums to the market
 * total. Only meaningful when buyers carry recorded orders (funded markets).
 * `unlisted` is the positive remainder; `over` is how far the listed buyers
 * exceed recorded demand when company figures (estimated from plant output)
 * overshoot it.
 */
export function unlistedDemand(
  demand: number | undefined,
  consumers: readonly { units: number }[],
  sources: readonly SyntheticDemandSource[]
): { unlisted: number; over: number } | null {
  if (demand == null || !(demand > 0)) return null;
  if (!sources.some((s) => s.receivedUnits != null)) return null;
  const listed =
    consumers.reduce((sum, c) => sum + Math.max(0, c.units), 0) +
    sources.reduce((sum, s) => sum + Math.max(0, s.units), 0);
  const gap = Math.round((demand - listed) * 100) / 100;
  return gap >= 0 ? { unlisted: gap, over: 0 } : { unlisted: 0, over: -gap };
}

/** Non-company buyer receipts against market supply. Null without received figures. */
export function buyerFillNotes(
  sources: readonly SyntheticDemandSource[],
  supply: number | undefined,
  unit: string
): { totals: string; sharing: string | null } | null {
  const funded = sources.filter((s) => s.receivedUnits != null);
  if (funded.length === 0) return null;
  const ordered = funded.reduce((sum, s) => sum + s.units, 0);
  const received = funded.reduce((sum, s) => sum + (s.receivedUnits ?? 0), 0);
  const rest =
    supply != null && supply >= received
      ? ` The rest of the ${formatUnits(supply, unit)} supplied went to the companies listed or was not sold.`
      : "";
  return {
    totals: `These buyers ordered ${formatUnits(ordered, unit)} and received ${formatUnits(received, unit)}.${rest}`,
    sharing:
      received < ordered
        ? "When supply is short, company plant orders are filled first. Government orders at the same price share what is left in proportion to what each asked for. Households and other buyers follow in a fixed order. Each buyer can also only spend its budget, so fill rates differ."
        : null,
  };
}

function Pagination({
  page,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-card-border">
      <span className="text-xs text-muted tabular-nums">
        {start}–{end} of {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded-md border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ‹ Prev
        </button>
        <button
          onClick={onNext}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded-md border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

function MarketingBudgets({
  rows,
  marketLabel,
}: {
  rows: MarketingBudget[];
  marketLabel?: string;
}) {
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  return (
    <div className="rounded-xl border border-card-border bg-card p-6 sm:col-span-2">
      <h2 className="text-lg font-bold text-foreground mb-1">Marketing budgets by company</h2>
      <p className="text-xs text-muted mb-3">
        Current configured daily budgets in ₳, the game&apos;s shared accounting unit (not pegged to
        any currency)
        {marketLabel ? `; companies by headquarters in the ${marketLabel.toLowerCase()}` : ""}.{" "}
        These are not settled spending or recorded demand. Budgets may be limited by funding and
        delivery.
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-muted">
          No companies with positive marketing budgets in this market.
        </p>
      )}
      <div className="space-y-2">
        {rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((c, i) => (
          <Link
            key={c.corpId}
            href={`/corporation/${c.sequentialId ?? c.corpId}`}
            className="flex items-center justify-between text-sm hover:bg-card-elevated/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted tabular-nums font-mono w-4 text-right shrink-0">
                {(currentPage - 1) * PAGE_SIZE + i + 1}
              </span>
              <CorporationLogo
                logoUrl={c.logoUrl}
                name={c.name}
                size="h-5 w-5"
                className="rounded border border-card-border bg-card-elevated"
              />
              <span className="text-foreground font-medium truncate">{c.name}</span>
              {c.typeLabel && (
                <span className="text-[10px] text-muted shrink-0">{c.typeLabel}</span>
              )}
            </div>
            <span className="text-foreground font-medium tabular-nums shrink-0 ml-2">
              {formatCurrencyFull(c.dailyBudgetAnchor, "₳")} per day (24 turns)
            </span>
          </Link>
        ))}
      </div>
      <Pagination
        page={currentPage}
        total={rows.length}
        onPrev={() => setPage(Math.max(1, currentPage - 1))}
        onNext={() => setPage(currentPage + 1)}
      />
    </div>
  );
}

export default function TopProducersConsumers({
  topProducers,
  topConsumers,
  marketingBudgets,
  syntheticDemandSources,
  unit,
  commodity,
  consumerNote,
  marketSupply,
  marketDemand,
  marketLabel,
  market,
  settled = false,
}: TopProducersConsumersProps) {
  const [producerPage, setProducerPage] = useState(1);
  const [consumerPage, setConsumerPage] = useState(1);

  const showMarketingBudgets = commodity === "advertising" && marketingBudgets !== undefined;
  // Mining supply on this surface is the nameplate/state-capacity basis, not the
  // units actually dug, so the caption must not call it output volume.
  const extractionBasis = (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity);

  if (
    !showMarketingBudgets &&
    topProducers.length === 0 &&
    topConsumers.length === 0 &&
    syntheticDemandSources.length === 0
  )
    return null;

  // Shares are of the corporate producers listed, not of total market supply.
  const producerTotalUnits = topProducers.reduce((sum, c) => sum + Math.max(0, c.units), 0);
  const pagedProducers = topProducers.slice(
    (producerPage - 1) * PAGE_SIZE,
    producerPage * PAGE_SIZE
  );
  const fillNotes = buyerFillNotes(syntheticDemandSources, marketSupply, unit);
  const governmentNote = governmentDemandNote(commodity);
  const demandGap = unlistedDemand(marketDemand, topConsumers, syntheticDemandSources);
  // With a settled split, each list ends with every other seller or buyer so
  // the rows add up to the market's supply and demand.
  const producerExtra =
    settled && market ? listRowsWithOthers(topProducers, market.supplyBy, "sellers") : null;
  const consumerExtra =
    settled && market ? listRowsWithOthers(topConsumers, market.demandBy, "buyers") : null;
  const pagedConsumers = topConsumers.slice(
    (consumerPage - 1) * PAGE_SIZE,
    consumerPage * PAGE_SIZE
  );

  return (
    <div className="grid sm:grid-cols-2 gap-6 mb-6">
      {topProducers.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">Top producers</h2>
          <p className="text-xs text-muted mb-3">
            {settled
              ? "Companies by units offered on the market, with their share of what companies offered. With the rows below they add up to the market's supply"
              : extractionBasis
                ? "Largest corporations by production capacity, not dug output, with their share of the capacity listed here. Not market share: it leaves out any other supply"
                : "Largest corporations by estimated output, with their share of the corporate output listed here. These are model estimates, not in the same unit as the market totals, and not market share"}
            {marketLabel ? ` in the ${marketLabel.toLowerCase()}` : ""}
            {settled ? `. Figures are ${PER_TURN}.` : "."}
          </p>
          <div className="space-y-2">
            {pagedProducers.map((c, i) => (
              <Link
                key={c.corpId}
                href={`/corporation/${c.sequentialId ?? c.corpId}`}
                className="flex items-center justify-between text-sm hover:bg-card-elevated/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted tabular-nums font-mono w-4 text-right shrink-0">
                    {(producerPage - 1) * PAGE_SIZE + i + 1}
                  </span>
                  <CorporationLogo
                    logoUrl={c.logoUrl}
                    name={c.name}
                    size="h-5 w-5"
                    className="rounded border border-card-border bg-card-elevated"
                  />
                  <span className="text-foreground font-medium truncate">{c.name}</span>
                  {c.typeLabel && (
                    <span className="text-[10px] text-muted shrink-0">{c.typeLabel}</span>
                  )}
                </div>
                <span className="text-success font-medium tabular-nums shrink-0 ml-2">
                  {formatUnits(c.units, unit)}
                  {producerTotalUnits > 0 && (
                    <span className="ml-1.5 text-xs text-muted">
                      {Math.round((Math.max(0, c.units) / producerTotalUnits) * 100)}%
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
          {producerExtra && market && (
            <ListTotals
              rows={producerExtra}
              totalLabel="Total offered"
              total={market.supply}
              unit={unit}
            />
          )}
          <Pagination
            page={producerPage}
            total={topProducers.length}
            onPrev={() => setProducerPage((p) => Math.max(1, p - 1))}
            onNext={() =>
              setProducerPage((p) => Math.min(Math.ceil(topProducers.length / PAGE_SIZE), p + 1))
            }
          />
        </div>
      )}

      {(topConsumers.length > 0 || syntheticDemandSources.length > 0) && (
        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">Top consumers</h2>
          <p className="text-xs text-muted mb-3">
            {settled
              ? "Companies by units ordered on the market (plant inputs and marketing). With the rows below they add up to the market's demand"
              : "Largest corporations by estimated input demand (model estimates, not in the same unit as the market totals)"}
            {!settled &&
              commodity === "advertising" &&
              " (plant inputs only; excludes marketing budgets)"}
            {marketLabel ? ` in the ${marketLabel.toLowerCase()}` : ""}
            {settled ? `. Figures are ${PER_TURN}.` : "."}
          </p>
          {consumerNote && <p className="text-xs text-muted mb-3">{consumerNote}</p>}
          {governmentNote && <p className="text-xs text-muted mb-3">{governmentNote}</p>}
          {fillNotes && (
            <p className="text-xs text-muted mb-3">
              {fillNotes.totals}
              {fillNotes.sharing ? ` ${fillNotes.sharing}` : ""}
            </p>
          )}
          {demandGap && (
            <p className="text-xs text-muted mb-3">
              Company figures are estimated from plant output and utilisation, not recorded orders.
              {demandGap.over > 0
                ? ` The listed buyers add up to ${formatUnits(demandGap.over, unit)} more than the recorded demand of ${formatUnits(marketDemand ?? 0, unit)}.`
                : ""}
            </p>
          )}
          <div className="space-y-2">
            {pagedConsumers.map((c, i) => (
              <Link
                key={c.corpId}
                href={`/corporation/${c.sequentialId ?? c.corpId}`}
                className="flex items-center justify-between text-sm hover:bg-card-elevated/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted tabular-nums font-mono w-4 text-right shrink-0">
                    {(consumerPage - 1) * PAGE_SIZE + i + 1}
                  </span>
                  <CorporationLogo
                    logoUrl={c.logoUrl}
                    name={c.name}
                    size="h-5 w-5"
                    className="rounded border border-card-border bg-card-elevated"
                  />
                  <span className="text-foreground font-medium truncate">{c.name}</span>
                  {c.typeLabel && (
                    <span className="text-[10px] text-muted shrink-0">{c.typeLabel}</span>
                  )}
                </div>
                <span className="text-error font-medium tabular-nums shrink-0 ml-2">
                  {formatUnits(c.units, unit)}
                </span>
              </Link>
            ))}
            {!consumerExtra &&
              consumerPage === Math.max(1, Math.ceil(topConsumers.length / PAGE_SIZE)) &&
              syntheticDemandSources?.map((source) => (
                <div
                  key={source.name}
                  className="flex items-center justify-between text-sm -mx-2 px-2 py-1 rounded-lg bg-card-elevated/30 border border-dashed border-card-border"
                  title={source.description}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted tabular-nums font-mono w-4 text-right shrink-0">
                      ⚙
                    </span>
                    <span className="text-muted font-medium truncate">{source.name}</span>
                    <span className="text-[10px] text-muted shrink-0">
                      {source.receivedUnits != null ? "Buyer" : "System"}
                    </span>
                  </div>
                  <span className="text-muted font-medium tabular-nums shrink-0 ml-2 text-right">
                    {formatUnits(source.units, unit)}
                    {source.receivedUnits != null && (
                      <span className="block text-[10px] font-normal">
                        {formatUnits(source.receivedUnits, unit)} received
                      </span>
                    )}
                  </span>
                </div>
              ))}
            {!consumerExtra &&
              consumerPage === Math.max(1, Math.ceil(topConsumers.length / PAGE_SIZE)) &&
              demandGap &&
              demandGap.unlisted > 0 && (
                <div
                  className="flex items-center justify-between text-sm -mx-2 px-2 py-1 rounded-lg bg-card-elevated/30 border border-dashed border-card-border"
                  title="Recorded demand that is not matched to a listed company or buyer group."
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted tabular-nums font-mono w-4 text-right shrink-0">
                      ⚙
                    </span>
                    <span className="text-muted font-medium truncate">Other buyers</span>
                    <span className="text-[10px] text-muted shrink-0">Unlisted</span>
                  </div>
                  <span className="text-muted font-medium tabular-nums shrink-0 ml-2 text-right">
                    {formatUnits(demandGap.unlisted, unit)}
                  </span>
                </div>
              )}
          </div>
          {consumerExtra && market && (
            <ListTotals
              rows={consumerExtra}
              totalLabel="Total ordered"
              total={market.demand}
              unit={unit}
            />
          )}
          <Pagination
            page={consumerPage}
            total={topConsumers.length}
            onPrev={() => setConsumerPage((p) => Math.max(1, p - 1))}
            onNext={() =>
              setConsumerPage((p) => Math.min(Math.ceil(topConsumers.length / PAGE_SIZE), p + 1))
            }
          />
        </div>
      )}
      {showMarketingBudgets && (
        <MarketingBudgets key={marketLabel} rows={marketingBudgets} marketLabel={marketLabel} />
      )}
    </div>
  );
}

/** The rows after the listed companies, then the total they all add up to. */
function ListTotals({
  rows,
  totalLabel,
  total,
  unit,
}: {
  rows: readonly MarketRow[];
  totalLabel: string;
  total: number;
  unit: string;
}) {
  return (
    <div className="mt-2 space-y-1 border-t border-card-border pt-2" data-testid="list-totals">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between text-sm">
          <span className="text-muted">{r.label}</span>
          <span className="tabular-nums text-muted">{formatUnits(r.units, unit)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="text-foreground">{totalLabel}</span>
        <span className="tabular-nums text-foreground">
          {formatUnits(total, unit)} {PER_TURN}
        </span>
      </div>
    </div>
  );
}
