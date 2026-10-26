/**
 * Shell for the Market Adjustment signals: records each country's loss share
 * once per turn and reads it back for the crisis trigger engine. The history is
 * kept here because the macro metric history only carries GDP and unemployment.
 */
import type { Db } from "mongodb";
import { lossShareByCountry } from "./lossShare";

export const MARKET_ADJUSTMENT_SIGNALS = "marketAdjustmentSignals";
/** Turns of loss-share history kept per country. */
const LOSS_SHARE_HISTORY_TURNS = 12;
/** gameConfig.marketAdjustmentStage at which the signal is recorded and the event can fire. */
const MARKET_ADJUSTMENT_ENABLED_STAGE = 1;

interface SignalDoc {
  _id: string;
  lastTurn?: number;
  points?: { turn: number; value: number }[];
}

async function marketAdjustmentStage(db: Db): Promise<number> {
  const cfg = await db
    .collection<{ marketAdjustmentStage?: number }>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { marketAdjustmentStage: 1 } });
  return typeof cfg?.marketAdjustmentStage === "number" ? cfg.marketAdjustmentStage : 0;
}

export async function marketAdjustmentEnabled(db: Db): Promise<boolean> {
  return (await marketAdjustmentStage(db)) >= MARKET_ADJUSTMENT_ENABLED_STAGE;
}

/** Record this turn's loss share for every country with settled funded capacity. Idempotent per turn. */
export async function recordLossShares(db: Db, turn: number): Promise<number> {
  const rows = await db
    .collection<{
      countryId?: string;
      capitalStock?: number;
      producerSettlement?: { turn?: number; profit?: number };
    }>("corporateSectors")
    .find(
      { "producerSettlement.turn": turn },
      {
        projection: {
          countryId: 1,
          capitalStock: 1,
          "producerSettlement.turn": 1,
          "producerSettlement.profit": 1,
        },
      }
    )
    .toArray();
  const shares = lossShareByCountry(
    rows.map((r) => ({
      countryId: r.countryId,
      capitalStock: r.capitalStock,
      settledTurn: r.producerSettlement?.turn,
      profit: r.producerSettlement?.profit,
    })),
    turn
  );
  const ops = [...shares].map(([countryId, value]) => ({
    updateOne: {
      filter: { _id: countryId, lastTurn: { $ne: turn } },
      update: {
        $set: { lastTurn: turn },
        $push: { points: { $each: [{ turn, value }], $slice: -LOSS_SHARE_HISTORY_TURNS } },
      },
      upsert: true,
    },
  }));
  if (ops.length === 0) return 0;
  try {
    const res = await db
      .collection<SignalDoc>(MARKET_ADJUSTMENT_SIGNALS)
      .bulkWrite(ops as never, { ordered: false });
    return res.modifiedCount + res.upsertedCount;
  } catch (err) {
    // A retried turn finds each document already stamped; the upsert then
    // collides on _id, which is exactly "already recorded". Anything else is real.
    const e = err as {
      writeErrors?: { code?: number }[];
      result?: { modifiedCount?: number; upsertedCount?: number };
    };
    const errors = e.writeErrors ?? [];
    if (errors.length > 0 && errors.every((w) => w.code === 11000))
      return (e.result?.modifiedCount ?? 0) + (e.result?.upsertedCount ?? 0);
    throw err;
  }
}

/** The latest loss share and its recent history for one country, if any was recorded. */
export async function loadLossShareSignal(
  db: Db,
  countryId: string
): Promise<{ current: number; history: number[] } | null> {
  const doc = await db.collection<SignalDoc>(MARKET_ADJUSTMENT_SIGNALS).findOne({ _id: countryId });
  const points = doc?.points ?? [];
  if (points.length === 0) return null;
  const history = points.map((p) => p.value);
  return { current: history[history.length - 1], history };
}
