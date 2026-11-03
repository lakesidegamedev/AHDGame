/**
 * Turn shell for the dynamic fiscal scale (stage 1 and up). Reads this turn's
 * funded producer settlements grouped by country, converts them to local
 * currency, runs the rules and stores the result on each budget. Moves no
 * money. Two round trips: one grouped read, one bulk write.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import {
  fiscalScaleLogLine,
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
 * value. Returns the states by budget id so later stages read the same numbers.
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
    const next = nextFiscalScale(prior, {
      turn: input.turn,
      fundedOutputLocal,
      bookGdpAnnualLocal: budget.gdp ?? 0,
    });
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
