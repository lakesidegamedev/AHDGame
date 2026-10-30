import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types/corporation";
import type { State } from "@/lib/db/types";
import { errorResponse } from "@/lib/api/errors";
import { directingParentCorporationId } from "@/lib/corporations/subsidiaries/authorization";

/**
 * Returns the canonical URL path segment for a corporation document.
 * Prefers sequentialId (including 0) over ObjectId hex, so client-facing
 * URLs stay short and stable even when sequentialId is falsy-but-defined.
 */
export function corporationPathIdFromDoc(doc: { _id: ObjectId; sequentialId?: number }): string {
  return doc.sequentialId != null ? String(doc.sequentialId) : doc._id.toString();
}

/**
 * Supports /api/corporations/[id] with sequential id or ObjectId hex.
 * ObjectId check runs first so all-numeric 24-char hex strings
 * (e.g. national-corp IDs like "700000000000000000000001") are not
 * misinterpreted as sequentialId integers.
 */
export function corporationQueryFromParamId(id: string): Record<string, unknown> | null {
  if (ObjectId.isValid(id) && id.length === 24) return { _id: new ObjectId(id) };
  if (/^\d+$/.test(id)) return { sequentialId: parseInt(id, 10) };
  return null;
}

/**
 * Resolve a corporation by route param (sequential ID or ObjectId).
 * Returns the corporation or an error NextResponse (400 or 404).
 */
export async function resolveCorporation(
  db: Db,
  id: string,
  projection?: Record<string, 0 | 1>
): Promise<{ ok: true; corporation: Corporation } | { ok: false; response: NextResponse }> {
  const query = corporationQueryFromParamId(id);
  if (!query) {
    return {
      ok: false,
      response: errorResponse(400, "Invalid corporation ID"),
    };
  }
  // Keep the editorial default exclusion with exclusion projections. Inclusion
  // projections already omit it and must not mix Mongo's two projection modes.
  const inclusion =
    projection && Object.entries(projection).some(([key, value]) => key !== "_id" && value === 1);
  const effectiveProjection = inclusion
    ? projection
    : { editorialStance: 0 as const, ...projection };
  const corporation = await db
    .collection<Corporation>("corporations")
    .findOne(query, { projection: effectiveProjection });
  if (!corporation) {
    return {
      ok: false,
      response: errorResponse(404, "Corporation not found"),
    };
  }

  // Backfill countryId from HQ state for pre-migration corporations
  if (!corporation.countryId && corporation.headquartersState) {
    const hqState = await db
      .collection<State>("states")
      .findOne({ _id: corporation.headquartersState }, { projection: { countryId: 1 } });
    if (hqState?.countryId) {
      corporation.countryId = hqState.countryId;
    }
  }

  return { ok: true, corporation };
}

/**
 * Check that the given userId matches the corporation CEO.
 * Returns a 403 NextResponse if not authorized, or null if OK.
 */
export function requireCeo(corporation: Corporation, userId: string): NextResponse | null {
  if (
    corporation.ceoVacant === true ||
    !corporation.userId ||
    corporation.userId.toString() !== userId
  ) {
    return errorResponse(403, "Only the CEO can perform this action");
  }
  return null;
}

export type CeoOrParentAuthorization =
  { ok: true; directingParentId: ObjectId | null } | { ok: false; response: NextResponse };

/**
 * The corporation's own CEO, or the controlling parent's CEO when the
 * corporation is an AI-run managed subsidiary. `directingParentId` is set only
 * on the parent path so the caller can stamp who made the change.
 */
export async function requireCeoOrDirectingParent(
  db: Db,
  corporation: Corporation,
  userId: string
): Promise<CeoOrParentAuthorization> {
  const ceoCheck = requireCeo(corporation, userId);
  if (!ceoCheck) return { ok: true, directingParentId: null };
  if (!ObjectId.isValid(userId)) return { ok: false, response: ceoCheck };
  const parentId = await directingParentCorporationId(db, new ObjectId(userId), corporation);
  if (!parentId) return { ok: false, response: ceoCheck };
  return { ok: true, directingParentId: parentId };
}
