/**
 * Shell for the Savings Accounts commands: load the account and holder
 * snapshots, decide, settle through the journal, publish the event.
 *
 * In `authoritative` mode this is the only write path for player savings.
 * An account that does not exist yet (a character who opened savings after
 * the migration, or a currency the migration has not reached) is created
 * from the legacy fields first, through the same journaled migration
 * transition, so the command that follows always has a record to guard.
 */

import { ObjectId, type Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import type { SavingsAccount } from "@/lib/db/types/savingsAccount";
import type { SavingsHolder } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { DEPOSIT_INSURANCE_SPENDING_KEY } from "@/lib/banking/depositBookReturn";
import { ensureFund } from "@/lib/banking/insurance";
import { charterMay } from "@/lib/banking/rules/capabilities";
import { lifecycleRefusal } from "@/lib/banking/rules/lifecycle";
import { getBankDepositCeiling } from "@/lib/banking/capacityAllocation";
import { getCashReserves } from "@/lib/banking/rules/balanceSheet";
import { isBlockedDepositor } from "@/lib/banking/blacklist";
import { applyProjection, settleTransition } from "@/lib/banking/settlementJournal";
import { reviveObjectIds } from "@/lib/banking/settlementEncoding";
import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import { emitTx } from "@/lib/financialTxLog/emit";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { getCurrentTurn } from "@/lib/currentTurn";
import {
  CENTRAL_BANK_HOLDER,
  isBankHolder,
  type SavingsAccountSnapshot,
} from "@/lib/savings/rules/accounts";
import {
  decideSavingsCommand,
  type HolderSnapshot,
  type SavingsCommand,
  type SavingsDecision,
} from "@/lib/savings/rules/commands";
import { SAVINGS_ACCOUNTS_COLLECTION } from "@/lib/savings/shadow";
import { migrationTransition } from "@/lib/savings/migration";

export type SavingsCommandResult =
  | { ok: true; account: SavingsAccountSnapshot; settlementId: string }
  | { ok: false; error: string; refusal?: Extract<SavingsDecision, { allowed: false }>["refusal"] };

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

import { toAccountSnapshot } from "./snapshot";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { savingsAccountsCollection } from "@/lib/db/repositories/savingsAccounts";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

/**
 * The account for an owner and currency, materialized from the legacy fields
 * through the migration transition if it does not exist yet.
 */
export async function ensureSavingsAccount(
  db: Db,
  ownerId: ObjectId,
  currency: CurrencyCode,
  turn: number
): Promise<SavingsAccountSnapshot | null> {
  const existing = await savingsAccountsCollection<SavingsAccount>(db).findOne({
    ownerType: "character",
    ownerId,
    currency,
  });
  if (existing) return toAccountSnapshot(existing);

  const character = await charactersCollection(db).findOne(
    { _id: ownerId },
    { projection: { currencyBalances: 1, savingsAccountsOpened: 1 } }
  );
  if (!character) return null;
  const balances: Partial<NonNullable<Character["currencyBalances"]>> =
    character.currencyBalances ?? {};
  const holder = balances.savingsHolder?.[currency] ?? null;
  let effectiveHolder: SavingsHolder = holder ?? CENTRAL_BANK_HOLDER;
  if (isBankHolder(effectiveHolder)) {
    const bank = await corporationsCollection(db).findOne(
      { _id: new ObjectId(effectiveHolder) },
      { projection: { bankCharter: 1 } }
    );
    const charter = bank?.bankCharter;
    if (!charter || charter.currency !== currency || !charterMay(charter, "acceptPlayerDeposits")) {
      effectiveHolder = CENTRAL_BANK_HOLDER;
    }
  }
  const accountId = new ObjectId();
  const centralBankId = getBankId(getCountryIdForCurrency(currency));
  const transition = migrationTransition(
    {
      ownerId: ownerId.toString(),
      currency,
      savings: finite(balances.savings?.[currency]),
      savingsHolder: holder,
      pendingSavingsInterest: finite(balances.pendingSavingsInterest?.[currency]),
      interestEarned: finite(balances.interestEarned?.[currency]),
      opened: character.savingsAccountsOpened?.[currency] === true,
    },
    effectiveHolder,
    accountId.toHexString(),
    centralBankId,
    turn
  );
  const insert = transition.projections[0].insert as Record<string, unknown>;
  const now = new Date();
  insert.migratedFromLegacyAt = now;
  insert.createdAt = now;
  insert.updatedAt = now;
  const settled = await settleTransition(db, transition);
  if (settled.status === "rejected" || settled.status === "partial") return null;
  const created = await savingsAccountsCollection<SavingsAccount>(db).findOne({
    ownerType: "character",
    ownerId,
    currency,
  });
  if (created) return toAccountSnapshot(created);
  // The settlement key is deterministic, so an already-applied receipt replays
  // without inserting anything. When the receipt exists but its account record
  // does not, rebuild the account from the receipt's own insert.
  const rebuilt = await rebuildAccountFromReceipt(db, transition.key, ownerId, currency);
  return rebuilt ? toAccountSnapshot(rebuilt) : null;
}

/**
 * Recreate a savings account whose migration receipt is applied but whose
 * record is missing. The receipt already booked the holder-side counters, so
 * only the account insert is replayed. The fixed id makes this idempotent.
 */
async function rebuildAccountFromReceipt(
  db: Db,
  key: string,
  ownerId: ObjectId,
  currency: CurrencyCode
): Promise<SavingsAccount | null> {
  const receipt = await bankMoneyMovesCollection<{
    _id: string;
    status?: string;
    projections?: Array<{ projection?: unknown }>;
  }>(db).findOne({ _id: key });
  if (!receipt || receipt.status !== "applied") return null;
  const stored = receipt.projections?.find(
    (record) =>
      (record.projection as TransitionProjection | undefined)?.collection ===
      SAVINGS_ACCOUNTS_COLLECTION
  )?.projection as TransitionProjection | undefined;
  const insert = stored?.insert;
  if (!insert) return null;
  const revived = reviveObjectIds(insert) as Record<string, unknown>;
  if (
    String(revived.ownerId) !== ownerId.toString() ||
    revived.currency !== currency ||
    revived.ownerType !== "character"
  ) {
    return null;
  }
  const now = new Date();
  if (!(revived.migratedFromLegacyAt instanceof Date)) revived.migratedFromLegacyAt = now;
  if (!(revived.createdAt instanceof Date)) revived.createdAt = now;
  if (!(revived.updatedAt instanceof Date)) revived.updatedAt = now;
  const outcome = await applyProjection(db, {
    ...stored,
    insert: revived,
    note: "the authoritative account, rebuilt from its migration receipt",
  } as TransitionProjection);
  if (!outcome.ok) return null;
  return savingsAccountsCollection<SavingsAccount>(db).findOne({
    ownerType: "character",
    ownerId,
    currency,
  });
}

/** What the rules need to know about a holder right now. */
async function loadHolderSnapshot(
  db: Db,
  holder: SavingsHolder,
  currency: CurrencyCode,
  options: { ownerId?: ObjectId; withCeiling?: boolean } = {}
): Promise<HolderSnapshot | { error: string; code?: "missing_bank" }> {
  if (!isBankHolder(holder)) {
    // Savings held at the central bank are paid out of its household pool, so
    // the rules need that figure to refuse an oversized withdrawal up front
    // instead of failing at the guarded debit (ticket 1364).
    const centralBank = await centralBanksCollection(db).findOne(
      { _id: getBankId(getCountryIdForCurrency(currency)) },
      { projection: { externalBroadMoney: 1 } }
    );
    const pool = centralBank?.externalBroadMoney;
    return {
      holder: CENTRAL_BANK_HOLDER,
      cash: 0,
      acceptsDeposits: true,
      playerDeposits: 0,
      active: true,
      ...(typeof pool === "number" && Number.isFinite(pool) ? { payoutCapacity: pool } : {}),
    };
  }
  if (!ObjectId.isValid(holder) || holder.length !== 24)
    return { error: "Invalid bank corporation id" };
  const bank = await corporationsCollection(db).findOne({ _id: new ObjectId(holder) });
  if (!bank) return { error: "Bank corporation not found", code: "missing_bank" };
  const charter = bank.bankCharter;
  if (!charter || !charterMay(charter, "acceptPlayerDeposits")) {
    return { error: "Target bank must have an active retail or universal charter" };
  }
  const staged = lifecycleRefusal(charter, "takeDeposits");
  if (staged) return { error: staged.message };
  if (charter.currency !== currency) {
    return { error: `Bank charter currency is ${charter.currency}, not ${currency}` };
  }
  if (options.ownerId && isBlockedDepositor(charter, options.ownerId.toString())) {
    return { error: "Character is blacklisted by this bank" };
  }
  return {
    holder,
    cash: getCashReserves(charter),
    acceptsDeposits: true,
    playerDeposits: Math.max(0, finite(charter.playerDeposits)),
    active: charter.status === "active",
    ...(options.withCeiling ? { depositCeiling: await getBankDepositCeiling(db, bank) } : {}),
  };
}

/**
 * Decide and settle one savings command for a character. The command's
 * holder snapshots are loaded here from the account's current holder (and the
 * target for a transfer), so callers pass only the intent.
 */
export async function runSavingsCommand(
  db: Db,
  ownerId: ObjectId,
  currency: CurrencyCode,
  intent:
    | { type: "deposit"; amount: number }
    | { type: "withdraw"; amount: number }
    | { type: "transfer_holder"; to: SavingsHolder },
  commandId: string = new ObjectId().toHexString()
): Promise<SavingsCommandResult> {
  const [policy, turn] = await Promise.all([loadBankingPolicy(db), getCurrentTurn(db)]);
  const account = await ensureSavingsAccount(db, ownerId, currency, turn);
  if (!account) return { ok: false, error: "Character not found" };
  if (account.status !== "open") {
    // Checked before the holder is even loaded: a frozen account's holder is
    // an estate in resolution, and the answer is the account's, not the bank's.
    return {
      ok: false,
      error:
        account.status === "frozen"
          ? "This savings account is frozen while a pending settlement completes."
          : "This savings account is closed.",
    };
  }

  // A bank blacklist controls new business and inbound holder changes. It must
  // never prevent an existing depositor from moving their money out.
  const current = await loadHolderSnapshot(db, account.holder, currency, {
    ...(intent.type === "deposit" ? { ownerId } : {}),
  });
  if ("error" in current) {
    const mayRecoverMissingHolder =
      current.code === "missing_bank" &&
      (intent.type === "withdraw" ||
        (intent.type === "transfer_holder" && intent.to === CENTRAL_BANK_HOLDER));
    if (mayRecoverMissingHolder) {
      const recovered = await recoverOrphanedSavingsAccount(db, account, turn);
      if (!recovered.ok) return recovered;
      // Recovery re-homes the full account at the central bank through the
      // insurer and Treasury. Re-read before applying the requested command.
      return runSavingsCommand(db, ownerId, currency, intent, commandId);
    }
    return { ok: false, error: current.error };
  }

  let command: SavingsCommand;
  if (intent.type === "deposit") {
    const character = await charactersCollection(db).findOne(
      { _id: ownerId },
      { projection: { [`currencyBalances.personal.${currency}`]: 1 } }
    );
    let holder: HolderSnapshot = current;
    if (isBankHolder(account.holder)) {
      const withCeiling = await loadHolderSnapshot(db, account.holder, currency, {
        ownerId,
        withCeiling: true,
      });
      if ("error" in withCeiling) return { ok: false, error: withCeiling.error };
      holder = withCeiling;
    }
    command = {
      type: "deposit",
      amount: intent.amount,
      walletBalance: finite(character?.currencyBalances?.personal?.[currency]),
      holder,
    };
  } else if (intent.type === "withdraw") {
    command = { type: "withdraw", amount: intent.amount, holder: current };
  } else {
    const target = await loadHolderSnapshot(db, intent.to, currency, {
      ownerId,
      withCeiling: true,
    });
    if ("error" in target) return { ok: false, error: target.error };
    command = { type: "transfer_holder", from: current, to: target };
  }

  const ctx = {
    turn,
    centralBankId: getBankId(getCountryIdForCurrency(currency)),
    privateBanking: policy.privateBanking,
    expectedVersion: account.version,
  };
  const decision = decideSavingsCommand(account, command, ctx, commandId);
  const commandName =
    intent.type === "deposit"
      ? "savings.deposit"
      : intent.type === "withdraw"
        ? "savings.withdraw"
        : "savings.holder.change";
  if (!decision.allowed) {
    emitBankingAuditEvent(
      {
        kind:
          intent.type === "deposit"
            ? "account.deposited"
            : intent.type === "withdraw"
              ? "account.withdrawn"
              : "account.holder_changed",
        command: commandName,
        turn,
        outcome: "rejected",
        reason: decision.message,
        currency,
        subjectType: "savingsAccount",
        subjectId: account.id,
      },
      db
    );
    return { ok: false, error: decision.message, refusal: decision.refusal };
  }

  const settled = await settleTransition(db, decision.transition);
  if (settled.status === "rejected" || settled.status === "partial" || settled.error) {
    return {
      ok: false,
      error:
        settled.status === "partial" && settled.appliedLegs.length < decision.transition.legs.length
          ? "The balance moved while that was in flight. Try again."
          : (settled.error ?? "The account changed while that was in flight. Try again."),
    };
  }
  emitBankingAuditEvent(
    {
      ...decision.transition.event,
      turn,
      outcome: "ok",
      currency,
      ...(isBankHolder(decision.next.holder) ? { bankId: decision.next.holder } : {}),
      settlementId: decision.transition.key,
    },
    db
  );
  return { ok: true, account: decision.next, settlementId: decision.transition.key };
}

/**
 * Return a savings account to the central bank when its former bank document
 * has been deleted before the bank's deposit book was resolved. The same
 * insurance fund then Treasury waterfall backs that account as a failed-bank
 * resolution would. The settlement key is tied to the account version so two
 * withdrawals racing to repair the same orphan cannot pay it twice.
 */
async function recoverOrphanedSavingsAccount(
  db: Db,
  account: SavingsAccountSnapshot,
  turn: number
): Promise<SavingsCommandResult> {
  const fund = await ensureFund(db, account.currency as CurrencyCode);
  const fundBalance = Number.isFinite(fund.balance) ? Math.max(0, fund.balance) : 0;
  const fromInsuranceFund = Math.min(account.balance, fundBalance);
  const fromTreasury = Math.max(0, account.balance - fromInsuranceFund);
  const context = {
    turn,
    centralBankId: getBankId(getCountryIdForCurrency(account.currency as CurrencyCode)),
    privateBanking: false,
    expectedVersion: account.version,
  };
  const decision = decideSavingsCommand(
    account,
    {
      type: "recover_orphaned_holder",
      holder: {
        holder: account.holder,
        cash: 0,
        acceptsDeposits: false,
        playerDeposits: 0,
        active: false,
      },
      fromInsuranceFund,
      fromTreasury,
    },
    context,
    "orphaned-holder-recovery"
  );
  if (!decision.allowed) return { ok: false, error: decision.message, refusal: decision.refusal };

  const now = new Date();
  const countryId = getCountryIdForCurrency(account.currency as CurrencyCode);
  const fiscalProjections: TransitionProjection[] = [];
  if (fromTreasury > 0) {
    fiscalProjections.push({
      collection: "federalBudget",
      filter: { _id: getNationalBudgetId(countryId) },
      update: {
        $inc: {
          treasuryBalance: -fromTreasury,
          [`spending.byCategory.${DEPOSIT_INSURANCE_SPENDING_KEY}`]: fromTreasury,
          "spending.total": fromTreasury,
          surplus: -fromTreasury,
        },
        $set: { updatedAt: now },
      },
      note: "Treasury books the orphaned savings backstop",
    });
  }
  if (account.balance > 0) {
    fiscalProjections.push({
      collection: "depositInsuranceFunds",
      filter: { _id: account.currency },
      update: {
        $inc: {
          payoutsLifetime: account.balance,
          treasuryBackstopLifetime: fromTreasury,
        },
      },
      note: "deposit insurance records the orphaned savings payout",
    });
  }
  if (fiscalProjections.length > 0) {
    // Keep the account at the orphaned holder until the funding records land.
    // The journal persists these projections under the stable recovery key.
    decision.transition.projections.splice(1, 0, ...fiscalProjections);
  }

  const settled = await settleTransition(db, decision.transition);
  if (settled.status === "rejected" || settled.status === "partial" || settled.error) {
    return {
      ok: false,
      error:
        settled.error ?? "The missing bank's savings recovery could not be completed. Try again.",
    };
  }
  if (settled.status === "applied") {
    emitBankingAuditEvent(
      {
        ...decision.transition.event,
        turn,
        outcome: "ok",
        currency: account.currency as CurrencyCode,
        settlementId: decision.transition.key,
      },
      db
    );
    if (fromInsuranceFund > 0 || fromTreasury > 0) {
      void emitTx(db, {
        type: "bank_insurance_payout",
        turn,
        createdAt: now,
        subjectType: "government",
        countryId,
        subjectName: `${account.currency} deposit insurance`,
        amount: -(fromInsuranceFund + fromTreasury),
        currencyCode: account.currency as CurrencyCode,
        counterpartyType: "system",
        counterpartyName: "Household depositors",
        meta: {
          kind: "fund_payout",
          bankCorporationId: account.holder,
          treasuryBackstop: fromTreasury,
        },
      });
    }
  }
  return { ok: true, account: decision.next, settlementId: decision.transition.key };
}
