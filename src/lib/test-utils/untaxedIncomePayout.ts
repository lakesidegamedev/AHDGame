/** Producer-contract stub. Tax arithmetic and atomicity have separate settlement tests. */
import type { Db, ObjectId } from "mongodb";
import type { IncomeCredit } from "@/lib/budget/incomePayout";
export async function untaxedIncomePayout(
  db: Db,
  _source: string,
  _turn: number,
  _now: Date,
  credits: IncomeCredit[]
) {
  for (const collection of ["characters", "imperialCharacters"] as const) {
    const operations = credits
      .filter((credit) => credit.ownerCollection === collection)
      .map((credit) => ({
        updateOne: {
          filter: {
            _id: credit.characterId,
            ...(credit.settledReceipt ? { settledKeys: { $ne: credit.settledReceipt.key } } : {}),
          },
          update: {
            $inc: {
              [credit.destination ?? "currencyBalances.personal." + credit.currency]: credit.gross,
              ...(credit.interest?.pendingPath
                ? { [credit.interest.pendingPath]: -credit.gross }
                : {}),
              ...(credit.interest
                ? { ["currencyBalances.interestEarned." + credit.currency]: credit.gross }
                : {}),
            },
            ...(credit.settledReceipt
              ? {
                  $push: {
                    settledKeys: {
                      $each: [credit.settledReceipt.key],
                      $slice: -credit.settledReceipt.cap,
                    },
                  },
                }
              : {}),
          },
        },
      }));
    if (operations.length)
      await db
        .collection<{ _id: ObjectId; settledKeys?: string[] }>(collection)
        .bulkWrite(operations);
  }
  const accounts = credits.filter((credit) => credit.interest?.authoritative);
  if (accounts.length)
    await db.collection("savingsAccounts").bulkWrite(
      accounts.map((credit) => ({
        updateOne: {
          filter: {
            ownerType: "character",
            ownerId: credit.characterId,
            currency: credit.currency,
          },
          update: {
            $inc: {
              balance: credit.gross,
              interestEarned: credit.gross,
              version: 1,
              ...(credit.interest?.pendingPath ? { accruedInterest: -credit.gross } : {}),
            },
          },
        },
      }))
    );
  const central = credits.filter(
    (credit) => credit.interest?.authoritative && credit.interest.centralBankId
  );
  if (central.length)
    await db.collection("centralBanks").bulkWrite(
      central.map((credit) => ({
        updateOne: {
          filter: { _id: credit.interest!.centralBankId as never },
          update: { $inc: { householdSavingsLiability: credit.gross } },
        },
      }))
    );
  const banks = credits.filter(
    (credit) => credit.interest?.authoritative && credit.interest.bankId
  );
  if (banks.length)
    await db.collection("corporations").bulkWrite(
      banks.map((credit) => ({
        updateOne: {
          filter: { _id: credit.interest!.bankId },
          update: { $inc: { "bankCharter.playerDeposits": credit.gross } },
        },
      }))
    );
  return credits.map((credit) => ({ ...credit, net: credit.gross, currentTax: 0, arrearsPaid: 0 }));
}
