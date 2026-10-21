/**
 * Shell for the CEO salary vote: reads the knob and the corporation's earnings,
 * decides whether a pay rise needs shareholders, and opens the vote. The rule
 * itself is in `rules/ceoSalaryVote.ts`.
 */
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { Character } from "@/lib/db/types/character";
import type { CorporationVote } from "@/lib/db/types/corporationVote";
import {
  anchorToCorpCapital,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { openCorporationVote } from "@/lib/corporations/votes/voteService";
import { notifyVoteEvent } from "@/lib/corporations/votes/voteNotifications";
import {
  ceoSalaryVoteCheck,
  trailingDailyNetIncome,
  type CeoSalaryVoteCheck,
} from "@/lib/corporations/rules/ceoSalaryVote";

export async function evaluateCeoSalaryVote(
  db: Db,
  corporation: Corporation,
  newSalary: number
): Promise<CeoSalaryVoteCheck & { freeCeilingLocal: number }> {
  const off = { required: false, freeCeiling: Infinity, noPositiveNetIncome: false };
  // Private corporations have no outside shareholders to ask; NPP and caretaker
  // pay runs through its own demand flow, and SOEs have no player CEO.
  if (corporation.isPrivate || isStateOwned(corporation))
    return { ...off, freeCeilingLocal: Infinity };
  if ((corporation.ceoType ?? "character") !== "character")
    return { ...off, freeCeilingLocal: Infinity };
  const cfg = await db
    .collection<{ ceoSalaryVoteNetIncomeShare?: number }>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { ceoSalaryVoteNetIncomeShare: 1 } });
  const share = cfg?.ceoSalaryVoteNetIncomeShare ?? 0;
  if (!(share > 0)) return { ...off, freeCeilingLocal: Infinity };
  const fxByCurrency = await loadFxRatesByCurrency(db);
  const dailyLocal = anchorToCorpCapital(
    trailingDailyNetIncome(corporation.earningsHistory),
    resolveCorpLiquidCurrencyCode(corporation),
    fxRateForCorpFromMap(corporation, fxByCurrency)
  );
  const check = ceoSalaryVoteCheck({
    currentSalary: corporation.ceoSalary ?? 0,
    newSalary,
    trailingDailyNetIncome: dailyLocal,
    share,
  });
  return { ...check, freeCeilingLocal: check.freeCeiling };
}

/** Open the pay vote for the CEO's requested salary and tell the shareholders. */
export async function openCeoSalaryVote(opts: {
  db: Db;
  corporation: Corporation;
  newSalary: number;
  currentTurn: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { db, corporation, newSalary, currentTurn } = opts;
  const character = await db
    .collection<Character>("characters")
    .findOne({ _id: corporation.ceoId });
  if (!character) return { ok: false, error: "CEO character not found" };
  const result = await openCorporationVote({
    db,
    corporation,
    character,
    currentTurn,
    type: "ceo_salary",
    payload: { newCeoSalary: newSalary },
  });
  if (!result.ok) return { ok: false, error: result.error };
  const inserted = await db
    .collection<CorporationVote>("corporationVotes")
    .findOne({ _id: new ObjectId(result.voteId) });
  if (inserted) {
    await notifyVoteEvent({
      db,
      vote: inserted,
      corpName: corporation.name,
      notificationType: "corp_vote_opened",
    });
  }
  return { ok: true };
}
