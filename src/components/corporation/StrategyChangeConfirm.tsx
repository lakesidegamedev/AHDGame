"use client";

import { readRetoolQuote, type RetoolQuote } from "@/lib/corporations/rules/retoolQuote";
import { useWorldFlags } from "@/hooks/useWorldFlags";
import { useEffect, useState } from "react";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import {
  getSectorStrategies,
  getStrategy,
  STRATEGY_COOLDOWN_TURNS,
  STRATEGY_TRANSITION_MARGIN_PENALTY,
  STRATEGY_TRANSITION_TURNS,
  type SectorStrategy,
} from "@/lib/constants/sectorStrategies";
import {
  COMMODITY_LABELS,
  COMMODITY_ICONS,
  COMMODITY_LOG_K,
  COMMODITY_PER_ITEM_CAP,
  computeEffectiveCommodityPressureRatio,
  type CommodityType,
} from "@/lib/constants/commodities";
import { methodBuildDelayTurns } from "@/lib/corporations/rules/methodAdoption";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fetchJson } from "@/lib/observability/fetchJson";

interface StrategyChangeConfirmProps {
  sectorType: OperatingSectorType;
  mediaOperatingModelsEnabled?: boolean;
  currentStrategyId: string;
  targetStrategyId: string;
  liquidCurrencyCode?: string | null;
  quote?: RetoolQuote;
  quoteUrl?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

type MarketStatus = "oversupplied" | "balanced" | "undersupplied";
type CommodityMarket = { globalSupply: number; globalDemand: number };

/** Rates are shares of output; show them as units per 100 units of output. */
function per100(rate: number): string {
  return String(Math.round(rate * 100));
}

function getMarketStatus(supply: number, demand: number): MarketStatus {
  if (supply <= 0 && demand <= 0) return "balanced";
  const ratio = demand / Math.max(supply, 0.01);
  if (ratio > 1.05) return "undersupplied";
  if (ratio < 0.95) return "oversupplied";
  return "balanced";
}

const STATUS_STYLE: Record<MarketStatus, string> = {
  oversupplied: "text-warning",
  balanced: "text-success",
  undersupplied: "text-error",
};

const STATUS_LABEL: Record<MarketStatus, string> = {
  oversupplied: "surplus",
  balanced: "balanced",
  undersupplied: "shortage",
};

/**
 * Estimate commodity margin modifier for a set of supply/demand rates
 * using global market data. Simplified version of server-side computation
 * (global-only, no state blending — close enough for a preview).
 */
function estimateCommodityMargin(
  supplyRates: Partial<Record<CommodityType, number>>,
  demandRates: Partial<Record<CommodityType, number>>,
  marketData: Record<string, CommodityMarket>
): number {
  let margin = 0;

  // Surplus bonus for outputs (selling into demand)
  for (const [commodity, rate] of Object.entries(supplyRates)) {
    const m = marketData[commodity];
    if (!m || !rate) continue;
    const pressure = computeEffectiveCommodityPressureRatio(m.globalSupply, m.globalDemand);
    const per = COMMODITY_LOG_K * rate * Math.log(pressure);
    margin += Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, per));
  }

  // Input cost modifier for inputs (buying from supply)
  for (const [commodity, rate] of Object.entries(demandRates)) {
    const m = marketData[commodity];
    if (!m || !rate) continue;
    const pressure = computeEffectiveCommodityPressureRatio(m.globalSupply, m.globalDemand);
    const per = -COMMODITY_LOG_K * rate * Math.log(pressure);
    margin += Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, per));
  }

  return Math.round(margin * 10) / 10;
}

