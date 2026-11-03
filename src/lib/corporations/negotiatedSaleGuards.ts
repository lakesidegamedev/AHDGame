/**
 * Safeguards for a negotiated private share sale (suggestion 397).
 *
 * A negotiated sale settles at any price the two players agree, so it can move
 * more money in one step than the daily personal wire allows. The deal is
 * recorded publicly on the company page; these checks stop the obvious abuse
 * paths before it can be created or paid:
 * - admin pause on player-to-player transfers;
 * - both characters past the new-character transfer barrier;
 * - two characters of one account;
 * - a strong alt-detection link between the two accounts, unless a moderator
 *   has dismissed the ring containing both.
 */
import type { Db, ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import type { AltCluster, AltLink } from "@/lib/db/types/altDetection";
import { getGameStateCollection } from "@/lib/db/collections";
import { resolveAltScoringConfig } from "@/lib/altDetection/config";
import {
  getNewCharacterTransferBarrier,
  NEW_CHARACTER_TRANSFER_BARRIER_TURNS,
} from "@/lib/character/newCharacterTransferBarrier";

export type NegotiatedSaleParty = Pick<
  Character,
  "_id" | "userId" | "name" | "createdTurn" | "createdAt"
>;

export type NegotiatedSaleGuardResult = { ok: true } | { ok: false; status: number; error: string };

/** Pure part: party identity and the new-character barrier. */
export function checkNegotiatedSaleParties(
  seller: NegotiatedSaleParty,
  buyer: NegotiatedSaleParty,
  currentTurn: number,
  effectiveNowMs: number
): NegotiatedSaleGuardResult {
  if (seller._id.equals(buyer._id)) {
    return { ok: false, status: 400, error: "You cannot sell shares to yourself" };
  }
  if (seller.userId.equals(buyer.userId)) {
    return {
      ok: false,
      status: 400,
      error: "Negotiated sales between characters of the same account are not allowed",
    };
  }
  for (const [party, who] of [
    [seller, "You"],
    [buyer, buyer.name],
  ] as const) {
    const barrier = getNewCharacterTransferBarrier(party, currentTurn, effectiveNowMs);
    if (barrier.blocked) {
      return {
        ok: false,
        status: 403,
        error: `${who === "You" ? "Your character is" : `${who} is`} too new for negotiated sales. New characters wait ${NEW_CHARACTER_TRANSFER_BARRIER_TURNS} turns (${barrier.remainingTurns} left).`,
      };
    }
  }
  return { ok: true };
}

function sortedPair(a: ObjectId, b: ObjectId): [ObjectId, ObjectId] {
  return a.toString() <= b.toString() ? [a, b] : [b, a];
}

/** Full check, including the admin transfer pause and alt detection. */
export async function checkNegotiatedSale(
  db: Db,
  seller: NegotiatedSaleParty,
  buyer: NegotiatedSaleParty,
  currentTurn: number,
  effectiveNowMs: number
): Promise<NegotiatedSaleGuardResult> {
  const parties = checkNegotiatedSaleParties(seller, buyer, currentTurn, effectiveNowMs);
  if (!parties.ok) return parties;

  const gameState = await (
    await getGameStateCollection(db)
  ).findOne({ _id: "current" }, { projection: { playerTransfersPaused: 1 } });
  if (gameState?.playerTransfersPaused) {
    return {
      ok: false,
      status: 403,
      error: "Player-to-player transfers are currently paused by an admin",
    };
  }

  const [userA, userB] = sortedPair(seller.userId, buyer.userId);
  const [link, config] = await Promise.all([
    db.collection<AltLink>("altLinks").findOne({ userA, userB }, { projection: { confidence: 1 } }),
    db
      .collection<{ _id: string; altScoring?: Parameters<typeof resolveAltScoringConfig>[0] }>(
        "gameConfig"
      )
      .findOne({ _id: "default" }, { projection: { altScoring: 1 } }),
  ]);
  const strongLink = resolveAltScoringConfig(config?.altScoring ?? null).thresholds.strongLink;
  if (link && link.confidence >= strongLink) {
    const dismissed = await db
      .collection<AltCluster>("altClusters")
      .findOne(
        { memberUserIds: { $all: [seller.userId, buyer.userId] }, status: "dismissed" },
        { projection: { _id: 1 } }
      );
    if (!dismissed) {
      return {
        ok: false,
        status: 403,
        error:
          "This negotiated sale needs a moderator review first. Open a support ticket if you think this is wrong.",
      };
    }
  }
  return { ok: true };
}
