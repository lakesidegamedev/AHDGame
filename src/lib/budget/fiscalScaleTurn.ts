/**
 * Turn shell for the dynamic fiscal scale (stage 1 and up). Reads this turn's
 * funded producer settlements grouped by country, converts them to local
 * currency, runs the rules and stores the result on each budget. Moves no
 * money. Two round trips: one grouped read, one bulk write. Stage 2 adds the
 * tax collection below.
 */
import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { LedgerEntry } from "@/lib/ledger/types";
import { applyMoneyMove, resumeMoneyMove } from "@/lib/banking/moneyMove";
import {
  PRODUCER_ACCOUNTS,
  fiscalTaxMove,
  producerMoveLedgerLegs,
} from "@/lib/market/producerMarket/liveFundingRules";
import type { FederalBudget } from "@/lib/db/types/budget";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import {
  bookNonCorporateRevenuePerTurn,
  fiscalScaleLogLine,
  fiscalTaxCollection,
  medianFallbackFiscalScale,
  medianFiscalScale,
  nextFiscalScale,
  type FiscalScaleState,
} from "@/lib/budget/rules/fiscalScale";

type ScaleBudget = Pick<
  FederalBudget,
  "_id" | "countryId" | "currencyCode" | "gdp" | "fiscalScale"
>;

