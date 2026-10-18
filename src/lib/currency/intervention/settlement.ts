/**
 * FX reserve debits and their publication receipt commit in one bank write.
 * Publication is recoverable on standalone Mongo as well as replica sets;
 * a paid receipt is resumed, never debited twice.
 */
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { ExchangeRate, InterventionPolicy } from "@/lib/db/types/exchangeRate";
import { FOREX_AND_MACRO_CHART_HISTORY_TURNS } from "@/lib/constants/turnTime";

export interface FxSettlement {
  turn: number;
  countryId: string;
  rate: number;
  macroTarget: number;
  policy: InterventionPolicy | null;
  previousPolicy: InterventionPolicy | null;
}

export async function reserveDefenceSettlement(
  db: Db,
  bank: CentralBank,
  receipt: FxSettlement,
  inc: Record<string, number>,
  infamy: number | undefined
): Promise<void> {
  const guard: Record<string, unknown> = {
    _id: bank._id,
    fxInterventionSettlement: { $exists: false },
    lastFxInterventionTurn: { $not: { $gte: receipt.turn } },
  };
  for (const [field, delta] of Object.entries(inc)) if (delta < 0) guard[field] = { $gte: -delta };
  if (infamy !== undefined) {
    guard.chairCharacterId = bank.chairCharacterId;
    guard.chairInfamy = bank.chairInfamy === undefined ? { $exists: false } : bank.chairInfamy;
  }
  const result = await db.collection<CentralBank>("centralBanks").updateOne(guard, {
    ...(Object.keys(inc).length ? { $inc: inc } : {}),
    $set: {
      fxInterventionSettlement: receipt,
      ...(infamy === undefined ? {} : { chairInfamy: infamy }),
    },
  });
  if (result.matchedCount !== 1)
    throw new Error("FX reserve balance or pending settlement changed; retry the turn");
}

export async function publishDefenceSettlement(
  db: Db,
  bank: CentralBank,
  fx: ExchangeRate,
  receipt: FxSettlement,
  now: Date
): Promise<ExchangeRate> {
  let next = fx;
  const publishedTurn = fx.rateHistory.at(-1)?.turn ?? -1;
  if (publishedTurn < receipt.turn) {
    const history = [...fx.rateHistory, { turn: receipt.turn, rate: receipt.rate }].slice(
      -FOREX_AND_MACRO_CHART_HISTORY_TURNS
    );
    // A chair may have changed the commitment after the debit. Preserve that
    // newer instruction rather than replacing it with the old policy snapshot.
    const policy = isDeepStrictEqual(fx.interventionPolicy ?? null, receipt.previousPolicy)
      ? { interventionPolicy: receipt.policy }
      : {};
    const fields = {
      rate: receipt.rate,
      macroTarget: receipt.macroTarget,
      rateHistory: history,
      ...policy,
      updatedAt: now,
    };
    const write = await db
      .collection<ExchangeRate>("exchangeRates")
      .updateOne(
        { _id: receipt.countryId, rate: fx.rate, updatedAt: fx.updatedAt },
        { $set: fields }
      );
    if (write.matchedCount !== 1)
      throw new Error("FX publication changed; paid settlement remains pending");
    next = { ...fx, ...fields };
  }
  const clear = await db
    .collection<CentralBank>("centralBanks")
    .updateOne(
      { _id: bank._id, "fxInterventionSettlement.turn": receipt.turn },
      { $unset: { fxInterventionSettlement: "" }, $set: { lastFxInterventionTurn: receipt.turn } }
    );
  if (clear.matchedCount !== 1)
    throw new Error("FX publication receipt changed; reconcile before retrying");
  bank.lastFxInterventionTurn = receipt.turn;
  delete bank.fxInterventionSettlement;
  return next;
}
