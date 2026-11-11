/**
 * Retiring or deleting a character closes savings before the owner disappears.
 * A durable freeze prevents new account commands; the settlement journal can
 * resume an interrupted release without paying the household pool twice.
 */
import { ObjectId, type Db } from "mongodb";
import { isBankHolder } from "./rules/accounts";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import { getBankId } from "@/lib/centralBank/helpers";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getCurrentTurn } from "@/lib/currentTurn";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import { toAccountSnapshot } from "./snapshot";
import { savingsClosureTransition } from "./rules/closure";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { savingsAccountsCollection } from "@/lib/db/repositories/savingsAccounts";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

export async function closeCharacterSavings(
  db: Db,
  ownerId: ObjectId,
  options: { allowMissingHolderWriteOff?: boolean } = {}
): Promise<void> {
  const [policy, turn, owner, accounts] = await Promise.all([
    loadBankingPolicy(db),
    getCurrentTurn(db),
    charactersCollection(db).findOne({ _id: ownerId }, { projection: { _id: 1 } }),
    savingsAccountsCollection(db)
      .find({ ownerType: "character", ownerId, status: { $ne: "closed" } })
      .toArray(),
  ]);
  for (const original of accounts) {
    if (!Number.isFinite(original.balance) || original.balance < -1e-9)
      throw new Error("Savings balance requires reconciliation before character deletion");
    const holderMissing =
      isBankHolder(original.holder) &&
      !(await corporationsCollection(db).findOne(
        { _id: new ObjectId(original.holder) },
        { projection: { _id: 1 } }
      ));
    if (holderMissing && (owner || !options.allowMissingHolderWriteOff))
      throw new Error("Recover savings from the missing bank before deleting the character");
    const accountsCollection = savingsAccountsCollection(db);
    if (original.closureClaimedTurn === undefined) {
      const claimed = await accountsCollection.updateOne(
        { _id: original._id, version: original.version, status: "open" },
        { $set: { status: "frozen", closureClaimedTurn: turn }, $inc: { version: 1 } }
      );
      if (claimed.modifiedCount !== 1)
        throw new Error("Savings changed or are resolving; retry character deletion");
    }
    const account = await accountsCollection.findOne({ _id: original._id });
    if (!account || account.status !== "frozen" || account.closureClaimedTurn === undefined)
      throw new Error("Savings closure claim is unavailable");
    const key = `savings-close:${account._id}:${account.version}`;
    const recorded = await bankMoneyMovesCollection<{ _id: string }>(db).findOne(
      { _id: key },
      { projection: { _id: 1 } }
    );
    if (recorded) {
      const resumed = await resumeSettlement(db, key);
      if (resumed.status !== "applied" && resumed.status !== "replayed")
        throw new Error("Savings closure is unfinished; retry before deleting the character");
      continue;
    }
    const settled = await settleTransition(
      db,
      savingsClosureTransition({
        account: toAccountSnapshot(account),
        centralBankId: getBankId(getCountryIdForCurrency(account.currency)),
        turn: account.closureClaimedTurn,
        liabilityRecognized: savingsReadsAuthoritative(policy, account.currency),
        ownerExists: !!owner,
        holderMissing,
      })
    );
    if (settled.status === "rejected") {
      // No money moved. Release this claim so a funded retry can use a new
      // version/key without replaying a terminal rejected journal entry.
      await accountsCollection.updateOne(
        { _id: account._id, version: account.version, status: "frozen" },
        { $set: { status: "open" }, $unset: { closureClaimedTurn: "" }, $inc: { version: 1 } }
      );
    }
    if (settled.status !== "applied" && settled.status !== "replayed")
      throw new Error("Savings closure is unfinished; retry before deleting the character");
  }
}
