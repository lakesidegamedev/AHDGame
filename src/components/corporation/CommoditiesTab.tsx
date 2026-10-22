"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CorpCommodityFlow, CorpCommodityRegion } from "@/lib/corporations/corpCommodityFlows";
import type { CorpMarketSharePosition } from "@/lib/corporations/corpMarketShare";
import { DenseSection, TableScroll, Td, Th } from "./dense/DenseKit";
import { DataBar } from "./dense/InlineViz";

interface CommoditiesResponse {
  clearingEnabled: boolean;
  ledgerEnabled?: boolean;
  brandLoyaltyEnabled?: boolean;
  brandLoyaltySliceEnabled?: boolean;
  sectorQualityEnabled?: boolean;
  supplyAgreementsEnabled?: boolean;
  commodities: CorpCommodityFlow[];
  regions: CorpCommodityRegion[];
  marketShare?: CorpMarketSharePosition[];
  isPrivate?: boolean;
}

/** Compact unit formatter — thousands separators, at most one decimal. */
function fmtUnits(n: number): string {
  const abs = Math.abs(n);
  const decimals = abs > 0 && abs < 10 ? 1 : 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/**
 * Corporation-level commodity flows: what this corporation produces and
 * consumes each turn, global stockpile context, CEO links, and the breakdown by
 * state, as two tables.
 */
export default function CommoditiesTab({
  corpId,
  isCeo = false,
  modViewEnabled = false,
}: {
  corpId: string;
  loading?: boolean;
  isCeo?: boolean;
  modViewEnabled?: boolean;
}) {
  const { formatAmount } = useCurrency();
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = modViewEnabled
          ? `/api/corporations/${corpId}/commodities?modView=1`
          : `/api/corporations/${corpId}/commodities`;
        const res = await fetch(url);
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        // ignore — render empty state below
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [corpId, modViewEnabled]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const commodities = data?.commodities ?? [];
  const regions = data?.regions ?? [];

  if (commodities.length === 0) {
    return (
      <DenseSection title="Commodity flows">
        <p className="py-2 text-xs text-muted">
          {data?.isPrivate
            ? "Commodity flows are not disclosed for private corporations."
            : "This corporation isn't producing or consuming any commodities yet."}
        </p>
      </DenseSection>
    );
  }

  const features = [
    data?.clearingEnabled && "posted pricing (clearing)",
    data?.brandLoyaltyEnabled &&
      `brand loyalty${data.brandLoyaltySliceEnabled ? " (live in clearing)" : " (shadow accrual)"}`,
    data?.sectorQualityEnabled && "output quality",
    data?.supplyAgreementsEnabled && "supply agreements",
  ].filter(Boolean) as string[];

  const units = (n: number) => (n > 0 ? fmtUnits(n) : "");
  const money = (n: number | null) => (n == null ? "" : formatAmount(n));
  const netTone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-error" : "text-muted");

  // A commodity the corporation both makes and uses sits in both tables.
  const inputs = commodities.filter((c) => c.consumptionUnits > 0);
  const outputs = commodities.filter((c) => c.outputUnits > 0);
  const flowMeta = (rows: CorpCommodityFlow[], amount: (c: CorpCommodityFlow) => number) => {
    const priced = rows.filter((c) => c.market.price != null);
    const total = priced.reduce((sum, c) => sum + amount(c) * (c.market.price ?? 0), 0);
    const count = `${rows.length} ${rows.length === 1 ? "commodity" : "commodities"}`;
    return priced.length > 0 ? `${count}, ${formatAmount(total)} per turn` : count;
  };

  const stockCells = (c: CorpCommodityFlow) => {
    const pooled = [
      c.market.surplusUnitsPooled != null && c.market.surplusUnitsPooled > 0
        ? `Pooled surplus ${fmtUnits(c.market.surplusUnitsPooled)}`
        : null,
      c.market.unmetDemandUnitsPooled != null && c.market.unmetDemandUnitsPooled > 0
        ? `Pooled unmet demand ${fmtUnits(c.market.unmetDemandUnitsPooled)}`
        : null,
    ]
      .filter(Boolean)
      .join(". ");
    return (
      <>
        <Td align="right" className="text-foreground" title={pooled || undefined}>
          {pooled ? (
            <span className="cursor-help underline decoration-muted decoration-dotted underline-offset-2">
              {c.market.stockUnits != null ? fmtUnits(c.market.stockUnits) : "pooled"}
            </span>
          ) : c.market.stockUnits != null ? (
            fmtUnits(c.market.stockUnits)
          ) : (
            ""
          )}
        </Td>
        <Td align="right" className="text-foreground">
          {c.market.coverTurns != null ? `${c.market.coverTurns.toFixed(1)}t` : ""}
        </Td>
        <Td numeric={false} className="text-xs">
          <Link
            href={`/commodity/${c.commodity}`}
            className="text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground"
          >
            Market
          </Link>
        </Td>
      </>
    );
  };

  const commodityCell = (c: CorpCommodityFlow) => (
    <Td>
      <span className="text-foreground">{c.label}</span>{" "}
      <span className="text-[11px] text-muted">{c.unit}</span>
    </Td>
  );
  const priceCell = (c: CorpCommodityFlow) => (
    <Td align="right" className="text-muted">
      {c.market.price != null ? formatAmount(c.market.price) : ""}
    </Td>
  );
  const stockHeads = (
    <>
      <Th align="right" title="Global stock in the market ledger">
        Stock
      </Th>
      <Th align="right" title="Turns of global demand the stock covers">
        Cover
      </Th>
      <Th>
        <span className="sr-only">Market</span>
      </Th>
    </>
  );

  // A render helper, not a component: one declared in this body would get a new
  // identity every render and remount.
  function renderFlowTable({
    id,
    title,
    rows,
    meta,
    empty,
  }: {
    id: string;
    title: "Inputs" | "Outputs";
    rows: CorpCommodityFlow[];
    meta: string;
    empty: string;
  }) {
    const isInputs = title === "Inputs";
    const cols = isInputs ? 7 : 9;
    return (
      <div className="pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-border pb-1">
          <h3 id={id} className="text-[13px] font-semibold text-foreground">
            {title}
          </h3>
          <span className="text-xs text-muted">{meta}</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-muted">{empty}</p>
        ) : (
          <TableScroll>
            <table aria-labelledby={id} className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Commodity</Th>
                  <Th align="right">Price</Th>
                  {isInputs ? (
                    <>
                      <Th align="right">Consumed</Th>
                      <Th
                        align="right"
                        title="Consumption valued at the current market price, per turn"
                      >
                        Cost
                      </Th>
                    </>
                  ) : (
                    <>
                      <Th align="right">Output</Th>
                      <Th align="right" title="Output valued at the current market price, per turn">
                        Value
                      </Th>
                      <Th align="right" title="Own output minus own input use">
                        Net production
                      </Th>
                      <Th align="right" title="Net production valued at the current market price">
                        Net value
                      </Th>
                    </>
                  )}
                  {stockHeads}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const price = c.market.price ?? null;
                  const ps = isInputs ? c.privateSupply : undefined;
                  return (
                    <Fragment key={c.commodity}>
                      <tr className="hover:bg-card-elevated/40">
                        {commodityCell(c)}
                        {priceCell(c)}
                        {isInputs ? (
                          <>
                            <Td align="right" className="text-foreground">
                              {units(c.consumptionUnits)}
                            </Td>
                            <Td align="right" className="text-muted">
                              {price != null ? money(c.consumptionUnits * price) : ""}
                            </Td>
                          </>
                        ) : (
                          <>
                            <Td align="right" className="text-foreground">
                              {units(c.outputUnits)}
                            </Td>
                            <Td align="right" className="text-muted">
                              {price != null ? money(c.outputUnits * price) : ""}
                            </Td>
                            <Td align="right" className={netTone(c.netUnits)}>
                              {c.netUnits > 0 ? "+" : ""}
                              {fmtUnits(c.netUnits)}
                            </Td>
                            <Td align="right" className={netTone(c.netUnits)}>
                              {price != null
                                ? `${c.netUnits > 0 ? "+" : ""}${formatAmount(c.netUnits * price)}`
                                : ""}
                            </Td>
                          </>
                        )}
                        {stockCells(c)}
                      </tr>
                      {ps && <PrivateSupplyRow c={c} ps={ps} cols={cols} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DenseSection
        title="Per-turn commodity flows"
        meta={`${commodities.length} ${commodities.length === 1 ? "commodity" : "commodities"}`}
      >
        <p className="py-1 text-xs text-muted">
          Net production is this corporation&apos;s own output minus its input use. Purchases do not
          change it. The private supply line under a commodity shows where consumed inputs came
          from. Stock and cover are the world&apos;s shadow inventory from the market ledger, not
          this corporation&apos;s.
        </p>
        {features.length > 0 && (
          <p className="pb-1 text-xs text-muted">
            Market features on: {features.join(", ")}.
            {isCeo && data?.supplyAgreementsEnabled && (
              <>
                {" "}
                Private supply deals are under{" "}
                <Link
                  href={`/corporation/${corpId}?tab=commodities#supply-agreements`}
                  className="text-foreground underline underline-offset-2"
                >
                  Supply agreements
                </Link>
                .
              </>
            )}
          </p>
        )}
        {renderFlowTable({
          id: "flows-inputs",
          title: "Inputs",
          rows: inputs,
          meta: flowMeta(inputs, (c) => c.consumptionUnits),
          empty: "This corporation consumes no commodities.",
        })}
        {renderFlowTable({
          id: "flows-outputs",
          title: "Outputs",
          rows: outputs,
          meta: flowMeta(outputs, (c) => c.outputUnits),
          empty: "This corporation produces no commodities.",
        })}
      </DenseSection>

      {regions.length > 0 && (
        <RegionBreakdown
          key={corpId}
          regions={regions}
          commodities={commodities}
          formatAmount={formatAmount}
        />
      )}
    </div>
  );
}

const REGION_COLS = 7;

interface RegionLine {
  commodity: string;
  label: string;
  unit: string;
  units: number;
  /** Units at the current market price; null when the commodity has no price. */
  value: number | null;
}

interface ValueSum {
  total: number;
  /** At least one line had a price to add. */
  priced: boolean;
  /** At least one line had no price, so the total leaves it out. */
  partial: boolean;
}

/** Where consumed inputs came from, under an input row that has a supply agreement. */
function PrivateSupplyRow({
  c,
  ps,
  cols,
}: {
  c: CorpCommodityFlow;
  ps: NonNullable<CorpCommodityFlow["privateSupply"]>;
  cols: number;
}) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="border-b border-card-border/60 pb-2 pl-4 pr-2 text-xs text-muted"
      >
        <span className="font-medium text-foreground">Private supply</span>{" "}
        <span className="font-mono tabular-nums text-foreground">
          {fmtUnits(ps.consumptionCoveredUnits)} of {fmtUnits(ps.consumptionUnits)} {c.unit}{" "}
          consumed came from private supply.
        </span>{" "}
        <span>
          {fmtUnits(Math.max(0, ps.consumptionUnits - ps.consumptionCoveredUnits))} {c.unit} came
          from the open market or other sources.
        </span>{" "}
        <span className="tabular-nums">
          Delivered on turn {ps.turn}. {fmtUnits(ps.coveragePercent)}% covered. Contracted cap:{" "}
          {fmtUnits(ps.contractedUnits)} {c.unit}/turn.
        </span>
        {ps.previousTurn !== undefined &&
          ps.previousDeliveredUnits !== undefined &&
          ps.previousConsumptionUnits !== undefined && (
            <span className="tabular-nums">
              {" "}
              Previous turn {ps.previousTurn}: {fmtUnits(ps.previousDeliveredUnits)} delivered
              against {fmtUnits(ps.previousConsumptionUnits)} consumed.
            </span>
          )}{" "}
        <span>
          Delivery can be below the cap when the supplier cannot cover all active agreements or when
          your corporation consumes less. Scarce supplier output is divided proportionally across
          active agreements.
        </span>
      </td>
    </tr>
  );
}

function sumValue(lines: RegionLine[]): ValueSum {
  let total = 0;
  let priced = false;
  let partial = false;
  for (const line of lines) {
    if (line.value == null) partial = true;
    else {
      total += line.value;
      priced = true;
    }
  }
  return { total, priced, partial };
}

/**
 * The per-state table: one row per state summarising what its plants consume
 * and produce, opening into the two lists (inputs left, outputs right) with
 * each commodity's units and market value. Values use the same current market
 * price as the flows table above, not what the plants actually paid.
 */
function RegionBreakdown({
  regions,
  commodities,
  formatAmount,
}: {
  regions: CorpCommodityRegion[];
  commodities: CorpCommodityFlow[];
  formatAmount: (amount: number) => string;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const byCommodity = new Map(commodities.map((c) => [c.commodity, c]));

  const toggle = (stateId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(stateId)) next.delete(stateId);
      else next.add(stateId);
      return next;
    });

  const lineOf = (row: CorpCommodityRegion["rows"][number], units: number): RegionLine => {
    const flow = byCommodity.get(row.commodity);
    const price = flow?.market.price;
    return {
      commodity: row.commodity,
      label: row.label,
      unit: flow?.unit ?? "",
      units,
      value: price != null && Number.isFinite(price) ? units * price : null,
    };
  };

  const fmtTotal = (sum: ValueSum) => (sum.priced ? formatAmount(sum.total) : "");
  const partialNote = "Excludes commodities with no market price.";

  return (
    <DenseSection title="By region" meta="units per turn, valued at market price">
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>State</Th>
              <Th>Consumes</Th>
              <Th>Produces</Th>
              <Th align="right" title="Consumption valued at the current market price, per turn">
                Input cost
              </Th>
              <Th align="right" title="Output valued at the current market price, per turn">
                Output value
              </Th>
              <Th align="right">Net value</Th>
              <Th>
                <span className="sr-only">Details</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => {
              const inputs = r.rows
                .filter((row) => row.consumptionUnits > 0)
                .map((row) => lineOf(row, row.consumptionUnits));
              const outputs = r.rows
                .filter((row) => row.outputUnits > 0)
                .map((row) => lineOf(row, row.outputUnits));
              const inSum = sumValue(inputs);
              const outSum = sumValue(outputs);
              const net = outSum.total - inSum.total;
              const partial = inSum.partial || outSum.partial;
              const hasLines = inputs.length + outputs.length > 0;
              const anyPriced = inSum.priced || outSum.priced;
              const isOpen = hasLines && open.has(r.stateId);
              const panelId = `commodities-region-${r.stateId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
              // One scale per state so a state's inputs and outputs compare directly.
              const maxUnits = Math.max(
                0,
                ...inputs.map((l) => l.units),
                ...outputs.map((l) => l.units)
              );
              const summary = (lines: RegionLine[]) =>
                lines.map((l) => `${l.label} ${fmtUnits(l.units)}`).join(", ");

              return (
                <Fragment key={r.stateId}>
                  <tr className="align-top hover:bg-card-elevated/40">
                    <Td>
                      {hasLines ? (
                        <button
                          type="button"
                          onClick={() => toggle(r.stateId)}
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          className="text-left text-foreground hover:underline"
                        >
                          {r.stateName}
                        </button>
                      ) : (
                        <span className="text-foreground">{r.stateName}</span>
                      )}
                      {r.region && (
                        <span className="ml-1.5 text-[11px] text-muted">{r.region}</span>
                      )}
                    </Td>
                    <Td wrap className="text-xs text-muted">
                      {summary(inputs)}
                    </Td>
                    <Td wrap className="text-xs text-muted">
                      {summary(outputs)}
                    </Td>
                    <Td
                      align="right"
                      className="text-muted"
                      title={inSum.partial ? partialNote : undefined}
                    >
                      {fmtTotal(inSum)}
                    </Td>
                    <Td
                      align="right"
                      className="text-foreground"
                      title={outSum.partial ? partialNote : undefined}
                    >
                      {fmtTotal(outSum)}
                    </Td>
                    <Td
                      align="right"
                      className={net > 0 ? "text-success" : net < 0 ? "text-error" : "text-muted"}
                      title={partial ? partialNote : undefined}
                    >
                      {anyPriced ? `${net > 0 ? "+" : ""}${formatAmount(net)}` : ""}
                    </Td>
                    <Td align="right" numeric={false}>
                      {hasLines && (
                        <button
                          type="button"
                          onClick={() => toggle(r.stateId)}
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${r.stateName} inputs and outputs`}
                          className="inline-flex h-6 items-center rounded-[calc(var(--corp-rad,6px)-2px)] border border-card-border px-2 text-[11px] text-foreground hover:bg-card-elevated"
                        >
                          {isOpen ? "Hide" : "Show"}
                        </button>
                      )}
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td
                        colSpan={REGION_COLS}
                        className="border-b border-card-border/60 bg-card-muted/40 px-2 py-3"
                      >
                        <div id={panelId} className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                          <RegionLines
                            title={`Inputs to ${r.stateName}`}
                            lines={inputs}
                            maxUnits={maxUnits}
                            tone="error"
                            totalLabel="Input cost"
                            total={fmtTotal(inSum)}
                            partialNote={inSum.partial ? partialNote : undefined}
                            empty="Consumes nothing here."
                            formatAmount={formatAmount}
                          />
                          <RegionLines
                            title={`Outputs from ${r.stateName}`}
                            lines={outputs}
                            maxUnits={maxUnits}
                            tone="success"
                            totalLabel="Output value"
                            total={fmtTotal(outSum)}
                            partialNote={outSum.partial ? partialNote : undefined}
                            empty="Produces nothing here."
                            formatAmount={formatAmount}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </DenseSection>
  );
}