export default function StrategyChangeConfirm({
  sectorType,
  mediaOperatingModelsEnabled,
  currentStrategyId,
  targetStrategyId,
  liquidCurrencyCode,
  quote: suppliedQuote,
  quoteUrl,
  onConfirm,
  onCancel,
  loading,
}: StrategyChangeConfirmProps) {
  const { formatAmount } = useCurrency();
  const liquidCode =
    (liquidCurrencyCode as import("@/lib/constants/currencies").CurrencyCode | null | undefined) ??
    undefined;
  const fmtMoney = (anchor: number) => formatAmount(anchor, liquidCode);
  const quoteKey = `${quoteUrl ?? ""}:${targetStrategyId}`;
  const [quoted, setQuoted] = useState<{ key: string; quote: RetoolQuote | null } | null>(null);
  const quote = suppliedQuote ?? (quoted?.key === quoteKey ? quoted.quote : null);
  useEffect(() => {
    if (suppliedQuote || !quoteUrl) return;
    const controller = new AbortController();
    fetchJson<{ strategy?: { availableStrategies?: ({ id: string } & Partial<RetoolQuote>)[] } }>(
      quoteUrl,
      { signal: controller.signal, feature: "retool-quote" }
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        const quote = readRetoolQuote(
          data.strategy?.availableStrategies?.find((row) => row.id === targetStrategyId)
        );
        setQuoted({ key: quoteKey, quote });
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuoted({ key: quoteKey, quote: null });
      });
    return () => controller.abort();
  }, [suppliedQuote, quoteUrl, quoteKey, targetStrategyId]);
  const [marketData, setMarketData] = useState<Record<string, CommodityMarket>>({});

  useEffect(() => {
    let cancelled = false;
    fetchJson<{
      commodities?: {
        commodity: string;
        globalSupply: number;
        globalDemand: number;
      }[];
    }>("/api/commodities", { feature: "commodities-market" })
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, CommodityMarket> = {};
        for (const c of data.commodities ?? []) {
          map[c.commodity] = {
            globalSupply: c.globalSupply,
            globalDemand: c.globalDemand,
          };
        }
        setMarketData(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const { preset } = useWorldFlags();
  const strategies = getSectorStrategies(sectorType, mediaOperatingModelsEnabled === true, preset);
  if (!strategies) return null;

  const current = getStrategy(sectorType, currentStrategyId, preset);
  const target = strategies.find((s) => s.id === targetStrategyId) as SectorStrategy | undefined;
  if (!current || !target) return null;

  const downsideCharge = quote?.downsideCharge ?? 0;
  const retoolCostMultiplier = quote?.retoolCostMultiplier ?? 1;
  const buildDelay = methodBuildDelayTurns(target);
  const sunsetDiscount =
    retoolCostMultiplier < 1 && !quote?.freeConversion && !quote?.shortageDiscount;
  const hasMarketData = Object.keys(marketData).length > 0;

  // Estimate commodity margin impact
  const currentMargin = hasMarketData
    ? estimateCommodityMargin(current.supply, current.demand, marketData)
    : null;
  const targetMargin = hasMarketData
    ? estimateCommodityMargin(target.supply, target.demand, marketData)
    : null;
  const marginDelta =
    currentMargin != null && targetMargin != null ? targetMargin - currentMargin : null;

  // Build commodity change rows — group by commodity, showing what changes
  const allCommodities = new Map<
    CommodityType,
    { oldSupply: number; newSupply: number; oldDemand: number; newDemand: number }
  >();

  for (const key of [
    ...Object.keys(current.supply),
    ...Object.keys(target.supply),
    ...Object.keys(current.demand),
    ...Object.keys(target.demand),
  ] as CommodityType[]) {
    if (!allCommodities.has(key)) {
      allCommodities.set(key, {
        oldSupply: current.supply[key] ?? 0,
        newSupply: target.supply[key] ?? 0,
        oldDemand: current.demand[key] ?? 0,
        newDemand: target.demand[key] ?? 0,
      });
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3 shadow-lg space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-foreground">Switch to {target.name}?</span>
        <span className="text-body-sm text-error font-medium">
          {quote ? (
            <>Retooling cost {fmtMoney(quote.retoolCost)}</>
          ) : quoted?.key === quoteKey ? (
            "Retool quote unavailable. Reload before switching."
          ) : (
            "Loading current retool quote..."
          )}
          {sunsetDiscount && (
            <span className="ml-1 text-success">
              ({Math.round((1 - retoolCostMultiplier) * 100)}% off: replaces a retired method)
            </span>
          )}
        </span>
      </div>

      {/* Description */}
      <p className="text-body-sm text-muted">{target.description}</p>
      {downsideCharge > 0 && (
        <p className="text-body-sm text-muted">
          Downside charge {fmtMoney(downsideCharge)}, included above
          {target.downside ? `: ${target.downside}` : "."}
        </p>
      )}

      {quote?.foreignSpread ? (
        <p className="text-body-sm text-muted">
          Currency conversion charge {fmtMoney(quote.foreignSpread)}, included above.
        </p>
      ) : null}
      {quote?.freeConversion && (
        <p className="text-body-sm text-success">
          The base retool fee is waived for this conversion. Any downside and currency charges are
          included above.
        </p>
      )}
      {quote?.shortageDiscount && (
        <p className="text-body-sm text-success">
          The base retool fee is waived to supply a resource in shortage. Any downside and currency
          charges are included above.
        </p>
      )}
      {/* Commodity changes table */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-body-sm font-semibold text-foreground border-b border-card-border">
            <th className="text-left py-1 font-semibold">Commodity</th>
            <th
              className="text-right py-1 pr-1.5 font-semibold"
              title="Units produced per 100 units of output, old then new"
            >
              Makes
            </th>
            <th
              className="text-right py-1 pr-1.5 font-semibold"
              title="Units used per 100 units of output, old then new"
            >
              Needs
            </th>
            <th
              className="text-right py-1 font-semibold"
              title="World supply against world demand right now"
            >
              World market
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from(allCommodities.entries()).map(
            ([commodity, { oldSupply, newSupply, oldDemand, newDemand }]) => {
              const supplyChanged = oldSupply !== newSupply;
              const demandChanged = oldDemand !== newDemand;
              const m = marketData[commodity];
              const status = m ? getMarketStatus(m.globalSupply, m.globalDemand) : undefined;

              return (
                <tr key={commodity} className="text-body-sm border-b border-card-border/30">
                  <td className="py-0.5 pr-1">
                    <span className="flex items-center gap-1">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-card-elevated text-body-sm font-bold text-muted">
                        {COMMODITY_ICONS[commodity]}
                      </span>
                      <span
                        className="text-muted truncate max-w-[120px]"
                        title={COMMODITY_LABELS[commodity]}
                      >
                        {COMMODITY_LABELS[commodity]}
                      </span>
                    </span>
                  </td>
                  <td className="py-0.5 tabular-nums text-right pr-1.5">
                    {supplyChanged ? (
                      <span>
                        <span className="text-muted">{per100(oldSupply)}</span>
                        <span className="text-muted/50 mx-0.5">→</span>
                        <span
                          className={
                            newSupply > oldSupply
                              ? "text-blue-400 font-medium"
                              : newSupply === 0
                                ? "text-error/70"
                                : "text-blue-400/60"
                          }
                        >
                          {per100(newSupply)}
                        </span>
                      </span>
                    ) : oldSupply > 0 ? (
                      <span className="text-muted/50">{per100(oldSupply)}</span>
                    ) : (
                      <span className="text-muted/30">0</span>
                    )}
                  </td>
                  <td className="py-0.5 tabular-nums text-right pr-1.5">
                    {demandChanged ? (
                      <span>
                        <span className="text-muted">{per100(oldDemand)}</span>
                        <span className="text-muted/50 mx-0.5">→</span>
                        <span
                          className={
                            newDemand > oldDemand
                              ? "text-amber-400 font-medium"
                              : newDemand === 0
                                ? "text-success/70"
                                : "text-amber-400/60"
                          }
                        >
                          {per100(newDemand)}
                        </span>
                      </span>
                    ) : oldDemand > 0 ? (
                      <span className="text-muted/50">{per100(oldDemand)}</span>
                    ) : (
                      <span className="text-muted/30">0</span>
                    )}
                  </td>
                  <td className="py-0.5 text-right">
                    {status && (
                      <span className={`text-body-sm ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            }
          )}
        </tbody>
      </table>

      {/* Margin estimate */}
      {marginDelta != null && (
        <div className="flex items-center justify-between text-body-sm bg-background rounded px-2 py-1">
          <span
            className="text-muted"
            title="Rough estimate from current world prices. Percentage points of margin."
          >
            Estimated margin from commodity prices
          </span>
          <span className="tabular-nums">
            <span className="text-muted">
              {currentMargin! >= 0 ? "+" : ""}
              {currentMargin!.toFixed(1)}%
            </span>
            <span className="text-muted/50 mx-1">→</span>
            <span
              className={
                targetMargin! > currentMargin!
                  ? "text-success font-medium"
                  : targetMargin! < currentMargin!
                    ? "text-error font-medium"
                    : "text-muted"
              }
            >
              {targetMargin! >= 0 ? "+" : ""}
              {targetMargin!.toFixed(1)}%
            </span>
            <span
              className={`ml-1.5 ${marginDelta > 0 ? "text-success" : marginDelta < 0 ? "text-error" : "text-muted"}`}
            >
              ({marginDelta > 0 ? "+" : ""}
              {marginDelta.toFixed(1)})
            </span>
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-body-sm text-muted">
          {buildDelay > 0 && `Runs your current method for ${buildDelay} turns while it is built. `}
          Phases in over {quote?.transitionTurns ?? STRATEGY_TRANSITION_TURNS} turns, costs{" "}
          {Math.abs(STRATEGY_TRANSITION_MARGIN_PENALTY)} points of margin meanwhile, and locks
          further changes for {STRATEGY_COOLDOWN_TURNS} turns.
        </span>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded border border-card-border px-2.5 py-1 text-body-sm text-muted hover:bg-card-elevated disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !quote}
            className="rounded bg-primary px-3 py-1 text-body-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
          >
            {loading ? "Switching" : "Switch strategy"}
          </button>
        </span>
      </div>
    </div>
  );
}
