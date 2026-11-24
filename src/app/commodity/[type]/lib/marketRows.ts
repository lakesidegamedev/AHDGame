/**
 * The rows behind a market's totals: who offered the supply, who ordered the
 * demand and who received the fills, by kind of account, plus imports and
 * exports. Every block's rows add up to the total it shows. Pure.
 */
import type { FundedCountryMarket } from "@/lib/market/producerMarket/fundedCountryViewRules";
import {
  MARKET_ACCOUNT_KINDS,
  MARKET_KIND_LABELS,
  type MarketAccountKind,
  type UnitsByKind,
} from "@/lib/market/producerMarket/marketAttributionRules";

export interface MarketRow {
  key: string;
  label: string;
  units: number;
}

export interface MarketRowBlock {
  rows: MarketRow[];
  total: number;
}

export interface MarketRows {
  /** Who offered: rows add up to `supply.total`, the market's supply. */
  supply: MarketRowBlock;
  /** Who ordered: rows add up to `demand.total`, the market's demand. */
  demand: MarketRowBlock;
  /** Who received: rows add up to `received.total`; null when fills were not recorded. */
  received: MarketRowBlock | null;
  /** Units bought from other countries; null for the world, where trade nets out. */
  imports: number | null;
  /** Units sold to other countries; null for the world. */
  exports: number | null;
  /** World only: units that crossed a border, already counted once above. */
  crossBorder: number | null;
}

const KIND_ORDER: readonly MarketAccountKind[] = MARKET_ACCOUNT_KINDS;

function block(
  split: UnitsByKind | undefined,
  total: number,
  side: "sellers" | "buyers",
  unattributedLabel: string
): MarketRowBlock {
  const rows: MarketRow[] = [];
  for (const kind of KIND_ORDER) {
    const units = split?.[kind] ?? 0;
    if (!(units > 0)) continue;
    rows.push({ key: kind, label: MARKET_KIND_LABELS[kind][side], units });
  }
  // A book written before attribution has no split: one honest row.
  if (!split && total > 0)
    rows.push({ key: "unattributed", label: unattributedLabel, units: total });
  return { rows, total };
}

/**
 * Rows for one market view. `world` is true for the world market, where
 * imports and exports between countries are internal and shown only as a
 * note. Returns null when the market has no funded book (no rows to show).
 */
export function marketRows(
  market: FundedCountryMarket | null | undefined,
  options: { world: boolean; crossBorder?: number }
): MarketRows | null {
  if (!market) return null;
  return {
    supply: block(market.supplyBy, market.supply, "sellers", "Local offers"),
    demand: block(market.demandBy, market.demand, "buyers", "Local orders"),
    received:
      market.filled === null ? null : block(market.filledBy, market.filled, "buyers", "Received"),
    imports: options.world ? null : market.imports,
    exports: options.world ? null : market.exports,
    crossBorder: options.world ? (options.crossBorder ?? null) : null,
  };
}

/** Sum of a block's rows. */
export function rowsTotal(rows: readonly MarketRow[]): number {
  return rows.reduce((sum, r) => sum + r.units, 0);
}

/**
 * Producer or consumer list rows that add up to the market total: the
 * companies listed, then every other kind of seller or buyer. The company
 * part is the split's company figure, so a list that lacks a company (a
 * corporation renamed or removed) shows the difference as "Other companies".
 */
export function listRowsWithOthers(
  companies: readonly { units: number }[],
  split: UnitsByKind | undefined,
  side: "sellers" | "buyers"
): MarketRow[] | null {
  if (!split) return null;
  const listed = companies.reduce((sum, c) => sum + Math.max(0, c.units), 0);
  const companyTotal = split.company ?? 0;
  const rows: MarketRow[] = [];
  const unlisted = companyTotal - listed;
  if (unlisted > 1e-6 * Math.max(1, companyTotal))
    rows.push({ key: "otherCompanies", label: "Other companies", units: unlisted });
  for (const kind of KIND_ORDER) {
    if (kind === "company") continue;
    const units = split[kind] ?? 0;
    if (units > 0) rows.push({ key: kind, label: MARKET_KIND_LABELS[kind][side], units });
  }
  return rows;
}

/** One coloured part of a supply, demand or received bar. */
export interface Segment {
  label: string;
  units: number;
  className: string;
}

const SELLER_SHADES = [
  "bg-success",
  "bg-success/70",
  "bg-success/55",
  "bg-success/40",
  "bg-success/30",
];
const BUYER_SHADES = [
  "bg-info",
  "bg-info/80",
  "bg-info/65",
  "bg-info/50",
  "bg-info/40",
  "bg-info/30",
];

function shaded(rows: readonly MarketRow[], shades: readonly string[]): Segment[] {
  return rows.map((r, i) => ({
    label: r.label,
    units: r.units,
    className: shades[Math.min(i, shades.length - 1)]!,
  }));
}

/**
 * The bar's segments. With a funded book, supply is split by who offered it
 * plus imports, demand by who ordered it plus substitution orders and
 * exports, and received by who got it, so each row's parts add up to the
 * total it shows. Background economy sellers and buyers are their own parts.
 */
export function balanceParts({
  supply,
  demand,
  imports,
  market,
  world,
}: {
  supply: number;
  demand: number;
  imports?: number | null;
  market?: FundedCountryMarket | null;
  world: boolean;
}): { supplyParts: Segment[]; demandParts: Segment[]; receivedParts: Segment[] | null } {
  const rows = marketRows(market, { world });
  if (market && rows) {
    const supplyParts = shaded(rows.supply.rows, SELLER_SHADES);
    if (!world && market.imports > 0)
      supplyParts.push({ label: "Imports", units: market.imports, className: "bg-success/20" });
    const demandParts = shaded(rows.demand.rows, BUYER_SHADES);
    if (market.spilloverRequested > 0)
      demandParts.push({
        label: "Substitution orders",
        units: market.spilloverRequested,
        className: "bg-info/25",
      });
    if (!world && market.exports > 0)
      demandParts.push({ label: "Exports", units: market.exports, className: "bg-info/20" });
    return {
      supplyParts,
      demandParts,
      receivedParts: rows.received ? shaded(rows.received.rows, BUYER_SHADES) : null,
    };
  }
  const importsKnown = typeof imports === "number" && imports > 0;
  return {
    supplyParts: importsKnown
      ? [
          { label: "Local offers", units: supply, className: "bg-success" },
          { label: "Imports", units: imports ?? 0, className: "bg-success/45" },
        ]
      : [{ label: "Offered", units: supply, className: "bg-success" }],
    demandParts: [{ label: "Ordered", units: demand, className: "bg-info" }],
    receivedParts: null,
  };
}
