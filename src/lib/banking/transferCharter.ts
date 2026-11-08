import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { BankCharter, BankLoan, InterbankLoan } from "@/lib/db/types/bank";
import type { SavingsAccount } from "@/lib/db/types/savingsAccount";
import type { Character } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

export type TransferBankCharterResult =
  | {
      ok: true;
      transferred: boolean;
      currency: CurrencyCode | null;
      loansRekeyed: number;
      interbankSidesRekeyed: number;
      savingsAccountsRekeyed: number;
      depositorPointersRekeyed: number;
    }
  | { ok: false; error: string };

const NO_COUNTS = {
  loansRekeyed: 0,
  interbankSidesRekeyed: 0,
  savingsAccountsRekeyed: 0,
  depositorPointersRekeyed: 0,
} as const;

/**
 * Player-facing reason a merge cannot proceed: funded sovereign cash is still
 * unsettled, or the target operates a live bank while the acquirer already
 * holds a charter. A corporation carries one `bankCharter` subdocument, so
 * there is nowhere to put a second bank. Shared by pre-money-move guards so
 * every merge path reports the same message. Returns null when clear.
 */
export function bankTransferConflict(
  target: Pick<
    Corporation,
    | "name"
    | "bankCharter"
    | "bankSovereignEscrows"
    | "bankPropForexFee"
    | "bankConstructionFunding"
    | "bankPrimaryFunding"
    | "bankUnderwritingFunding"
  >,
  acquirer: Pick<Corporation, "name" | "bankCharter">
): string | null {
  if (target.bankPrimaryFunding)
    return `Cannot merge ${target.name} while sovereign primary funding is settling.`;
  if (target.bankConstructionFunding)
    return `Cannot merge ${target.name} while construction funding or deposit return is settling.`;
  if (target.bankUnderwritingFunding)
    return `Cannot merge ${target.name} while a funded underwriting placement is settling.`;
  if (target.bankPropForexFee) return `Cannot merge ${target.name} while a forex fee is settling.`;
  if (hasFundedSovereignEscrow(target)) {
    return `Cannot merge ${target.name} while funded sovereign bank payments remain unsettled.`;
  }
  if (target.bankCharter?.status === "active" && acquirer.bankCharter) {
    return (
      `Cannot merge ${target.name}: ${acquirer.name} already operates a bank. ` +
      `A corporation can operate only one bank — revoke one of the two charters first, then merge again.`
    );
  }
  return null;
}

export function hasFundedSovereignEscrow(
  corporation: Pick<Corporation, "bankSovereignEscrows">
): boolean {
  return Object.values(corporation.bankSovereignEscrows ?? {}).some(
    (escrow) => !Number.isFinite(escrow.amountLocal) || escrow.amountLocal !== 0
  );
}

function sameId(a: ObjectId, b: ObjectId): boolean {
  return a.toString() === b.toString();
}

/**
 * Ownership fingerprint of the charter being moved. Covers the claim/release
 * identity (currency, charteredTurn, type, status) plus the economic fields,
 * so a genuinely different bank that happens to share the identity metadata
 * (same turn, same type) never reads as our own claimed copy. Compared with
 * the fingerprint stamped in the recovery plan on every resume, release,
 * cleanup, re-key, and plan-clear decision.
 */
export function charterFingerprint(charter: BankCharter): string {
  const fields: unknown[] = [
    charter.currency,
    charter.charteredTurn,
    charter.type,
    charter.status,
    charter.postedCapital,
    charter.depositOffset,
    charter.lendingOffset,
    charter.cashReserves,
    charter.npcDeposits,
    charter.playerDeposits,
    charter.totalLoans,
    charter.totalDeposits,
  ];
  return fields.map((v) => (v === undefined || v === null ? "∅" : String(v))).join("|");
}

function fingerprintFilter(charter: BankCharter): Record<string, unknown> {
  const entries: [string, unknown][] = [
    ["currency", charter.currency],
    ["charteredTurn", charter.charteredTurn],
    ["type", charter.type],
    ["status", charter.status],
    ["postedCapital", charter.postedCapital],
    ["depositOffset", charter.depositOffset],
    ["lendingOffset", charter.lendingOffset],
    ["cashReserves", charter.cashReserves],
    ["npcDeposits", charter.npcDeposits],
    ["playerDeposits", charter.playerDeposits],
    ["totalLoans", charter.totalLoans],
    ["totalDeposits", charter.totalDeposits],
  ];
  const filter: Record<string, unknown> = {};
  for (const [field, value] of entries) {
    filter[`bankCharter.${field}`] =
      value === undefined || value === null ? { $exists: false } : value;
  }
  return filter;
}

