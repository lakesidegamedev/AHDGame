import { ObjectId, type Db, type AnyBulkWriteOperation } from "mongodb";
import type { Character } from "@/lib/db/types";
import type { SavingsAccount } from "@/lib/db/types/savingsAccount";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { withSessionDb } from "@/lib/db/sessionDb";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { redenominateSavings } from "./rules/redenomination";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { savingsAccountsCollection } from "@/lib/db/repositories/savingsAccounts";

/** Move claims, their backing and the UI projection atomically. Closed source
 * records protect the original migration receipt from recreating the deposit.
 * Call before the legacy wallet conversion, within the region transaction.
 */
export async function redenominateTransferredSavings(
  db: Db,
  regionId: string,
  oldCurrency: CurrencyCode,
  newCurrency: CurrencyCode,
  scale: number,
  repair?: { ownerId: string; expectedConvertedBalance: number; expectedSourceBalance: number }
): Promise<void> {
  if (oldCurrency === newCurrency) return;
  await withSessionDb(db, async (tx) => {
    const owners = await charactersCollection(tx)
      .find(
        {
          homeState: regionId,
          userId: { $exists: true },
          ...(repair ? { _id: new ObjectId(repair.ownerId) } : {}),
        },
        { projection: { userId: 1, currencyBalances: 1, savingsAccountsOpened: 1 } }
      )
      .toArray();
    const policy = await loadBankingPolicy(tx);
    const accounts =
      policy.savingsAccounts === "authoritative"
        ? await savingsAccountsCollection(tx)
            .find({
              ownerType: "character",
              ownerId: { $in: owners.map((owner) => owner._id) },
              currency: { $in: [oldCurrency, newCurrency] },
            })
            .toArray()
        : [];
    const accountByKey = new Map(
      accounts.map((account) => [`${account.ownerId}:${account.currency}`, account])
    );
    const needsOpeningTurn =
      policy.savingsAccounts === "authoritative" &&
      owners.some(
        (owner) =>
          !accountByKey.has(`${owner._id}:${oldCurrency}`) &&
          !accountByKey.has(`${owner._id}:${newCurrency}`)
      );
    const openingTurn = needsOpeningTurn
      ? (
          await gameStateCollection<{ _id: string; currentTurn: number }>(tx).findOne(
            { _id: "current" },
            { projection: { currentTurn: 1 } }
          )
        )?.currentTurn
      : undefined;
    const characterWrites: AnyBulkWriteOperation<Character>[] = [];
    const accountWrites: AnyBulkWriteOperation<SavingsAccount>[] = [];
    const bankChanges = new Map<string, { currency: CurrencyCode; balance: number }>();
    const changeBank = (id: string, currency: CurrencyCode, balance: number) => {
      const prior = bankChanges.get(id);
      if (prior && prior.currency !== currency) throw new Error("Bank charter currency mismatch.");
      bankChanges.set(id, { currency, balance: (prior?.balance ?? 0) + balance });
    };
    let sourceBacking = 0;
    let targetBacking = 0;
    let sourceLiability = 0;
    let targetLiability = 0;
    const now = new Date();
    for (const owner of owners) {
      if (!owner.userId) continue;
      const source = accountByKey.get(`${owner._id}:${oldCurrency}`);
      const target = accountByKey.get(`${owner._id}:${newCurrency}`);
      const balances = owner.currencyBalances;
      if (source?.status === "closed") continue;
      if (source?.status === "frozen" || (target && target.status !== "open"))
        throw new Error("Savings conversion requires settled, open accounts.");
      const legacyBalance = balances?.savings?.[oldCurrency] ?? 0;
      const opened = source != null || owner.savingsAccountsOpened?.[oldCurrency] === true;
      if (!source && !opened && legacyBalance === 0) continue;
      const sourceHolder =
        source?.holder ?? balances?.savingsHolder?.[oldCurrency] ?? "centralBank";
      const targetHolder =
        target?.holder ?? balances?.savingsHolder?.[newCurrency] ?? "centralBank";
      const from = source ?? {
        balance: legacyBalance,
        accruedInterest: balances?.pendingSavingsInterest?.[oldCurrency] ?? 0,
        interestEarned: balances?.interestEarned?.[oldCurrency] ?? 0,
      };
      if (
        repair &&
        (balances?.savings?.[newCurrency] !== repair.expectedConvertedBalance ||
          legacyBalance !== 0 ||
          source?.balance !== repair.expectedSourceBalance ||
          !source ||
          target)
      )
        throw new Error("Savings repair evidence changed; refusing ambiguous converted money.");
      const to = target ?? {
        balance: repair ? 0 : (balances?.savings?.[newCurrency] ?? 0),
        accruedInterest: balances?.pendingSavingsInterest?.[newCurrency] ?? 0,
        interestEarned: balances?.interestEarned?.[newCurrency] ?? 0,
      };
      const next = redenominateSavings(from, to, scale);
      const set: Record<string, unknown> = {
        [`currencyBalances.savings.${newCurrency}`]: next.balance,
        [`currencyBalances.pendingSavingsInterest.${newCurrency}`]: next.accruedInterest,
        [`currencyBalances.interestEarned.${newCurrency}`]: next.interestEarned,
        [`currencyBalances.savingsHolder.${newCurrency}`]: targetHolder,
        [`savingsAccountsOpened.${newCurrency}`]:
          opened || target != null || owner.savingsAccountsOpened?.[newCurrency] === true,
        updatedAt: now,
      };
      const unset = Object.fromEntries(
        [
          "currencyBalances.savings",
          "currencyBalances.pendingSavingsInterest",
          "currencyBalances.interestEarned",
          "currencyBalances.savingsHolder",
          "savingsAccountsOpened",
        ].map((path) => [`${path}.${oldCurrency}`, "" as const])
      );
      characterWrites.push({
        updateOne: { filter: { _id: owner._id }, update: { $set: set, $unset: unset } },
      });
      if (sourceHolder === "centralBank") sourceBacking += from.balance;
      else changeBank(sourceHolder, oldCurrency, -from.balance);
      if (targetHolder === "centralBank") targetBacking += from.balance * scale;
      else changeBank(targetHolder, newCurrency, from.balance * scale);
      if (policy.savingsAccounts === "authoritative") {
        if (!source && !target && (!Number.isSafeInteger(openingTurn) || openingTurn! < 1))
          throw new Error("Savings conversion requires a current opening turn.");
        if (sourceHolder === "centralBank") sourceLiability += source?.balance ?? 0;
        if (targetHolder === "centralBank")
          targetLiability += target ? from.balance * scale : next.balance;
        if (source)
          accountWrites.push({
            updateOne: {
              filter: { _id: source._id, version: source.version, status: "open" as const },
              update: {
                $set: { balance: 0, accruedInterest: 0, status: "closed" as const, updatedAt: now },
                $inc: { version: 1 },
              },
            },
          });
        if (target)
          accountWrites.push({
            updateOne: {
              filter: { _id: target._id, version: target.version },
              update: { $set: { ...next, updatedAt: now }, $inc: { version: 1 } },
            },
          });
        else
          accountWrites.push({
            insertOne: {
              document: {
                ...source,
                _id: new ObjectId(),
                ownerType: "character",
                ownerId: owner._id,
                status: "open",
                openedTurn: source?.openedTurn ?? openingTurn!,
                currency: newCurrency,
                ...next,
                lastSettlementKey: `savings-convert:${owner._id}:${oldCurrency}:${newCurrency}`,
                version: 0,
                holder: targetHolder,
                createdAt: now,
                updatedAt: now,
              },
            },
          });
      }
    }
    if (!characterWrites.length) return;
    const sourceBank = getBankId(getCountryIdForCurrency(oldCurrency));
    const targetBank = getBankId(getCountryIdForCurrency(newCurrency));
    const bankWrites = [...bankChanges]
      .filter(([, change]) => change.balance !== 0)
      .map(([id, change]) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(id),
            "bankCharter.currency": change.currency,
            ...(change.balance < 0
              ? {
                  "bankCharter.cashReserves": { $gte: -change.balance },
                  "bankCharter.playerDeposits": { $gte: -change.balance },
                }
              : { "bankCharter.status": "active" }),
          },
          update: {
            $inc: {
              "bankCharter.cashReserves": change.balance,
              "bankCharter.playerDeposits": change.balance,
            },
          },
        },
      }));
    if (bankWrites.length) {
      const moved = await corporationsCollection(tx).bulkWrite(bankWrites);
      if (moved.matchedCount !== bankWrites.length)
        throw new Error("Bank-held savings backing is unavailable.");
    }
    const debit = await centralBanksCollection<{ _id: string }>(tx).updateOne(
      {
        _id: sourceBank,
        externalBroadMoney: { $gte: sourceBacking },
        ...(sourceLiability > 0 ? { householdSavingsLiability: { $gte: sourceLiability } } : {}),
      },
      {
        $inc: { externalBroadMoney: -sourceBacking, householdSavingsLiability: -sourceLiability },
      }
    );
    if (debit.matchedCount !== 1) throw new Error("Source savings backing is unavailable.");
    const credit = await centralBanksCollection<{ _id: string }>(tx).updateOne(
      { _id: targetBank },
      { $inc: { externalBroadMoney: targetBacking, householdSavingsLiability: targetLiability } }
    );
    if (credit.matchedCount !== 1) throw new Error("Destination savings bank is unavailable.");
    if (accountWrites.length) {
      const result = await savingsAccountsCollection(tx).bulkWrite(accountWrites);
      const updates = accountWrites.filter((write) => "updateOne" in write).length;
      if (
        result.matchedCount !== updates ||
        result.insertedCount !== accountWrites.length - updates
      )
        throw new Error("Savings accounts changed during conversion.");
    }
    const written = await charactersCollection(tx).bulkWrite(characterWrites);
    if (written.matchedCount !== characterWrites.length)
      throw new Error("Savings owners changed during conversion.");
  });
}
