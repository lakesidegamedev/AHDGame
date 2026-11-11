import { creditEquityPool } from "@/lib/equities/marketPool";
import type { Db, UpdateFilter, AnyBulkWriteOperation } from "mongodb";
import {
  holdingCostBasis,
  mergeHoldingTerms,
  positionHoldingTerms,
  purchasedHoldingTerms,
} from "@/lib/corporations/rules/holdingTerms";
import { pendingStockTaxReceipt } from "@/lib/corporations/rules/stockTaxReceipt";
import { buildPersonalBalanceInc } from "@/lib/currency/characterFunds";
import type {
  Character,
  CorporationPrivatizationVote,
  IndexFund,
  NPP,
  Shareholder,
} from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { PRIVATIZATION_FAILED_COOLDOWN_TURNS } from "@/lib/constants/corporations";
import { shareholderVotingPower } from "@/lib/corporations/superShares";
import { refundCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { emitTx } from "@/lib/financialTxLog/emit";
import {
  logWireEvent,
  wireHeadlineCorpPrivatized,
  wireHeadlineCorpPrivatizationVoteFailed,
} from "@/lib/wireEvent";
import { notifyVoteEventRaw } from "@/lib/corporations/votes/voteNotifications";
import { recordAudit } from "@/lib/audit/recordAudit";
import { unplacedIpoShares } from "@/lib/corporations/rules/dividendShares";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";

export interface ResolveInput {
  db: Db;
  vote: CorporationPrivatizationVote;
  currentTurn: number;
  forexEnabled: boolean;
  force?: boolean;
  stockTaxActive?: boolean;
  fxByCurrency?: Map<CurrencyCode, number>;
}

export type ResolveResult =
  | { resolved: false; reason: "not_due" | "already_resolved" }
  | { resolved: true; status: "passed" | "failed" };

/**
 * Resolve a privatization vote past its deadline. Lazy — call from any read of
 * the vote doc (GET vote, corp detail, etc.). Idempotent: re-calls on already-
 * resolved votes are no-ops.
 *
 * Pass condition: yes voting power > no voting power AND some voting power cast
 * (no votes = fail). Weighted by voting power (supershares count), not raw shares.
 *
 * On pass: pay each non-CEO character/corp holder, pay the equity market pool for the
 * float chunk, consolidate cap table, flip
 * isPrivate=true, retire publicFloat shares.
 *
 * On fail: refund CEO's reserved cash, set 96-turn cooldown.
 */
export async function resolvePrivatizationVote(input: ResolveInput): Promise<ResolveResult> {
  const { db, vote, currentTurn, forexEnabled, force } = input;

  if (vote.status !== "open") return { resolved: false, reason: "already_resolved" };
  if (!force && currentTurn <= vote.deadlineAtTurn) return { resolved: false, reason: "not_due" };

  // Load corp BEFORE the atomic claim so we can re-evaluate each cast vote
  // against current shareholdings. A holder who sold their shares between
  // casting and the deadline should not influence the outcome, and a holder
  // who partially divested should only count for what they still own.
  const corp = await corporationsCollection(db).findOne({ _id: vote.corporationId });

  const liveVotes = corp
    ? vote.votes.flatMap((v) => {
        const holder = corp.shareholders.find((s) => {
          if (v.characterId) return s.characterId?.toString() === v.characterId.toString();
          if (v.corporationId) return s.corporationId?.toString() === v.corporationId.toString();
          return false;
        });
        const currentShares = holder?.shares ?? 0;
        if (!holder || currentShares <= 0) return [];
        // Weight by VOTING POWER (supershares count), capped at the shares held
        // when the vote was cast so a holder can't buy in afterward to inflate
        // their weight. Divestment shrinks it automatically (current shares).
        const votableShares = Math.min(v.voteShares, currentShares);
        const weight = shareholderVotingPower(corp, {
          shares: votableShares,
          superShares: holder.superShares,
        });
        return [{ vote: v.vote, weight }];
      })
    : [];

  const tally = liveVotes.reduce(
    (acc, v) => {
      if (v.vote === "yes") acc.yes += v.weight;
      else acc.no += v.weight;
      return acc;
    },
    { yes: 0, no: 0 }
  );
  const passed = tally.yes > tally.no && tally.yes + tally.no > 0;
  const now = new Date();

  // ── Atomic claim ─────────────────────────────────────────────────────────
  // Resolution runs lazily on every read past the deadline. Two concurrent
  // GETs would both reach this point with the same vote doc, both compute the
  // same pass/fail, then both run the side effects (paying holders twice).
  //
  // Claim ownership by atomically transitioning status: "open" → terminal
  // FIRST. Only the winner of the transition does payouts. The loser sees
  // matchedCount === 0 and bails out as already_resolved.
  const finalStatus: "passed" | "failed" = passed ? "passed" : "failed";
  const claim = await db
    .collection<CorporationPrivatizationVote>("corporationPrivatizationVotes")
    .updateOne(
      // The tallied votes are part of the claim: a cast that lands after the
      // tally leaves the vote open for the next resolver to count it.
      { _id: vote._id, status: "open", votes: vote.votes },
      { $set: { status: finalStatus, resolvedAt: now, updatedAt: now } }
    );
  if (claim.matchedCount === 0) {
    // Another resolver already claimed this vote, or a cast moved the tally.
    // Bail out: the claimant owns the side effects, or the next pass recounts.
    return { resolved: false, reason: "already_resolved" };
  }

  if (!corp) {
    // Corp went away mid-vote — refund the opener. Vote is already marked terminal
    // by the atomic claim above; we just need to release the held cash.
    await refundCharacterCash(
      db,
      vote.openedByCharacterId,
      vote.reservedCashCurrency,
      vote.totalReservedCash,
      forexEnabled
    );
    return { resolved: true, status: finalStatus };
  }

  if (!passed) {
    await refundCharacterCash(
      db,
      vote.openedByCharacterId,
      vote.reservedCashCurrency,
      vote.totalReservedCash,
      forexEnabled
    );
    await corporationsCollection(db).updateOne(
      { _id: corp._id },
      {
        $set: {
          privatizationCooldownUntilTurn: currentTurn + PRIVATIZATION_FAILED_COOLDOWN_TURNS,
          updatedAt: now,
        },
      }
    );
    logWireEvent(
      "corporation_privatization_vote_failed",
      wireHeadlineCorpPrivatizationVoteFailed(corp.name),
      { href: `/corporation/${corp.sequentialId ?? corp._id}` }
    );
    recordAudit({
      source: "api",
      action: "privatization.voteResolve",
      category: "corp",
      turn: currentTurn,
      ts: now,
      subject: { type: "corporation", id: corp._id, name: corp.name },
      refs: { corporationId: corp._id },
      outcome: "rejected",
      reason: "Privatization buyout vote failed",
      meta: { voteId: vote._id, tally },
    });
    void notifyVoteEventRaw({
      db,
      corporationId: corp._id,
      voteId: vote._id,
      corpName: corp.name,
      summary: "take the corporation private (buyout)",
      notificationType: "corp_vote_failed",
    });
    return { resolved: true, status: "failed" };
  }

  // ── Pass branch: settle the buyout ────────────────────────────────────────
  const ceoIdStr = corp.ceoId.toString();
  const nonCeoHolders = corp.shareholders.filter((s) => s.characterId?.toString() !== ceoIdStr);
  const publicFloat = Math.max(0, (corp.publicFloat ?? 0) - unplacedIpoShares(corp));

  // Index-fund holders must be paid too. Otherwise their payout is counted into
  // the CEO's outflow but never credited, and the cap-table rebuild below absorbs
  // their shares into the CEO, destroying money and wiping the fund's stake.
  // Funds hold cash in ₳, so convert the buyout payout from the buyout currency.
  // There is no `fund` subjectType for financialTxLog yet, so the cash credit is
  // the conserving move and the fund leg stays unbooked. Fund payouts are tracked
  // separately so the CEO's booked outflow leg reflects only the portions it can
  // attribute.
  const hasFundHolder = nonCeoHolders.some((h) => h.fundId && !h.characterId && !h.corporationId);
  const fxByCurrency =
    input.fxByCurrency ??
    (hasFundHolder || input.stockTaxActive ? await loadFxRatesByCurrency(db) : null);

  const grossLocal =
    nonCeoHolders.reduce((acc, h) => acc + Math.round(h.shares * vote.lockedBuyoutPrice), 0) +
    Math.round(publicFloat * vote.lockedBuyoutPrice);
  // Shares can move into the cap table after the vote opened (IPO placements
  // are excluded from the reserve at open). Scale payouts to what was actually
  // reserved rather than minting the difference, and refund any remainder
  // below so undershoot does not destroy cash either.
  const reserveScale =
    grossLocal > vote.totalReservedCash ? vote.totalReservedCash / grossLocal : 1;
  let totalCharCorpPaid = 0;
  let totalPaidLocal = 0;
  const personalPayoutOps: AnyBulkWriteOperation<Character>[] = [];
  const nppPayoutOps: AnyBulkWriteOperation<NPP>[] = [];
  let totalFundPaidAnchor = 0;
  for (const holder of nonCeoHolders) {
    const payout = Math.round(holder.shares * vote.lockedBuyoutPrice * reserveScale);
    totalPaidLocal += payout;
    if (holder.characterId) {
      const rate = fxByCurrency?.get(vote.lockedBuyoutCurrency as CurrencyCode) ?? 1;
      const stockTax = input.stockTaxActive
        ? pendingStockTaxReceipt({
            id: vote._id.toHexString() + ":" + holder.characterId.toHexString(),
            currencyCode: vote.lockedBuyoutCurrency,
            holdingTerms: positionHoldingTerms(holder, currentTurn, vote.lockedBuyoutPrice / rate),
            proceedsAnchor: payout / rate,
            proceedsCredited: payout,
            saleTurn: currentTurn,
            assessmentTurn: currentTurn + 1,
          })
        : undefined;
      personalPayoutOps.push({
        updateOne: {
          filter: { _id: holder.characterId },
          update: {
            $inc: buildPersonalBalanceInc(payout, vote.lockedBuyoutCurrency, forexEnabled),
            ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
          },
        },
      });
      void emitTx(db, {
        type: "share_buyout_payout",
        turn: currentTurn,
        createdAt: now,
        subjectType: "character",
        subjectId: holder.characterId,
        subjectName: "(shareholder)",
        amount: payout,
        currencyCode: vote.lockedBuyoutCurrency,
        counterpartyType: "corporation",
        counterpartyId: corp._id,
        counterpartyName: corp.name,
        ...(stockTax ? { meta: { stockTax } } : {}),
      });
      totalCharCorpPaid += payout;
    } else if (holder.corporationId) {
      await corporationsCollection(db).updateOne(
        { _id: holder.corporationId },
        { $inc: { liquidCapital: payout } }
      );
      void emitTx(db, {
        type: "share_buyout_payout",
        turn: currentTurn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: holder.corporationId,
        subjectName: "(corp shareholder)",
        amount: payout,
        currencyCode: vote.lockedBuyoutCurrency,
        counterpartyType: "corporation",
        counterpartyId: corp._id,
        counterpartyName: corp.name,
      });
      totalCharCorpPaid += payout;
    } else if (holder.fundId) {
      const rate = fxByCurrency?.get(vote.lockedBuyoutCurrency as CurrencyCode) ?? 1;
      const payoutAnchor = rate > 0 ? payout / rate : payout;
      await indexFundsCollection(db).updateOne({ _id: holder.fundId }, {
        $inc: { cashAnchor: payoutAnchor },
        $pull: { holdings: { corporationId: corp._id } },
        $set: { updatedAt: now },
      } as unknown as UpdateFilter<IndexFund>);
      totalFundPaidAnchor += payoutAnchor;
    } else if (holder.nppId) {
      nppPayoutOps.push({
        updateOne: {
          filter: { _id: holder.nppId },
          update: {
            $inc: { [`currencyBalances.personal.${vote.lockedBuyoutCurrency}`]: payout },
            $set: { updatedAt: now },
          },
        },
      });
    }
  }

  if (personalPayoutOps.length) await charactersCollection(db).bulkWrite(personalPayoutOps);
  if (nppPayoutOps.length) await (await getNppsCollection(db)).bulkWrite(nppPayoutOps);

  // The float belongs to the equity market pool, not the issuer being taken private.
  const floatPayout = Math.round(publicFloat * vote.lockedBuyoutPrice * reserveScale);
  totalPaidLocal += floatPayout;
  if (floatPayout > 0) {
    await creditEquityPool(
      db,
      vote.lockedBuyoutCurrency as CurrencyCode,
      floatPayout,
      "purchasesIn",
      now
    );
  }

  const reserveRemainder = vote.totalReservedCash - totalPaidLocal;
  if (reserveRemainder > 0) {
    await refundCharacterCash(
      db,
      vote.openedByCharacterId,
      vote.reservedCashCurrency,
      reserveRemainder,
      forexEnabled
    );
  }

  // Consolidate cap table: CEO absorbs all non-CEO character/corp shares; float retires.
  const ceoEntry = corp.shareholders.find((s) => s.characterId?.toString() === ceoIdStr) as
    Shareholder | undefined;
  const ceoSharesAfter =
    (ceoEntry?.shares ?? 0) + nonCeoHolders.reduce((acc, h) => acc + h.shares, 0);
  const newShareholders: Shareholder[] = [
    {
      characterId: corp.ceoId,
      shares: ceoSharesAfter,
      ...(ceoEntry?.avgCostBasisUnit ? { avgCostBasisUnit: ceoEntry.avgCostBasisUnit } : {}),
      ...(ceoEntry?.avgCostPerShare !== undefined
        ? { avgCostPerShare: ceoEntry.avgCostPerShare }
        : {}),
    },
  ];
  if (input.stockTaxActive || ceoEntry?.holdingTerms) {
    const rate = fxByCurrency?.get(vote.lockedBuyoutCurrency as CurrencyCode) ?? 1;
    const acquired = ceoSharesAfter - (ceoEntry?.shares ?? 0);
    const prior = positionHoldingTerms(
      ceoEntry ?? { shares: 0 },
      currentTurn,
      vote.lockedBuyoutPrice / rate
    );
    const actualBasis = totalCharCorpPaid / rate + totalFundPaidAnchor;
    const addition = purchasedHoldingTerms(
      acquired,
      acquired > 0 ? actualBasis / acquired : 0,
      currentTurn
    );
    const holdingTerms = mergeHoldingTerms(prior, addition, currentTurn);
    newShareholders[0].holdingTerms = holdingTerms;
    newShareholders[0].avgCostBasisUnit = "anchor";
    newShareholders[0].avgCostPerShare = holdingCostBasis(holdingTerms) / ceoSharesAfter;
  }
  const newTotalShares = ceoSharesAfter; // = old totalShares − publicFloat

  await corporationsCollection(db).updateOne(
    { _id: corp._id },
    {
      $set: {
        shareholders: newShareholders,
        totalShares: newTotalShares,
        publicFloat: 0,
        isPrivate: true,
        lastPrivatizationTurn: currentTurn,
        updatedAt: now,
      },
      // A private corp is single-class: drop dual-class supershare state so hasSuperShares() stops reporting 10x voting. Also void pendingShareIssuance, since the placement loop skips private corps and a stale flag would block future proposals forever.
      $unset: {
        privatizationCooldownUntilTurn: "",
        superShareMultiplier: "",
        superSharesAdoptedAtTurn: "",
        pendingShareIssuance: "",
      },
    }
  );

  void emitTx(db, {
    type: "share_buyout_outflow",
    turn: currentTurn,
    createdAt: now,
    subjectType: "character",
    subjectId: corp.ceoId,
    subjectName: "(CEO)",
    amount: -(totalCharCorpPaid + floatPayout),
    currencyCode: vote.lockedBuyoutCurrency,
    counterpartyType: "corporation",
    counterpartyId: corp._id,
    counterpartyName: corp.name,
    meta: { reservedCash: vote.totalReservedCash },
  });

  // Vote was already marked passed by the atomic claim at the top of this function;
  // no further status write needed here.
  logWireEvent("corporation_privatized", wireHeadlineCorpPrivatized(corp.name), {
    href: `/corporation/${corp.sequentialId ?? corp._id}`,
  });
  void notifyVoteEventRaw({
    db,
    corporationId: corp._id,
    voteId: vote._id,
    corpName: corp.name,
    summary: "take the corporation private (buyout)",
    notificationType: "corp_vote_passed",
  });

  recordAudit({
    source: "api",
    action: "privatization.voteResolve",
    category: "corp",
    turn: currentTurn,
    ts: now,
    actor: { kind: "player", userId: undefined, characterId: corp.ceoId },
    subject: { type: "corporation", id: corp._id, name: corp.name },
    amount: totalCharCorpPaid + floatPayout,
    currencyCode: vote.lockedBuyoutCurrency,
    refs: { corporationId: corp._id },
    outcome: "ok",
    meta: { voteId: vote._id, tally, floatPayout, fundPaidAnchor: totalFundPaidAnchor },
  });

  return { resolved: true, status: "passed" };
}
