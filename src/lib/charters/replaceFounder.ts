import type { Db, ObjectId } from "mongodb";
import type { PartyCharter, PartyCharterSignature } from "@/lib/db/types";
import { adjacentStates } from "@/lib/constants/stateAdjacency";
import { charactersCollection } from "@/lib/db/repositories/characters";

/**
 * Replace a founder slot. Accepts two entry states:
 *  - `founder-replacement`: involuntary; the founder was voided,
 *    rejected, or banned.
 *  - `pending-signatures`: voluntary swap of an inactive founder; only an
 *    UNSIGNED slot is eligible (a signed founder has committed).
 * Both end in `pending-signatures` with the new slot unsigned and
 * un-rejected. The replacement character must exist, be human-owned, and be
 * in the same country as the charter. Authorization (chair / admin / current
 * founder) is the caller's job.
 */
export type ReplaceFounderResult =
  | { ok: true; status: "pending-signatures" }
  | {
      ok: false;
      reason:
        | "charter-not-found"
        | "not-replaceable"
        | "outgoing-not-founder"
        | "outgoing-already-signed"
        | "replacement-already-founder"
        | "replacement-not-found"
        | "replacement-not-human"
        | "replacement-wrong-country"
        | "replacement-not-adjacent";
    };

export async function replaceFounder(
  charterId: ObjectId,
  outgoingCharacterId: ObjectId,
  replacementCharacterId: ObjectId,
  db: Db,
  now: Date = new Date()
): Promise<ReplaceFounderResult> {
  const charter = await db.collection<PartyCharter>("partyCharters").findOne({ _id: charterId });
  if (!charter) return { ok: false, reason: "charter-not-found" };
  const isVoluntary = charter.status === "pending-signatures";
  if (charter.status !== "founder-replacement" && !isVoluntary) {
    return { ok: false, reason: "not-replaceable" };
  }
  const outgoingIndex = charter.foundersCharacterIds.findIndex((c) =>
    c.equals(outgoingCharacterId)
  );
  if (outgoingIndex < 0) return { ok: false, reason: "outgoing-not-founder" };
  // Voluntary swap may only remove a founder who has NOT signed. A
  // signed founder has committed; their slot is off-limits to a swap.
  if (isVoluntary) {
    const outgoingSig = charter.signatures.find((s) => s.characterId.equals(outgoingCharacterId));
    if (outgoingSig?.signedAt) {
      return { ok: false, reason: "outgoing-already-signed" };
    }
  }
  if (charter.foundersCharacterIds.some((c) => c.equals(replacementCharacterId))) {
    return { ok: false, reason: "replacement-already-founder" };
  }

  // Validate the replacement character: exists, human-owned, same country.
  const replacement = await charactersCollection(db).findOne(
    { _id: replacementCharacterId },
    { projection: { _id: 1, userId: 1, countryId: 1, homeState: 1 } }
  );
  if (!replacement) return { ok: false, reason: "replacement-not-found" };
  if (!replacement.userId) return { ok: false, reason: "replacement-not-human" };
  if (replacement.countryId !== charter.countryId) {
    return { ok: false, reason: "replacement-wrong-country" };
  }

  // Founder adjacency: the replacement must live in or
  // adjacent to the anchor founder's (slot 0) home state — the same rule
  // `draftCharter` enforces on the original trio. When the anchor itself
  // is the outgoing slot, the outgoing anchor's home state still anchors
  // the check (the party's founding geography doesn't move). Skipped when
  // the anchor has no homeState (legacy seed data).
  const anchorCharacterId = charter.foundersCharacterIds[0];
  const anchor = anchorCharacterId
    ? await charactersCollection(db).findOne(
        { _id: anchorCharacterId },
        { projection: { _id: 1, homeState: 1 } }
      )
    : null;
  const anchorHomeState = anchor?.homeState || null;
  if (anchorHomeState) {
    const allowedStates = new Set<string>([
      anchorHomeState,
      ...adjacentStates(charter.countryId, anchorHomeState),
    ]);
    if (!replacement.homeState || !allowedStates.has(replacement.homeState)) {
      return { ok: false, reason: "replacement-not-adjacent" };
    }
  }

  const newFounders = [...charter.foundersCharacterIds];
  newFounders[outgoingIndex] = replacementCharacterId;

  // Replacement starts unsigned (un-rejected). Other founders' existing
  // signature state is preserved — they don't need to re-sign.
  const newSignatures: PartyCharterSignature[] = charter.signatures.map((s) =>
    s.characterId.equals(outgoingCharacterId) ? { characterId: replacementCharacterId } : s
  );

  // Phase 6 closeout fix F6 — guard the status transition with the exact
  // state we read (founder-replacement OR pending-signatures) so a concurrent
  // `expireCharters` sweep that flipped the charter to `expired`, or a racing
  // signer/ratifier, cannot be silently overwritten. For the voluntary path we
  // also re-assert the outgoing slot is still unsigned at write time.
  const guard: Record<string, unknown> = { _id: charterId, status: charter.status };
  if (isVoluntary) {
    guard["signatures"] = {
      $not: { $elemMatch: { characterId: outgoingCharacterId, signedAt: { $ne: null } } },
    };
  }
  const result = await db.collection<PartyCharter>("partyCharters").updateOne(guard, {
    $set: {
      foundersCharacterIds: newFounders,
      signatures: newSignatures,
      status: "pending-signatures",
      founderReplacementDeadline: null,
      founderReplacementDeadlineTurn: null,
      updatedAt: now,
    },
  });
  if (result.matchedCount === 0) {
    // Lost the race against expiration (or another caller already
    // replaced the slot and moved status forward).
    return { ok: false, reason: "not-replaceable" };
  }
  return { ok: true, status: "pending-signatures" };
}