/** This turn's funded value added per country, in anchor currency. */
export async function loadFundedOutputAnchorByCountry(
  db: Db,
  turn: number
): Promise<Map<string, number>> {
  const rows = await db
    .collection("corporateSectors")
    .aggregate<{ _id: string; valueAdded: number }>([
      { $match: { "producerSettlement.turn": turn } },
      {
        $group: {
          _id: "$countryId",
          valueAdded: {
            $sum: {
              $max: [
                0,
                {
                  $subtract: [
                    { $ifNull: ["$producerSettlement.revenue", 0] },
                    { $ifNull: ["$producerSettlement.inputsConsumed", 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ])
    .toArray();
  const out = new Map<string, number>();
  for (const row of rows)
    if (row._id != null && Number.isFinite(row.valueAdded))
      out.set(String(row._id), row.valueAdded);
  return out;
}

export interface FiscalScaleMeasurement {
  states: Map<string, FiscalScaleState>;
  logLine: string;
}

/**
 * Measure and store every budget's scale for this turn. A budget whose
 * currency has no quote, or whose country settled nothing, carries its last
 * value; one that has never measured a scale borrows the median of the rest.
 * Returns the states by budget id so later stages read the same numbers.
 */
export async function measureFiscalScales(
  db: Db,
  input: {
    turn: number;
    stage: number;
    budgets: readonly ScaleBudget[];
    /** Local currency units per anchor unit. */
    rateByCurrency: ReadonlyMap<string, number>;
  }
): Promise<FiscalScaleMeasurement> {
  const outputAnchor = await loadFundedOutputAnchorByCountry(db, input.turn);
  const states = new Map<string, FiscalScaleState>();
  const logged: { countryId: string; state: FiscalScaleState }[] = [];
  const ops: AnyBulkWriteOperation<FederalBudget>[] = [];
  const measured: Array<{ budget: ScaleBudget; next: FiscalScaleState | null }> = [];
  for (const budget of input.budgets) {
    const countryId = String(budget.countryId ?? budget._id);
    const currency = resolveCountryCurrencyCode(budget) ?? "USD";
    const rate = input.rateByCurrency.get(currency);
    const anchor = outputAnchor.get(countryId);
    const fundedOutputLocal =
      anchor !== undefined && typeof rate === "number" && Number.isFinite(rate) && rate > 0
        ? anchor * rate
        : null;
    const prior = budget.fiscalScale ?? null;
    measured.push({
      budget,
      next: nextFiscalScale(prior, {
        turn: input.turn,
        fundedOutputLocal,
        bookGdpAnnualLocal: budget.gdp ?? 0,
      }),
    });
  }
  // A country with no funded output of its own borrows the median scale of
  // the countries that have one, so its debt service and placement still scale.
  const median = medianFiscalScale(measured.flatMap((row) => (row.next ? [row.next] : [])));
  for (const { budget, next: own } of measured) {
    const countryId = String(budget.countryId ?? budget._id);
    const prior = budget.fiscalScale ?? null;
    const next =
      own ??
      (median === null
        ? null
        : medianFallbackFiscalScale(prior, {
            turn: input.turn,
            median,
            bookGdpAnnualLocal: budget.gdp ?? 0,
          }));
    if (!next) continue;
    states.set(String(budget._id), next);
    logged.push({ countryId, state: next });
    if (prior && prior.turn === input.turn) continue;
    ops.push({
      updateOne: {
        // A re-run of the phase in the same turn finds the stamp and skips.
        filter: {
          _id: budget._id,
          $or: [
            { "fiscalScale.turn": { $exists: false } },
            { "fiscalScale.turn": { $lt: input.turn } },
          ],
        },
        update: { $set: { fiscalScale: next } },
      },
    });
  }
  if (ops.length > 0)
    await db.collection<FederalBudget>("federalBudget").bulkWrite(ops, { ordered: false });
  const logLine = fiscalScaleLogLine(input.turn, input.stage, logged);
  console.info(logLine);
  return { states, logLine };
}

interface TaxBudget {
  _id: unknown;
  countryId?: string;
  currencyCode?: string;
  revenue?: { total?: number; domesticCorporateTax?: number; foreignCorporateTax?: number };
  treasuryCashLocal?: number;
}

/**
 * Fiscal scale stage 2: collect each country's real taxes from its household
 * wallets into Treasury cash, one journaled move per country, witnessed in the
 * ledger. Returns the cash collected by budget id so the caller's coupon bound
 * sees it. A move that finds a wallet short of what was read moves nothing.
 */
export async function collectFiscalTaxes(
  db: Db,
  input: {
    turn: number;
    worldEpoch: string | undefined;
    budgets: readonly TaxBudget[];
    scaleByBudget: ReadonlyMap<string, number>;
    rateByCurrency: ReadonlyMap<string, number>;
  }
): Promise<Map<string, number>> {
  const collected = new Map<string, number>();
  if (!input.worldEpoch) return collected;
  const wallets = await db
    .collection<{ _id: string; countryId: string; cash: number; currency: string }>(
      PRODUCER_ACCOUNTS
    )
    .find(
      { kind: "households", worldEpoch: input.worldEpoch },
      { projection: { countryId: 1, cash: 1, currency: 1 } }
    )
    .toArray();
  const walletsByCountry = new Map<string, typeof wallets>();
  for (const w of wallets) {
    const list = walletsByCountry.get(w.countryId) ?? [];
    list.push(w);
    walletsByCountry.set(w.countryId, list);
  }
  const entries: LedgerEntry[] = [];
  const summary: string[] = [];
  for (const budget of input.budgets) {
    const budgetId = String(budget._id);
    const countryId = String(budget.countryId ?? budget._id);
    const currency = resolveCountryCurrencyCode(budget) ?? "USD";
    const rate = input.rateByCurrency.get(currency);
    if (!(typeof rate === "number" && Number.isFinite(rate) && rate > 0)) continue;
    const tax = fiscalTaxCollection({
      bookRevenuePerTurn: bookNonCorporateRevenuePerTurn(budget.revenue),
      scale: input.scaleByBudget.get(budgetId),
      payers: (walletsByCountry.get(countryId) ?? [])
        .filter((w) => w.currency === currency)
        .map((w) => ({ id: w._id, cash: w.cash })),
    });
    const move = fiscalTaxMove({
      turn: input.turn,
      countryId,
      budgetId,
      currencyCode: currency,
      localPerAnchor: rate,
      byPayer: tax.byPayer,
    });
    if (!move) continue;
    let result = await applyMoneyMove(db, move);
    if (result.status === "replayed") result = await resumeMoneyMove(db, move.key);
    if (result.status !== "applied" && result.status !== "replayed") {
      console.warn(`[fiscalScale] tax ${move.key} ${result.status}: ${result.error ?? ""}`);
      continue;
    }
    collected.set(budgetId, tax.collectedLocal);
    summary.push(
      `${countryId}=${tax.collectedLocal.toExponential(2)}/${tax.dueLocal.toExponential(2)}`
    );
    const legs = producerMoveLedgerLegs(move);
    if (legs)
      entries.push({
        _id: new ObjectId(
          createHash("sha256").update(`${move.key}:ledger`).digest("hex").slice(0, 24)
        ),
        turn: input.turn,
        createdAt: new Date(),
        txType: "producer_market_transfer",
        legs,
        balanced: Math.abs(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)) < 1e-6,
        emitSite: "budget/fiscalScaleTurn",
      });
  }
  if (entries.length > 0)
    await db
      .collection<LedgerEntry>("ledgerEntries")
      .insertMany(entries, { ordered: false })
      .catch((error: unknown) => {
        // Duplicate ids are replays already witnessed; anything else is real.
        const writeErrors = (error as { writeErrors?: { code?: number }[] }).writeErrors;
        if (!writeErrors || writeErrors.some((e) => e.code !== 11000)) throw error;
      });
  console.info(`[fiscalScale] t${input.turn} taxes collected/due ${summary.sort().join(" ")}`);
  return collected;
}
