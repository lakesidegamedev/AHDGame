/**
 * Canonical capture of everything the corporation turn persists.
 *
 * The turn hands back bulkWrite operations, payment maps and totals; nothing
 * here may depend on object identity or insertion order that the database does
 * not also fix, so the capture sorts keys and map entries. A golden hash of
 * this document is the equivalence gate for the sector CPU work: the turn must
 * write the same sector documents, the same corporation cash figures and the
 * same internal supply transfers, byte for byte, after the rewrite.
 */
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { SectorCalculationsResult } from "../types";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map)
    return [...value.entries()]
      .map(([key, entry]) => [String(key), canonical(entry)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, entry]) => ({ [key]: entry }));
  if (value instanceof Set) return [...value].map(canonical).sort();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "function") return "fn";
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort())
      out[key] = canonical((value as Record<string, unknown>)[key]);
    return out;
  }
  return String(value);
}

/** One sector document write, as the turn would send it. */
function captureSectorOps(result: Pick<SectorCalculationsResult, "sectorOps">): Json {
  return canonical(
    result.sectorOps.map((op) => ({
      id: op.updateOne.filter._id,
      set: op.updateOne.update.$set,
    }))
  );
}

/** One corporation write, as the turn would send it. */
function captureCorpOps(result: Pick<SectorCalculationsResult, "corpOps">): Json {
  return canonical(
    result.corpOps.map((op) => ({
      filter: (op as { updateOne: { filter: unknown } }).updateOne.filter,
      update: (op as { updateOne: { update: unknown } }).updateOne.update,
    }))
  );
}

/**
 * Fields the shadow stamps with compute or wall time. They are telemetry about
 * the run, not its result, so they never enter the golden.
 */
const SHADOW_VOLATILE_FIELDS: ReadonlySet<string> = new Set([
  "at",
  "codeSha",
  "ms",
  "msOnTurn",
  "stageMs",
]);

export interface ShadowCapture {
  plants: number;
  skipped: number;
  prices: number;
  nextPrices: number;
  householdSpend: number;
  publicSpend: number;
  accounts: number;
  carriedPlants: number;
  payables: number;
  sha256: string;
}

/**
 * The producer-market shadow's whole persistent surface, hashed: the turn
 * summary and the carry state the next shadow turn opens from. The shadow is
 * telemetry, but it must compute the same market no matter how its isolation
 * and document copies are made cheaper, so this capture is part of the same
 * golden gate.
 */
export function captureProducerShadow(documents: {
  summary: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}): ShadowCapture {
  const strip = (doc: Record<string, unknown> | null) =>
    doc == null
      ? null
      : Object.fromEntries(Object.entries(doc).filter(([key]) => !SHADOW_VOLATILE_FIELDS.has(key)));
  const document = canonical({
    summary: strip(documents.summary),
    state: strip(documents.state),
  });
  const summary = documents.summary as {
    plants?: number;
    skipped?: number;
    prices?: unknown[];
    nextPrices?: unknown[];
    householdSpend?: number;
    publicSpend?: number;
  } | null;
  const state = documents.state as {
    accounts?: Record<string, number>;
    plants?: Record<string, unknown>;
    payables?: unknown[];
  } | null;
  return {
    plants: summary?.plants ?? -1,
    skipped: summary?.skipped ?? -1,
    prices: summary?.prices?.length ?? 0,
    nextPrices: summary?.nextPrices?.length ?? 0,
    householdSpend: summary?.householdSpend ?? 0,
    publicSpend: summary?.publicSpend ?? 0,
    accounts: Object.keys(state?.accounts ?? {}).length,
    carriedPlants: Object.keys(state?.plants ?? {}).length,
    payables: state?.payables?.length ?? 0,
    sha256: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
  };
}

interface TurnCapture {
  sectors: number;
  sectorOps: number;
  corpOps: number;
  totalRevenueGenerated: number;
  totalIncomeGenerated: number;
  sectorsProcessed: number;
  sha256: string;
}

/**
 * Hash the whole persisted surface of one turn: every sector `$set`, every
 * corporation update, and every payment/telemetry map the phase hands on.
 */
export function captureTurn(
  result: SectorCalculationsResult & Record<string, unknown>
): TurnCapture {
  const payment = (map: unknown) => canonical(map);
  const document = {
    sectorOps: captureSectorOps(result),
    corpOps: captureCorpOps(result),
    manufacturingDevelopmentCashOps: canonical(result.manufacturingDevelopmentCashOps),
    ceoSalaryPayments: payment(result.ceoSalaryPayments),
    dividendPayments: payment(result.dividendPayments),
    capitalDividendPayments: payment(result.capitalDividendPayments),
    passThroughTaxedDividendPayments: payment(result.passThroughTaxedDividendPayments),
    corpDividendTaxedAtSourceAnchorByCorpId: payment(
      result.corpDividendTaxedAtSourceAnchorByCorpId
    ),
    corpDividendPaymentsAnchorByCorpId: payment(result.corpDividendPaymentsAnchorByCorpId),
    corpDividendPaymentsAnchorByCorpCurrency: payment(
      result.corpDividendPaymentsAnchorByCorpCurrency
    ),
    sectorFxSpreadFees: canonical(result.sectorFxSpreadFees),
    fundDividendAccruals: canonical(result.fundDividendAccruals),
    equityPoolDividendAccruals: canonical(result.equityPoolDividendAccruals),
    domesticIncomeByCountry: payment(result.domesticIncomeByCountry),
    foreignIncomeByCountry: payment(result.foreignIncomeByCountry),
    domesticIncomeByOperatingState: payment(result.domesticIncomeByOperatingState),
    foreignIncomeByOperatingState: payment(result.foreignIncomeByOperatingState),
    growthInvestmentByOperatingState: payment(result.growthInvestmentByOperatingState),
    profitMarginByCorpId: payment(result.profitMarginByCorpId),
    labourWageIndexByState: payment(result.labourWageIndexByState),
    automationIndexByState: payment(result.automationIndexByState),
    labourDemandByState: payment(result.labourDemandByState),
    labourDemandWageIndexByState: payment(result.labourDemandWageIndexByState),
    strikeEvents: canonical(result.strikeEvents),
    capacityBindingEvents: canonical(result.capacityBindingEvents),
    settledMarketingSpendAnchorByBuyerId: payment(result.settledMarketingSpendAnchorByBuyerId),
    advertisingDeliveredAnchorBySellerId: payment(result.advertisingDeliveredAnchorBySellerId),
    totalRevenueGenerated: result.totalRevenueGenerated,
    totalIncomeGenerated: result.totalIncomeGenerated,
    sectorsProcessed: result.sectorsProcessed,
  };
  const sha256 = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  return {
    sectors: (document.sectorOps as unknown[]).length,
    sectorOps: (document.sectorOps as unknown[]).length,
    corpOps: (document.corpOps as unknown[]).length,
    totalRevenueGenerated: result.totalRevenueGenerated,
    totalIncomeGenerated: result.totalIncomeGenerated,
    sectorsProcessed: result.sectorsProcessed,
    sha256,
  };
}
