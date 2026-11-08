import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { isLabourFullMode } from "@/lib/labour/featureFlag";
import type { Character, Union } from "@/lib/db/types";

export type UnionLeaderOfferContext =
  { ok: false; response: Response } | { ok: true; db: Db; character: Character; union: Union };

/** Auth, feature gate, rate limit and lookups shared by the offer accept/decline routes. */
export async function loadUnionLeaderOffer(
  action: "accept" | "decline",
  params: Promise<{ id: string }>
): Promise<UnionLeaderOfferContext> {
  const auth = await requireBasicAuth();
  if (!auth.ok) return { ok: false, response: auth.response };

  if (!(await isLabourFullMode())) {
    return { ok: false, response: errorResponse(403, "Player-run unions are not enabled.") };
  }

  const rateLimit = checkRateLimit(
    `api/unions/[id]/leader/${action}:${auth.user.userId}`,
    10,
    60000
  );
  if (!rateLimit.ok) return { ok: false, response: rateLimitResponse(rateLimit.retryAfter) };

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return { ok: false, response: errorResponse(400, "Invalid union ID") };
  }

  const db = await getDb();
  const character = await getCharacterByUserId(db, auth.user.userId);
  if (!character) {
    return { ok: false, response: errorResponse(404, "Character not found") };
  }

  const union = await db.collection<Union>("unions").findOne({ _id: new ObjectId(id) });
  if (!union) {
    return { ok: false, response: errorResponse(404, "Union not found") };
  }

  return { ok: true, db, character, union };
}