function RegionLines({
  title,
  lines,
  maxUnits,
  tone,
  totalLabel,
  total,
  partialNote,
  empty,
  formatAmount,
}: {
  title: string;
  lines: RegionLine[];
  maxUnits: number;
  tone: "success" | "error";
  totalLabel: string;
  total: string;
  partialNote?: string;
  empty: string;
  formatAmount: (amount: number) => string;
}) {
  return (
    <div className="min-w-0">
      <h4 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</h4>
      {lines.length === 0 ? (
        <p className="py-1 text-xs text-muted">{empty}</p>
      ) : (
        <>
          <ul>
            {lines.map((line) => (
              <li
                key={line.commodity}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,5rem)_auto_auto] items-center gap-x-3 border-b border-card-border/60 py-1 text-[13px]"
              >
                <span className="truncate text-foreground">{line.label}</span>
                <DataBar value={line.units} max={maxUnits} tone={tone} />
                <span className="text-right font-mono tabular-nums text-foreground">
                  {fmtUnits(line.units)}
                  {line.unit && (
                    <span className="ml-1 font-sans text-[11px] text-muted">{line.unit}</span>
                  )}
                </span>
                <span className="text-right font-mono tabular-nums text-muted">
                  {line.value == null ? "n/a" : formatAmount(line.value)}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="flex justify-between pt-1.5 text-[13px] font-medium text-foreground"
            title={partialNote}
          >
            <span>{totalLabel}</span>
            <span className="font-mono tabular-nums">{total}</span>
          </p>
        </>
      )}
    </div>
  );
}
