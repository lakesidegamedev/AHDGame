import { withSessionDb } from "@/lib/db/sessionDb";
import { controllerTransferBarrierError } from "../acquisitions/controllerTransferBarrier";
import type { Db, ObjectId } from "mongodb";
import type { Character, Corporation, CorporationPrivatizationVote } from "@/lib/db/types";
import {
  PRIVATIZATION_THRESHOLD_PCT,
  PRIVATIZATION_VOTE_DURATION_TURNS,
} from "@/lib/constants/corporations";
import { atomicallyDebitCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { quotePrivatizationBuyout } from "./privatizationQuote";
import { shareholderVotingPower, totalVotingPower } from "@/lib/corporations/superShares";
import { executeFundOnlyBuyout, FundBuyoutRefusal } from "./fundOnlyBuyout";
import { unplacedIpoShares } from "@/lib/corporations/rules/dividendShares";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporationPrivatizationVotesCollection } from "@/lib/db/repositories/corporationPrivatizationVotes";

export interface OpenPrivatizationVoteInput {
  db: Db;
  corporation: Corporation;
  character: Character;
  currentTurn: number;
  forexEnabled: boolean;
}

export type OpenPrivatizationVoteResult =
  | { ok: false; error: string; status: number }
  | { ok: true; immediate: true }
  | {
      ok: true;
      immediate?: false;
      voteId: ObjectId;
      lockedBuyoutPrice: number;
      totalReservedCash: number;
      bankNavFloorApplied: boolean;
    };

/**
 * Open a privatization buyout vote for a public corporation.
 *
 * Preconditions:
 *  - corporation is public (isPrivate !== true)
 *  - no other vote currently open for this corp
 *  - CEO holds > PRIVATIZATION_THRESHOLD_PCT of total shares
 *  - currentTurn >= privatizationCooldownUntilTurn (if set from a prior failed vote)
 *  - CEO has personal cash for worst-case payout, atomically reserved
 *
 * Locks `buyoutPrice = sharePrice * (1 + PRIVATIZATION_BUYOUT_PREMIUM)` at open time.
 * Reserved cash is refunded on fail or cancel; on pass it's paid out to non-CEO
 * holders + corp treasury (for the public-float chunk).
 */
export async function openPrivatizationVote(
  input: OpenPrivatizationVoteInput
): Promise<OpenPrivatizationVoteResult> {
  try {
    return await withSessionDb(input.db, (db) => openInTransaction({ ...input, db }));
  } catch (error) {
    if (error instanceof FundBuyoutRefusal) return error.result;
    if ((error as { code?: number }).code === 11000)
      return { ok: false, error: "A privatization vote is already open", status: 400 };
    throw error;
  }
}

