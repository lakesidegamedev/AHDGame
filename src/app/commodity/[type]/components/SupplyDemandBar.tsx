"use client";

import { formatUnits } from "../lib/helpers";
import {
  countryBuildOutlook,
  fundedCountryTradeTotals,
  type FundedCountryMarket,
} from "@/lib/market/producerMarket/fundedCountryViewRules";
import { BUILD_OUTLOOK_COPY } from "./CommodityCountryStatCard";
import {
  balanceParts,
  newOutputBalance,
  formatWholeUnits,
  wholeUnitsAddingUp,
  type Segment,
} from "../lib/marketRows";

interface SupplyDemandBarProps {
  supply: number;
  demand: number;
  unit: string;
  marketLabel?: string;
  /** Imports reaching this market; null/undefined when unknown (global view). */
  imports?: number | null;
  /** Last turn's funded book for a country view, with trade both ways. */
  market?: FundedCountryMarket | null;
  /** True for a whole-world view, where trade nets out. */
  world?: boolean;
}

/**
 * Supply and demand for the selected market, as two bars on one scale.
 *
 * The old bar split one strip into "Supply 69% / Demand 31%" and called the
 * gap "oversupplied after imports". It counted imports but not exports, so a
 * country that sold almost everything abroad read as a glut. With a funded
 * book, supply is local offers plus imports and demand is local orders plus
 * exports, the same totals the country popup shows.
 */
export default function SupplyDemandBar({
  supply,
  demand,
  unit,
  marketLabel,
  imports,
  market,
  world = false,
}: SupplyDemandBarProps) {
  const trade = market ? fundedCountryTradeTotals(market) : null;
  const { supplyParts, demandParts, receivedParts } = balanceParts({
    supply,
    demand,
    imports,
    market,
    world,
  });
  const totalSupply = supplyParts.reduce((sum, s) => sum + Math.max(0, s.units), 0);
  const totalDemand = demandParts.reduce((sum, s) => sum + Math.max(0, s.units), 0);
  const scale = Math.max(totalSupply, totalDemand);
  if (scale <= 0) return null;

  const sold = trade?.sold ?? null;
  const verdict = trade
    ? BUILD_OUTLOOK_COPY[countryBuildOutlook(market ?? undefined)]
    : balanceSentence(totalSupply, totalDemand, world);

  return (
    <section
      className="mb-6 rounded-xl border border-card-border bg-card px-5 py-4"
      aria-label="Supply and demand"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-body-lg font-medium text-foreground">Supply and demand</h3>
          {marketLabel && <div className="mt-0.5 text-body-sm text-muted">{marketLabel}</div>}
        </div>
        <span className="text-body-sm text-muted">Per turn, last turn</span>
      </div>

      <div className="mt-3 space-y-3">
        <BalanceRow
          title="Supply"
          tone="text-success"
          total={totalSupply}
          parts={supplyParts}
          scale={scale}
          unit={unit}
        />
        <BalanceRow
          title="Demand"
          tone="text-info"
          total={totalDemand}
          parts={demandParts}
          scale={scale}
          unit={unit}
        />
        {receivedParts && (
          <BalanceRow
            title="Received by buyers"
            tone="text-foreground"
            total={receivedParts.reduce((sum, s) => sum + Math.max(0, s.units), 0)}
            parts={receivedParts}
            scale={scale}
            unit={unit}
          />
        )}
      </div>

      {sold !== null && market && market.supply > 0 && (
        <p className="mt-3 text-body-sm text-muted" data-testid="balance-sold">
          <span className="font-semibold text-foreground">
            {world ? "Sellers sold" : "Local producers sold"} {formatUnits(sold, unit)}
          </span>{" "}
          ({Math.round((100 * sold) / market.supply)}% of their offers, at home and abroad)
        </p>
      )}
      {market && stockNote(market, unit) && (
        <p className="mt-2 text-body-sm text-muted" data-testid="balance-stock">
          {stockNote(market, unit)}
        </p>
      )}
      <p className="mt-2 text-body-sm leading-relaxed text-muted" data-testid="balance-verdict">
        {verdict}
      </p>
    </section>
  );
}

function BalanceRow({
  title,
  tone,
  total,
  parts,
  scale,
  unit,
}: {
  title: string;
  tone: string;
  total: number;
  parts: Segment[];
  scale: number;
  unit: string;
}) {
  const shown = parts.filter((p) => p.units > 0);
  // Whole units, rounded so the rows shown add up exactly to the total shown.
  const whole = wholeUnitsAddingUp(parts.map((p) => p.units));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-body-sm font-semibold ${tone}`}>{title}</span>
        <span className="text-body font-bold tabular-nums text-foreground">
          {parts.length > 0 ? formatWholeUnits(whole.total, unit) : formatUnits(total, unit)}
        </span>
      </div>
      <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-card-elevated">
        {shown.map((p) => (
          <div
            key={p.label}
            className={`h-full ${p.className}`}
            style={{ width: `${(100 * p.units) / scale}%` }}
            title={`${p.label}: ${formatUnits(p.units, unit)} per turn`}
          />
        ))}
      </div>
      {parts.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-body-sm text-muted tabular-nums">
          {parts.map((p, i) => (
            <span key={p.label} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${p.className}`} aria-hidden />
              {p.label} {formatWholeUnits(whole.parts[i] ?? 0, unit)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Old stock in plain words: how much of the supply was stock from earlier
 * turns, and how new output alone compared with orders. Null without stock.
 */
export function stockNote(
  market: { supply: number; demand: number; carriedStock?: number },
  unit: string
): string | null {
  const b = newOutputBalance(market);
  if (!(b.stock > 0)) return null;
  const share = b.newRatio == null ? null : Math.round(b.newRatio * 100);
  return `${formatUnits(b.stock, unit)} of the supply is unsold stock from earlier turns.${
    share == null ? "" : ` New output alone was ${share}% of what buyers ordered.`
  }`;
}

/** Plain balance for views without a traded book. Never calls a gap "unsold". */
export function balanceSentence(supply: number, demand: number, world: boolean): string {
  const tradeNote = world
    ? ""
    : " Goods also move to and from other markets, so a gap here does not mean goods went unsold.";
  if (demand <= 0) return "No buyers placed orders here." + tradeNote;
  if (supply <= 0) return "Nothing was offered here." + tradeNote;
  const ratio = supply / demand;
  if (ratio > 1.05)
    return `Producers offered ${Math.round((ratio - 1) * 100)}% more than buyers ordered.${tradeNote}`;
  if (ratio < 0.95)
    return `Buyers ordered ${Math.round((1 / Math.max(ratio, 1e-9) - 1) * 100)}% more than producers offered.${tradeNote}`;
  return "Offers and orders were roughly even." + tradeNote;
}
