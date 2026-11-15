/**
 * Retiring or deleting a character closes savings before the owner disappears.
 * A durable freeze prevents new account commands; the settlement journal can
 * resume an interrupted release without paying the household pool twice.
 */
import { ObjectId, type Db } from "mongodb";
import { isBankHolder } from "./rules/accounts";
import type { SavingsAccount } from "@/lib/db/types/savingsAccount";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import { getBankId } from "@/lib/centralBank/helpers";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getCurrentTurn } from "@/lib/currentTurn";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import { toAccountSnapshot } from "./snapshot";
import { savingsClosureTransition } from "./rules/closure";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { savingsAccountsCollection } from "@/lib/db/repositories/savingsAccounts";

export async function closeCharacterSavings(
  db: Db,
  ownerId: ObjectId,
  options: {
    allowMissingHolderWriteOff?: boolean;
    /** Close only this currency's account (default: every currency). */
    currency?: CurrencyCode;
    /**
     * Leave the owner's legacy savings fields alone. A currency change
     * re-denominates them itself, so zeroing them here would erase the balance
     * before it converts.
     */
    keepLegacyProjection?: boolean;
  } = {}
): Promise<void> {
  const [policy, turn, owner, accounts] = await Promise.all([
    loadBankingPolicy(db),
    getCurrentTurn(db),
    charactersCollection(db).findOne({ _id: ownerId }, { projection: { _id: 1 } }),
    savingsAccountsCollection(db)
      .find({
        ownerType: "character",
        ownerId,
        status: { $ne: "closed" },
        ...(options.currency ? { currency: options.currency } : {}),
      })
      .toArray(),
  ]);
  const context = {
    policy,
    turn,
    ownerExists: !!owner,
    allowMissingHolderWriteOff: options.allowMissingHolderWriteOff === true,
    keepLegacyProjection: options.keepLegacyProjection === true,
  };
  for (const original of accounts) await closeSavingsAccount(db, original, context);
}

interface ClosureContext {
  policy: Awaited<ReturnType<typeof loadBankingPolicy>>;
  turn: number;
  ownerExists: boolean;
  allowMissingHolderWriteOff: boolean;
  keepLegacyProjection: boolean;
}

/**
 * One account's closure: claim, journal, release. Each account settles on its
 * own journal key, so this is a per-account unit by design, not a batch.
 */
async function closeSavingsAccount(
  db: Db,
  original: SavingsAccount,
  context: ClosureContext
): Promise<void> {
  const { policy, turn } = context;
  if (!Number.isFinite(original.balance) || original.balance < -1e-9)
    throw new Error("Savings balance requires reconciliation before character deletion");
  const holderMissing =
    isBankHolder(original.holder) &&
    !(await corporationsCollection(db).findOne(
      { _id: new ObjectId(original.holder) },
      { projection: { _id: 1 } }
    ));
  if (holderMissing && (context.ownerExists || !context.allowMissingHolderWriteOff))
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
    return;
  }
  const settled = await settleTransition(
    db,
    savingsClosureTransition({
      account: toAccountSnapshot(account),
      centralBankId: getBankId(getCountryIdForCurrency(account.currency)),
      turn: account.closureClaimedTurn,
      liabilityRecognized: savingsReadsAuthoritative(policy, account.currency),
      ownerExists: context.ownerExists && !context.keepLegacyProjection,
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
