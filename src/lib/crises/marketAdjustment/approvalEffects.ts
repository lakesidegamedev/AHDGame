/**
 * Shell for the Market Adjustment approval chip: finds each country's open (or
 * recently closed) event and turns the measured loss share and unemployment
 * into the named modifier the approval snapshot applies. The arithmetic is in
 * `approvalRules.ts`.
 */
import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import type { ActiveModifier } from "@/lib/utils/approvalModifiers";
import { getNationalDocId } from "@/lib/constants/nationalScope";
import { FADE_TURNS, marketAdjustmentApproval } from "./approvalRules";
import { MARKET_ADJUSTMENT_TEMPLATE_KEY } from "./template";
import { MARKET_ADJUSTMENT_SIGNALS } from "./signals";

/** marketAdjustmentStage at which the unemployment term counts. */
const UNEMPLOYMENT_TERM_STAGE = 2;

interface Point {
  turn: number;
  value: number;
}

/** Latest point at or before `turn`, or undefined. */
export function valueAtOrBefore(points: readonly Point[] | undefined, turn: number) {
  let best: Point | undefined;
  for (const p of points ?? []) {
    if (p.turn <= turn && (!best || p.turn > best.turn)) best = p;
  }
  return best?.value;
}

export interface MarketAdjustmentEffect {
  approval: number;
  lossShare: number | null;
  unemploymentRise: number | null;
  open: boolean;
}

/** countryId -> the chip's value, for every country with an open or fading event. */
export async function loadMarketAdjustmentEffects(
  db: Db,
  turn: number,
  /** gameConfig.marketAdjustmentStage, passed in by the turn so no extra config read happens. */
  stage: number
): Promise<Map<string, MarketAdjustmentEffect>> {
  const out = new Map<string, MarketAdjustmentEffect>();
  if (!(stage >= 1)) return out;
  const crises = await db
    .collection<Crisis>("crises")
    .find(
      {
        templateKey: MARKET_ADJUSTMENT_TEMPLATE_KEY,
        $or: [{ status: "active" }, { status: "resolved", endTurn: { $gte: turn - FADE_TURNS } }],
      },
      { projection: { countryIds: 1, startTurn: 1, endTurn: 1, status: 1 } }
    )
    .toArray();
  if (crises.length === 0) return out;
  // Three batched reads for every country at once, not one set per country.
  const countryIds = [...new Set(crises.flatMap((c) => c.countryIds ?? []))];
  const docIdOf = new Map<string, string>();
  for (const countryId of countryIds) {
    const docId = getNationalDocId(countryId as never);
    if (docId) docIdOf.set(countryId, docId);
  }
  const docIds = [...new Set(docIdOf.values())];
  const [signals, histories, metrics] = await Promise.all([
    db
      .collection<{ _id: string; points?: Point[] }>(MARKET_ADJUSTMENT_SIGNALS)
      .find({ _id: { $in: countryIds } })
      .toArray(),
    db
      .collection<{ _id: string; economic?: { unemploymentRate?: Point[] } }>("macroMetricsHistory")
      .find({ _id: { $in: docIds } }, { projection: { economic: 1 } })
      .toArray(),
    db
      .collection<{ _id: string; economic?: { unemploymentRate?: { value?: number } } }>(
        "macroMetrics"
      )
      .find({ _id: { $in: docIds } }, { projection: { economic: 1 } })
      .toArray(),
  ]);
  const signalById = new Map(signals.map((d) => [d._id, d]));
  const historyById = new Map(histories.map((d) => [d._id, d]));
  const metricsById = new Map(metrics.map((d) => [d._id, d]));
  for (const crisis of crises) {
    const open = crisis.status === "active";
    const asOf = open ? turn : (crisis.endTurn ?? turn);
    for (const countryId of crisis.countryIds ?? []) {
      const docId = docIdOf.get(countryId);
      const lossShare = valueAtOrBefore(signalById.get(countryId)?.points, asOf) ?? null;
      const unemploymentHistory = docId
        ? historyById.get(docId)?.economic?.unemploymentRate
        : undefined;
      const atStart = valueAtOrBefore(unemploymentHistory, crisis.startTurn);
      const atEnd = open
        ? (docId ? metricsById.get(docId) : undefined)?.economic?.unemploymentRate?.value
        : valueAtOrBefore(unemploymentHistory, asOf);
      const unemploymentRise =
        typeof atStart === "number" && typeof atEnd === "number" ? atEnd - atStart : null;
      const effect = marketAdjustmentApproval({
        lossShare,
        unemploymentRise,
        unemploymentEnabled: stage >= UNEMPLOYMENT_TERM_STAGE,
        turnsSinceClose: open ? null : turn - asOf,
      });
      // Two events cannot overlap in one country (cooldown), but keep the worst.
      const prior = out.get(countryId);
      if (!prior || effect.approval < prior.approval)
        out.set(countryId, { approval: effect.approval, lossShare, unemploymentRise, open });
    }
  }
  return out;
}

export function marketAdjustmentApprovalModifiers(
  effect: MarketAdjustmentEffect | undefined
): ActiveModifier[] {
  if (!effect || effect.approval === 0) return [];
  return [
    {
      id: "market_adjustment",
      label: "Market adjustment",
      effect: effect.approval,
      marginEffect: 0,
      source: "market",
    },
  ];
}
