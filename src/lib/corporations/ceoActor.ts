import type { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types/corporation";

/** The request principal: the account plus the character it is playing as. */
export interface CeoActor {
  userId: string;
  activeCharacterId?: string | null;
  character?: { _id: ObjectId | string } | null;
}

function actorCharacterId(actor: CeoActor): string | null {
  if (actor.character?._id) return String(actor.character._id);
  return actor.activeCharacterId ?? null;
}

/**
 * True when the acting character runs the corporation. The account must match
 * and, when the corporation records a CEO character, so must the active
 * character: a sibling character on the CEO's account is not the CEO. Imperial
 * CEOs, legacy corporations without a CEO character and caretakers that record
 * no underlying character stay account-level, as does a request whose active
 * character is unknown.
 */
export function isCeoActor(
  corporation: Pick<Corporation, "userId" | "ceoId" | "ceoType" | "ceoVacant" | "caretakerCeo">,
  actor: CeoActor
): boolean {
  if (corporation.ceoVacant === true || !corporation.userId) return false;
  if (corporation.userId.toString() !== String(actor.userId)) return false;
  const active = actorCharacterId(actor);
  if (!active) return true;
  const caretaker = corporation.caretakerCeo;
  if (caretaker) {
    // A caretaker appointed on a vacancy can record only the account; keep the
    // account rule there rather than lock the owner out.
    if (!caretaker.underlyingCharacterId) return true;
    return caretaker.underlyingCharacterId.toString() === active;
  }
  if (corporation.ceoType === "imperial" || corporation.ceoType === "npp") return true;
  if (!corporation.ceoId) return true;
  return corporation.ceoId.toString() === active;
}

/** Read-path form: does this viewer (account plus active character) run the corporation? */
export function viewerRunsCorporation(
  corporation: Pick<Corporation, "userId" | "ceoId" | "ceoType" | "ceoVacant" | "caretakerCeo">,
  viewerUserId: string | null | undefined,
  viewerCharacterId?: string | null
): boolean {
  if (!viewerUserId) return false;
  return isCeoActor(corporation, { userId: viewerUserId, activeCharacterId: viewerCharacterId });
}
