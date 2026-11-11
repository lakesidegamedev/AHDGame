/** Corporate tax rate, voter reactions and receipt commit together. */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { StateBudget, GameState } from "@/lib/db/types";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { boundSession, withSessionDb } from "@/lib/db/sessionDb";
import { corporateTaxApprovalForCountry } from "@/lib/resetLegislation/rules/voterReactions";
import {
  applyVoterApprovalImpacts,
  type V2BillBallots,
} from "@/lib/resetLegislation/voterReactions";
import type { ResetLawEnactmentReceipt } from "@/lib/resetLegislation/program";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

export interface CorporateTaxVoteInput {
  billId: string;
  legislationTypeId: string;
  countryId: CountryId;
  scope: "federal" | "state";
  stateId: string;
  taxType: "domesticCorporateTax" | "foreignCorporateTax";
  proposedRate: number;
  turn: number;
  ballots: V2BillBallots;
}

export async function applyCorporateTaxBillChange(
  db: Db,
  input: CorporateTaxVoteInput,
  writeRate: (transactionDb: Db) => Promise<void>
): Promise<void> {
  const receiptId = `${input.billId}:corporate-tax:${input.legislationTypeId}`;
  await withSessionDb(db, async (transactionDb) => {
    const receipts = transactionDb.collection<ResetLawEnactmentReceipt>(
      "resetLawEnactmentReceipts"
    );
    if (await receipts.findOne({ _id: receiptId })) return;
    const budget =
      input.scope === "federal"
        ? await federalBudgetCollection(transactionDb).findOne(
            { _id: getNationalBudgetId(input.countryId) },
            { projection: { taxRates: 1, taxRatePhaseIn: 1 } }
          )
        : await stateBudgetsCollection(transactionDb)
            .findOne(
              { _id: input.stateId, countryId: input.countryId },
              { projection: { taxRates: 1 } }
            );
    // Preserve the existing no-op for an uninitialized budget. No tax change
    // means no political reward and no completed receipt.
    if (!budget?.taxRates) return;
    // A running phase-in is already the legislated policy. Retargeting its
    // destination is a policy change; re-enacting that same destination is not.
    const pending = "taxRatePhaseIn" in budget ? budget.taxRatePhaseIn?.[input.taxType] : undefined;
    const currentRate = pending ?? budget.taxRates[input.taxType];
    if (typeof currentRate !== "number") return;
    const impacts = corporateTaxApprovalForCountry(
      currentRate,
      input.proposedRate,
      input.countryId
    );
    if (currentRate !== input.proposedRate) await writeRate(transactionDb);
    const session = boundSession(transactionDb);
    if (!session) throw new Error("Corporate tax reactions require an active transaction");
    await applyVoterApprovalImpacts(
      transactionDb,
      input.ballots,
      input.countryId,
      impacts,
      session
    );
    const state = await gameStateCollection(transactionDb).findOne(
      { _id: "current" },
      { projection: { resetWorldId: 1, iteration: 1 } }
    );
    // Existing world-scoped receipts are also used for tax-only bills. A distinct
    // key cannot collide with a mixed bill's law-program receipt.
    await receipts.insertOne({
      _id: receiptId,
      worldId: state?.resetWorldId ?? `legacy:${state?.iteration ?? 0}`,
      countryId: input.countryId,
      turn: input.turn,
      programIds: [],
      annualAllocationDelta: 0,
      transitionClaim: 0,
    });
  });
}