async function openInTransaction(
  input: OpenPrivatizationVoteInput
): Promise<OpenPrivatizationVoteResult> {
  const { db, corporation, character, currentTurn, forexEnabled } = input;

  const transferRestriction = await controllerTransferBarrierError(
    db,
    corporation,
    currentTurn,
    new Date()
  );
  if (transferRestriction) return { ok: false, error: transferRestriction, status: 403 };

  if (corporation.isPrivate) {
    return { ok: false, error: "Corporation is already private", status: 400 };
  }
  if (
    corporation.privatizationCooldownUntilTurn !== undefined &&
    currentTurn < corporation.privatizationCooldownUntilTurn
  ) {
    return {
      ok: false,
      error: `Privatization on cooldown until turn ${corporation.privatizationCooldownUntilTurn}`,
      status: 400,
    };
  }

  const ceoEntry = corporation.shareholders.find(
    (s) => s.characterId?.toString() === corporation.ceoId.toString()
  );
  const ceoShares = ceoEntry?.shares ?? 0;
  // Eligibility is measured by VOTING POWER (supershares count), not economic
  // stake, so a dual-class founder who controls the corp can call the buyout.
  // The cash reservation and per-share payouts below stay economic.
  const totalVp = totalVotingPower(corporation);
  const ceoVotingPct =
    totalVp > 0
      ? (shareholderVotingPower(corporation, ceoEntry ?? { shares: 0, superShares: 0 }) / totalVp) *
        100
      : 0;
  if (ceoVotingPct <= PRIVATIZATION_THRESHOLD_PCT) {
    return {
      ok: false,
      error: `CEO must control more than ${PRIVATIZATION_THRESHOLD_PCT}% of voting power (currently ${ceoVotingPct.toFixed(2)}%)`,
      status: 400,
    };
  }

  const existingOpen = await corporationPrivatizationVotesCollection(db).findOne({
    corporationId: corporation._id,
    status: "open",
  });
  if (existingOpen) {
    return { ok: false, error: "A privatization vote is already open", status: 400 };
  }

  const ownershipFence = await corporationsCollection(db).updateOne(
    {
      _id: corporation._id,
      isPrivate: { $ne: true },
      ceoId: character._id,
      shareholders: corporation.shareholders,
      totalShares: corporation.totalShares,
    },
    { $set: { updatedAt: new Date() } }
  );
  if (ownershipFence.matchedCount !== 1) throw new Error("Privatization ownership changed");

  const nonCeoShares = Math.max(
    0,
    corporation.totalShares - ceoShares - unplacedIpoShares(corporation)
  );

  // CEO holds 100% — no minority holders to buy out, skip the vote entirely.
  if (nonCeoShares === 0) {
    const now = new Date();
    // A private corp is single-class. This path does not rebuild shareholders,
    // so strip superShares and corp-level dual-class fields, or hasSuperShares()
    // keeps reporting 10x voting.
    const cleanedShareholders = (corporation.shareholders ?? []).map(
      ({ superShares: _superShares, ...rest }) => rest
    );
    await corporationsCollection(db).updateOne(
      { _id: corporation._id },
      {
        $set: {
          isPrivate: true,
          lastPrivatizationTurn: currentTurn,
          updatedAt: now,
          shareholders: cleanedShareholders,
          totalShares: ceoShares,
          publicFloat: 0,
        },
        $unset: {
          privatizationCooldownUntilTurn: "",
          superShareMultiplier: "",
          superSharesAdoptedAtTurn: "",
          // Approved-but-unissued public float is void once the corp leaves
          // the public market; the paced placement loop skips private corps,
          // so a surviving flag would block future share proposals forever.
          pendingShareIssuance: "",
        },
      }
    );
    return { ok: true, immediate: true };
  }

  // #71: the only non-CEO holders are index funds (no non-CEO character/corp
  // holders who could vote, and no public float). A privatization vote is
  // structurally unwinnable because index funds have no vote path, so the CEO
  // would be stuck forever. Buy the funds out from the corporate treasury
  // (a corporate buyback) and take the corp private directly.
  const hasNonCeoCharOrCorp = corporation.shareholders.some(
    (s) =>
      (s.characterId && s.characterId.toString() !== corporation.ceoId.toString()) ||
      Boolean(s.corporationId) ||
      Boolean(s.nppId)
  );
  const hasFundHolders = corporation.shareholders.some(
    (s) => s.fundId && !s.characterId && !s.corporationId
  );
  if (
    !hasNonCeoCharOrCorp &&
    (corporation.publicFloat ?? 0) - unplacedIpoShares(corporation) === 0 &&
    hasFundHolders
  ) {
    const buyout = await executeFundOnlyBuyout(db, corporation, currentTurn);
    if (!buyout.ok) return buyout;
    return { ok: true, immediate: true };
  }

  const lockedCurrency = corporation.liquidCurrencyCode ?? "USD";
  const ceoCurrency = getHomeCurrency(character);

  const quote = await quotePrivatizationBuyout(db, corporation, ceoShares);
  const { lockedBuyoutPrice, totalReservedCash, bankNavFloorApplied } = quote;

  // Cross-currency privatization is out of scope for v1 — surface a clear error.
  // This only matters under forex; legacy USD corps + USD CEOs always pass.
  if (forexEnabled && lockedCurrency !== ceoCurrency) {
    return {
      ok: false,
      error: "Cross-currency privatization is not yet supported",
      status: 400,
    };
  }

  const debit = await atomicallyDebitCharacterCash(
    db,
    character._id,
    lockedCurrency,
    totalReservedCash,
    forexEnabled
  );
  if (!debit.ok) {
    return {
      ok: false,
      error: `Insufficient personal funds. Need ${totalReservedCash.toLocaleString()} reserved.`,
      status: 400,
    };
  }

  const now = new Date();
  const result = await corporationPrivatizationVotesCollection(db).insertOne({
    corporationId: corporation._id,
    openedByCharacterId: character._id,
    openedAtTurn: currentTurn,
    deadlineAtTurn: currentTurn + PRIVATIZATION_VOTE_DURATION_TURNS,
    lockedBuyoutPrice,
    lockedBuyoutCurrency: lockedCurrency,
    totalReservedCash,
    reservedCashCurrency: lockedCurrency,
    votes: [],
    status: "open",
    createdAt: now,
    updatedAt: now,
  } as unknown as CorporationPrivatizationVote);

  return {
    ok: true,
    voteId: result.insertedId,
    lockedBuyoutPrice,
    totalReservedCash,
    bankNavFloorApplied,
  };
}
