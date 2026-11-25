/**
 * New household income minted, read from the money-move ledger: by currency,
 * on one turn and since the world began. The ledger is the record of money
 * actually created, so screens and the audit read it rather than the plan.
 */
import type { Db } from "mongodb";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { NEW_HOUSEHOLD_INCOME_KIND } from "@/lib/market/producerMarket/liveFundingRules";

export interface MintedByCurrency {
  /** Minted on the given turn, local currency. */
  turn: number;
  /** Minted on every turn so far, local currency. */
  lifetime: number;
  /** Minted on the given turn, anchor currency. */
  turnAnchor: number;
}

export async function newHouseholdIncomeMinted(
  db: Db,
  turn: number
): Promise<Map<string, MintedByCurrency>> {
  const rows = await bankMoneyMovesCollection(db)
    .aggregate<{
      _id: string;
      lifetime: number;
      turn: number;
      turnAnchor: number;
    }>([
      { $match: { kind: NEW_HOUSEHOLD_INCOME_KIND, status: "applied" } },
      { $project: { turn: 1, legs: 1 } },
      { $unwind: "$legs" },
      { $match: { "legs.kind": "mint" } },
      {
        $group: {
          _id: "$legs.valuation.currencyCode",
          lifetime: { $sum: "$legs.amount" },
          turn: { $sum: { $cond: [{ $eq: ["$turn", turn] }, "$legs.amount", 0] } },
          turnAnchor: {
            $sum: {
              $cond: [
                { $eq: ["$turn", turn] },
                { $divide: ["$legs.amount", { $ifNull: ["$legs.valuation.localPerAnchor", 1] }] },
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();
  return new Map(
    rows.map((r) => [r._id, { turn: r.turn, lifetime: r.lifetime, turnAnchor: r.turnAnchor }])
  );
}