function identityFilter(charter: BankCharter): Record<string, unknown> {
  return {
    "bankCharter.currency": charter.currency,
    "bankCharter.charteredTurn": charter.charteredTurn,
    "bankCharter.type": charter.type,
    "bankCharter.status": charter.status,
  };
}

type CharterTransferPlan = NonNullable<Corporation["bankCharterTransfer"]>;

type CharterTransferOrphan = { to: ObjectId; fingerprint: string };

function dedupOrphans(orphans: CharterTransferOrphan[]): CharterTransferOrphan[] {
  const seen = new Set<string>();
  const out: CharterTransferOrphan[] = [];
  for (const orphan of orphans) {
    const key = `${orphan.to.toString()}@${orphan.fingerprint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(orphan);
  }
  return out;
}

/**
 * Remove every charter copy a superseded attempt may have left behind.
 * Each entry is resolved against the holder's CURRENT charter and removed
 * only on an exact fingerprint match, so a genuinely different bank never
 * matches and a concurrent change simply misses for the next attempt to
 * retry. The live copy is never a drain target: an entry naming our own slot
 * with the live fingerprint is our own claim and is skipped.
 */
async function drainOrphans(
  db: Db,
  orphans: CharterTransferOrphan[],
  ownId: ObjectId,
  liveFingerprint: string,
  now: Date
): Promise<void> {
  if (orphans.length === 0) return;
  const corps = db.collection<Corporation>("corporations");
  for (const orphan of orphans) {
    if (sameId(orphan.to, ownId) && orphan.fingerprint === liveFingerprint) continue;
    const holder = await corps.findOne({ _id: orphan.to }, { projection: { bankCharter: 1 } });
    if (!holder?.bankCharter || charterFingerprint(holder.bankCharter) !== orphan.fingerprint) {
      continue;
    }
    await corps.updateOne(
      { _id: orphan.to, ...fingerprintFilter(holder.bankCharter) },
      { $unset: { bankCharter: "" }, $set: { updatedAt: now } }
    );
  }
}

function isOwnedPlan(plan: CharterTransferPlan | null | undefined): plan is CharterTransferPlan & {
  attemptId: string;
  fingerprint: string;
} {
  return (
    !!plan &&
    !!plan.to &&
    !!plan.currency &&
    typeof plan.attemptId === "string" &&
    plan.attemptId.length > 0 &&
    typeof plan.fingerprint === "string" &&
    plan.fingerprint.length > 0
  );
}

async function rekeySatellites(
  db: Db,
  targetId: ObjectId,
  destId: ObjectId,
  currency: CurrencyCode,
  now: Date
): Promise<{
  loansRekeyed: number;
  interbankSidesRekeyed: number;
  savingsAccountsRekeyed: number;
  depositorPointersRekeyed: number;
}> {
  // Sequential on purpose: each write is an idempotent set keyed on the old
  // owner, so a throw leaves a well-defined prefix and the next attempt
  // resumes it. Together they would leave an ambiguous subset on failure.
  const targetHex = targetId.toString();
  const destHex = destId.toString();
  const holderPath = `currencyBalances.savingsHolder.${currency}` as const;

  const loans = await db
    .collection<BankLoan>("bankLoans")
    .updateMany(
      { bankCorporationId: targetId },
      { $set: { bankCorporationId: destId, updatedAt: now } }
    );
  const interbankLent = await db
    .collection<InterbankLoan>("interbankLoans")
    .updateMany(
      { lenderCorporationId: targetId },
      { $set: { lenderCorporationId: destId, updatedAt: now } }
    );
  const interbankBorrowed = await db
    .collection<InterbankLoan>("interbankLoans")
    .updateMany(
      { borrowerCorporationId: targetId },
      { $set: { borrowerCorporationId: destId, updatedAt: now } }
    );
  const accounts = await db
    .collection<SavingsAccount>("savingsAccounts")
    .updateMany(
      { holder: targetHex, status: { $ne: "closed" } },
      { $set: { holder: destHex, updatedAt: now } }
    );
  const pointers = await db
    .collection<Character>("characters")
    .updateMany({ [holderPath]: targetHex }, { $set: { [holderPath]: destHex, updatedAt: now } });

  return {
    loansRekeyed: loans.modifiedCount ?? 0,
    interbankSidesRekeyed:
      (interbankLent.modifiedCount ?? 0) + (interbankBorrowed.modifiedCount ?? 0),
    savingsAccountsRekeyed: accounts.modifiedCount ?? 0,
    depositorPointersRekeyed: pointers.modifiedCount ?? 0,
  };
}

async function clearPlan(
  db: Db,
  targetId: ObjectId,
  destId: ObjectId,
  attemptId: string,
  now: Date
): Promise<void> {
  // Guarded on planned owner and attempt token so concurrent resumers
  // cannot clear a newer plan or a loser clear the winner's plan. A throw
  // here is fine: re-keys are idempotent and the retry clears the plan.
  await db.collection<Corporation>("corporations").updateOne(
    {
      _id: targetId,
      "bankCharterTransfer.to": destId,
      "bankCharterTransfer.attemptId": attemptId,
    },
    { $unset: { bankCharterTransfer: "" }, $set: { updatedAt: now } }
  );
}

/**
 * Move a bank charter from an absorbed corporation to its acquirer, re-keying
 * every satellite record that names the old owner: loans, both sides of
 * interbank loans, open/frozen savings accounts, and the legacy per-character
 * savings projection. Charter fields travel inside the sub-document.
 *
 * An active charter cannot move into an occupied slot, so refuse the merge
 * before any money moves. An inert charter moves into a free slot; if occupied
 * it dies with the shell.
 *
 * No multi-document transactions, so the shell carries a durable transfer plan
 * (planned owner, currency, unique attempt token, charter fingerprint, pending
 * orphans) stamped before the claim and cleared after the last re-key. Every
 * satellite write is an idempotent set keyed on the old owner, so an
 * interruption anywhere converges on retry. Only the token holder releases
 * the charter and drives re-keys; concurrent transfers to different acquirers
 * return conflict instead of overwriting each other's plan; same-pair retries
 * converge without double-apply. Orphan claims are drained with
 * fingerprint-guarded removals before claiming.
 */
export async function transferBankCharterToAcquirer(
  db: Db,
  targetId: ObjectId,
  acquirerId: ObjectId,
  now: Date
): Promise<TransferBankCharterResult> {
  if (targetId.equals(acquirerId)) {
    return { ok: false, error: "A corporation cannot absorb itself" };
  }
  const corps = db.collection<Corporation>("corporations");
  const [target, acquirer] = await Promise.all([
    corps.findOne(
      { _id: targetId },
      {
        projection: {
          name: 1,
          bankCharter: 1,
          bankSovereignEscrows: 1,
          bankPropForexFee: 1,
          bankConstructionFunding: 1,
          bankPrimaryFunding: 1,
          bankUnderwritingFunding: 1,
          bankCharterTransfer: 1,
        },
      }
    ),
    corps.findOne(
      { _id: acquirerId },
      { projection: { name: 1, bankCharter: 1, bankCharterTransfer: 1 } }
    ),
  ]);
  if (!target) return { ok: false, error: "Target corporation no longer exists" };
  if (target.bankPrimaryFunding)
    return {
      ok: false,
      error: "Sovereign primary funding must settle before transferring the charter",
    };
  if (target.bankConstructionFunding)
    return {
      ok: false,
      error: "Construction funding or deposit return must settle before a charter transfer",
    };
  if (target.bankPropForexFee)
    return { ok: false, error: "Forex fee settlement must finish before a charter transfer" };
  if (target.bankUnderwritingFunding)
    return { ok: false, error: "Underwriting settlement must finish before a charter transfer" };
  if (!acquirer) return { ok: false, error: "Acquiring corporation no longer exists" };

  const charter = target.bankCharter ?? null;
  const rawPlan =
    target.bankCharterTransfer?.to && target.bankCharterTransfer?.currency
      ? target.bankCharterTransfer
      : null;
  const plan = isOwnedPlan(rawPlan) ? rawPlan : null;

  if (!charter) {
    if (!rawPlan) {
      return { ok: true, transferred: false, currency: null, ...NO_COUNTS };
    }
    if (!plan) {
      // Stamped before ownership tokens existed: no proof which attempt owns
      // it, so no resume. Report conflict without writing anything; the shell
      // still holding its charter would have let a retarget adopt it, but a
      // charterless shell with an unowned plan is someone else's in-flight
      // transfer (or a strand from before tokens) and must not be re-keyed
      // blindly toward any caller.
      return {
        ok: false,
        error: `Cannot merge ${target.name}: its bank transfer was interrupted before ownership tracking. Try again.`,
      };
    }
    if (!sameId(plan.to, acquirerId)) {
      // Another acquirer's transfer is in flight (or crashed mid-re-key):
      // conflict without touching charter or satellite state.
      return {
        ok: false,
        error: `Cannot merge ${target.name}: its bank transfer is held by another merge. Try again.`,
      };
    }
    // The charter already moved but a crash or throw interrupted the
    // satellite re-keys (or their ack). Resume toward the planned owner and
    // only then clear the plan, so this call never reports "nothing to do"
    // while records still name the shell. Pending orphan cleanups drain first:
    // they were due before the claim, so anything still listed here is a copy
    // a crash saved from the owner-path cleanup.
    const destId = plan.to;
    await drainOrphans(db, plan.orphans ?? [], destId, plan.fingerprint, now);
    const counts = await rekeySatellites(db, targetId, destId, plan.currency, now);
    await clearPlan(db, targetId, destId, plan.attemptId, now);
    return { ok: true, transferred: true, currency: plan.currency, ...counts };
  }

  const fingerprint = charterFingerprint(charter);

  // A charter on the acquirer that matches this one by full fingerprint, plus
  // a token-owned plan naming this acquirer, is our own earlier claim
  // interrupted before release — not a conflict and not an occupied slot.
  // Fingerprint (not just identity metadata) is required so a genuinely
  // different bank that shares currency/turn/type/status never reads as ours.
  const ownClaim =
    !!acquirer.bankCharter &&
    !!plan &&
    sameId(plan.to, acquirerId) &&
    plan.fingerprint === fingerprint &&
    charterFingerprint(acquirer.bankCharter) === fingerprint;
  // The plan's charter with a stale copy of it on our own slot: attempt 1
  // claimed, then crashed, then banking turns drifted the still-held charter
  // past the stamped fingerprint. The slot copy is provably our orphan (it
  // matches the plan fingerprint exactly, and the plan already names us), so
  // it must not read as a foreign bank occupying the slot.
  const staleOwnClaim =
    !!acquirer.bankCharter &&
    !!plan &&
    sameId(plan.to, acquirerId) &&
    plan.fingerprint !== fingerprint &&
    charterFingerprint(acquirer.bankCharter) === plan.fingerprint;
  // A superseded copy of our own claim that a crash left after the plan
  // moved on: the plan records it as a pending orphan, so it must not read
  // as a foreign bank occupying the slot.
  const slotFingerprint = acquirer.bankCharter ? charterFingerprint(acquirer.bankCharter) : null;
  const orphanedOwnSlot =
    !!slotFingerprint &&
    !!plan &&
    sameId(plan.to, acquirerId) &&
    slotFingerprint !== fingerprint &&
    (plan.orphans ?? []).some(
      (orphan) => sameId(orphan.to, acquirerId) && orphan.fingerprint === slotFingerprint
    );
  const conflict = bankTransferConflict(target, acquirer);
  if (conflict && !ownClaim && !staleOwnClaim && !orphanedOwnSlot) {
    return { ok: false, error: conflict };
  }
  if (
    charter.status !== "active" &&
    acquirer.bankCharter &&
    !ownClaim &&
    !staleOwnClaim &&
    !orphanedOwnSlot
  ) {
    return { ok: true, transferred: false, currency: null, ...NO_COUNTS };
  }

  const attemptId = new ObjectId().toHexString();
  const stampPlan = {
    to: acquirerId,
    currency: charter.currency,
    attemptId,
    fingerprint,
    startedAt: now,
  };

  // Claim plan ownership atomically. The first attempt wins with a guarded
  // stamp; a same-pair sibling (same owner, same fingerprint) joins the
  // shared plan; anything else must adopt via compare-and-swap on the old
  // token, guarded on the shell still holding this charter — a shell that
  // already released is someone's in-flight transfer and is never adopted.
  let owned: string | null = null;
  let pendingOrphans: CharterTransferOrphan[] = [];
  const stamp = await corps.updateOne(
    {
      _id: targetId,
      bankCharterTransfer: { $exists: false },
      bankConstructionFunding: { $exists: false },
      bankPrimaryFunding: { $exists: false },
      bankUnderwritingFunding: { $exists: false },
    },
    { $set: { bankCharterTransfer: stampPlan, updatedAt: now } }
  );
  if (stamp.modifiedCount === 1) {
    owned = attemptId;
  } else {
    const current = await corps.findOne(
      { _id: targetId },
      { projection: { bankCharter: 1, bankCharterTransfer: 1 } }
    );
    const curPlan = isOwnedPlan(current?.bankCharterTransfer) ? current?.bankCharterTransfer : null;
    const curRaw =
      current?.bankCharterTransfer?.to && current?.bankCharterTransfer?.currency
        ? current.bankCharterTransfer
        : null;
    if (
      curPlan &&
      sameId(curPlan.to, acquirerId) &&
      curPlan.fingerprint === fingerprint &&
      curPlan.currency === charter.currency
    ) {
      // Same-pair sibling (or our own lost-ack retry): drive jointly, draining
      // whatever pending cleanups the shared plan still carries.
      owned = curPlan.attemptId;
      pendingOrphans = [...(curPlan.orphans ?? [])];
    } else if (curPlan && sameId(curPlan.to, acquirerId)) {
      // Stale own plan: names this acquirer but predates the shell's current
      // charter. Take it over via token CAS guarded on the shell still holding
      // this charter; fingerprint guards keep foreign plans from matching.
      const takeOverPlan = {
        ...stampPlan,
        orphans: dedupOrphans([
          ...(curPlan.orphans ?? []),
          { to: acquirerId, fingerprint: curPlan.fingerprint },
        ]),
      };
      const takeOver = await corps.updateOne(
        {
          _id: targetId,
          bankConstructionFunding: { $exists: false },
          bankPrimaryFunding: { $exists: false },
          bankUnderwritingFunding: { $exists: false },
          ...identityFilter(charter),
          "bankCharterTransfer.attemptId": curPlan.attemptId,
        },
        { $set: { bankCharterTransfer: takeOverPlan, updatedAt: now } }
      );
      if (takeOver.modifiedCount === 1) {
        owned = attemptId;
        pendingOrphans = [...takeOverPlan.orphans];
      }
    } else if (curRaw && !sameId(curRaw.to, acquirerId)) {
      // Adopt a foreign plan only while the shell still holds this charter.
      // CAS means one adopter wins; superseded owner and fingerprint persist
      // in the plan so crashes converge on retry, including chained adopts.
      const adoptPlan = {
        ...stampPlan,
        orphans: dedupOrphans([
          ...(isOwnedPlan(curRaw) ? (curRaw.orphans ?? []) : []),
          {
            to: curRaw.to,
            fingerprint: isOwnedPlan(curRaw) ? curRaw.fingerprint : fingerprint,
          },
        ]),
      };
      const adopt = await corps.updateOne(
        {
          _id: targetId,
          bankConstructionFunding: { $exists: false },
          bankPrimaryFunding: { $exists: false },
          bankUnderwritingFunding: { $exists: false },
          ...identityFilter(charter),
          ...(isOwnedPlan(curRaw)
            ? { "bankCharterTransfer.attemptId": curRaw.attemptId }
            : { "bankCharterTransfer.to": curRaw.to }),
        },
        { $set: { bankCharterTransfer: adoptPlan, updatedAt: now } }
      );
      if (adopt.modifiedCount === 1) {
        owned = attemptId;
        pendingOrphans = [...adoptPlan.orphans];
      }
    } else if (!curRaw) {
      // Plan vanished under us (winner completed and cleared, or a rollback);
      // one restamp decides it.
      const restamp = await corps.updateOne(
        {
          _id: targetId,
          bankCharterTransfer: { $exists: false },
          bankConstructionFunding: { $exists: false },
          bankPrimaryFunding: { $exists: false },
          bankUnderwritingFunding: { $exists: false },
        },
        { $set: { bankCharterTransfer: stampPlan, updatedAt: now } }
      );
      if (restamp.modifiedCount === 1) owned = attemptId;
    }
  }
  if (!owned) {
    // Lost the plan race, or the shell no longer holds this charter for us
    // to adopt. Conflict with zero writes: no claim, no release, no re-key.
    return {
      ok: false,
      error: `Cannot merge ${target.name}: its bank transfer was claimed by another merge. Try again.`,
    };
  }

  // Drain pending orphans from superseded attempts before claiming.
  // Each removal is fingerprint-guarded, so foreign banks never match and
  // our live claim is skipped; the cleanup is idempotent across retries.
  await drainOrphans(db, pendingOrphans, acquirerId, fingerprint, now);

  // Claim the acquirer's charter slot, guarded: a charter issued on the
  // acquirer between the caller's pre-check and this write must fail here
  // rather than overwrite a live bank. A miss while the acquirer already
  // holds our own claimed copy under the shared plan is the
  // interrupted-claim case racing us; anything else is a genuine race and
  // errors as before.
  let claimedOurs = false;
  if (!ownClaim) {
    const claim = await corps.updateOne(
      { _id: acquirerId, bankCharter: { $exists: false } },
      { $set: { bankCharter: charter, updatedAt: now } }
    );
    if (claim.modifiedCount === 1) {
      claimedOurs = true;
    } else {
      const [raced, planNow] = await Promise.all([
        corps.findOne({ _id: acquirerId }, { projection: { bankCharter: 1 } }),
        corps.findOne({ _id: targetId }, { projection: { bankCharterTransfer: 1 } }),
      ]);
      const shared = isOwnedPlan(planNow?.bankCharterTransfer) ? planNow.bankCharterTransfer : null;
      if (
        raced?.bankCharter &&
        charterFingerprint(raced.bankCharter) === fingerprint &&
        !!shared &&
        shared.attemptId === owned &&
        sameId(shared.to, acquirerId)
      ) {
        // Lost the claim race to our own sibling attempt; it will drive the
        // release, and our call below resumes the shared re-keys. Never our
        // copy to roll back.
      } else {
        return {
          ok: false,
          error: `Cannot merge ${target.name}: ${acquirer.name} gained a bank charter during the merge. Try again.`,
        };
      }
    }
  }

  // Release the charter from the target, guarded on identity AND the owned
  // attempt token: if another acquirer won this shell, our release misses
  // instead of treating the winner's release as our own. On a miss we roll
  // back only our own claim (fingerprint-guarded, own slot only) so the
  // bank exists in exactly one place.
  const release = await corps.updateOne(
    {
      _id: targetId,
      ...identityFilter(charter),
      "bankCharterTransfer.attemptId": owned,
      "bankCharterTransfer.to": acquirerId,
    },
    { $unset: { bankCharter: "" }, $set: { updatedAt: now } }
  );
  if (release.modifiedCount !== 1) {
    const reread = await corps.findOne(
      { _id: targetId },
      { projection: { bankCharter: 1, bankCharterTransfer: 1 } }
    );
    const rereadPlan = isOwnedPlan(reread?.bankCharterTransfer)
      ? reread?.bankCharterTransfer
      : null;
    const releasedUnderSharedPlan =
      !reread?.bankCharter &&
      !!rereadPlan &&
      rereadPlan.attemptId === owned &&
      sameId(rereadPlan.to, acquirerId);
    if (releasedUnderSharedPlan) {
      // Our own earlier attempt (or a same-pair sibling) already released;
      // fall through to the shared idempotent re-keys.
    } else {
      // Either the shell genuinely changed under us, or another acquirer won
      // this shell. Roll our claim back when this call made one
      // (fingerprint-guarded: never touches a foreign bank) and report. The
      // winner, if any, converges through its own plan; we write nothing
      // else — in particular no re-key toward ourselves.
      if (claimedOurs) {
        await corps.updateOne(
          { _id: acquirerId, ...fingerprintFilter(charter) },
          { $unset: { bankCharter: "" }, $set: { updatedAt: now } }
        );
      }
      return {
        ok: false,
        error: `Cannot merge ${target.name}: its bank changed during the merge. Try again.`,
      };
    }
  }

  const counts = await rekeySatellites(db, targetId, acquirerId, charter.currency, now);
  await clearPlan(db, targetId, acquirerId, owned, now);

  return {
    ok: true,
    transferred: true,
    currency: charter.currency as CurrencyCode,
    ...counts,
  };
}
