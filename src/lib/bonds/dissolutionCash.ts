import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import {
  resumeSettlement,
  settleTransition,
  type SettlementResult,
} from "@/lib/banking/settlementJournal";
import { dissolutionCashPlan } from "./rules/dissolutionCash";

export async function retireDissolvedCorporationCash(
  db: Db,
  input: {
    corporation: string;
    currency: CurrencyCode;
    rate: number;
    liquidCapital: number;
    pendingOperatingCash: number;
    assetLiquidationCredit: number;
    turn: number;
    now: Date;
  }
): Promise<void> {
  const key = `corporation-dissolution-cash:${input.corporation}`;
  let result: SettlementResult;
  if (
    await bankMoneyMovesCollection<{ _id: string }>(db).findOne(
      { _id: key },
      { projection: { _id: 1 } }
    )
  ) {
    result = await resumeSettlement(db, key);
  } else {
    const plan = dissolutionCashPlan(input);
    result = await settleTransition(db, {
      key,
      kind: "corporation_dissolution_cash",
      turn: input.turn,
      currency: input.currency,
      legs: plan.legs,
      projections: plan.ledgerLegs.length
        ? [
            {
              collection: "ledgerEntries",
              note: "Witness the departing cash account",
              insert: {
                _id: new ObjectId(
                  createHash("sha256")
                    .update(key + ":ledger")
                    .digest("hex")
                    .slice(0, 24)
                ),
                turn: input.turn,
                createdAt: input.now,
                txType: "corp_dissolution_distribution",
                balanced: true,
                emitSite: "bonds/dissolutionCash",
                legs: plan.ledgerLegs,
              },
            },
          ]
        : [],
      event: {
        kind: "monetary.executed",
        command: "corporation.dissolution.cash",
        subjectId: input.corporation,
      },
    });
  }
  if (result.status === "partial" || (result.status === "replayed" && result.error))
    result = await resumeSettlement(db, key);
  if (result.error || (result.status !== "applied" && result.status !== "replayed"))
    throw new Error(result.error ?? "Corporation cash retirement is incomplete");
}
