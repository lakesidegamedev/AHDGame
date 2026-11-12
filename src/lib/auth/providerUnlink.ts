import { NextResponse } from "next/server";
import { ObjectId, type Db, type UpdateFilter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { verifyAuth } from "@/lib/auth";
import { credentialSessionIsCurrent } from "@/lib/auth/credentialSession";
import { invalidateCachedUser } from "@/lib/auth/userDocCache";
import {
  decideProviderUnlink,
  providerWriteSnapshotFilter,
  type ProviderKind,
} from "@/lib/auth/providerCredentialWrite";
import { errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import {
  CENTRAL_WRITE_UNAVAILABLE_MESSAGE,
  bridgeAccountFromUser,
  centralWriteFirst,
  getCentralLoginMode,
  shadowMirrorWrite,
} from "@/lib/auth/centralLogin";
import type { User } from "@/lib/db/types";
import { usersCollection } from "@/lib/db/repositories/users";

export interface ProviderUnlinkSpec {
  provider: ProviderKind;
  /** Provider fields cleared from the user document. */
  unset: NonNullable<UpdateFilter<User>["$unset"]>;
  /** Provider-specific refusal, checked after the last-sign-in-method guard. */
  beforeWrite?: (db: Db, account: { appleId?: unknown }) => Promise<Response | null>;
}

/** Shared unlink flow for the OAuth provider routes; the caller owns auth. */
export async function unlinkProviderCredential(
  userId: string,
  { provider, unset, beforeWrite }: ProviderUnlinkSpec
): Promise<Response> {
  const rateLimit = checkRateLimit(`api/auth/${provider}/unlink:${userId}`, 10, 60000);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

  const db = await getDb();
  const usersCollectionHandle = usersCollection(db);

  // Credential writes require the uncached account state, never the cached grant.
  const account = await usersCollectionHandle.findOne({ _id: new ObjectId(userId) });
  if (!account) {
    return errorResponse(404, "User not found", {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Verify the cryptographic cookie payload against the same fresh account
  // so a signed-out, revoked, or banned session cannot unlink a provider.
  if (!credentialSessionIsCurrent(userId, account, await verifyAuth())) {
    return errorResponse(401, "Please sign in again before changing sign-in methods.", {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const unlink = decideProviderUnlink(account, provider);
  if (!unlink.ok && unlink.reason === "not_linked") {
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if (!unlink.ok) {
    return errorResponse(
      400,
      "Cannot remove your last sign-in method. Set a password or link another account first.",
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const refusal = await beforeWrite?.(db, account);
  if (refusal) return refusal;

  // Central mode clears the provider id centrally first; refuse if it is unreachable.
  const providerField = `${provider}Id` as const;
  const unlinkWrite =
    getCentralLoginMode() === "off"
      ? null
      : ({
          op: "account-upsert",
          account: bridgeAccountFromUser(account, { [providerField]: null }),
        } as const);
  if (unlinkWrite && !(await centralWriteFirst(unlinkWrite))) {
    return errorResponse(503, CENTRAL_WRITE_UNAVAILABLE_MESSAGE, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Evict before the write so parallel requests re-read the pre-unlink record.
  // The key is canonical: the fresh account id, not the cached grant.
  const cacheKey = account._id.toHexString();
  invalidateCachedUser(cacheKey);
  const revokedAt = new Date();
  let write;
  try {
    write = await usersCollectionHandle.updateOne(
      {
        _id: new ObjectId(userId),
        ...providerWriteSnapshotFilter(account),
      },
      {
        $unset: unset,
        // The credential relationship changed: revoke existing sessions so
        // the caller reauthenticates before further credential writes.
        $max: { authRevokedAt: revokedAt },
      }
    );
  } catch {
    return errorResponse(503, "Unlink is temporarily unavailable. Please try again.", {
      headers: { "Cache-Control": "private, no-store" },
    });
  } finally {
    // A concurrent read may have repopulated the cache while the write was
    // pending; evict again after the settled write. A write can commit
    // despite a network error, so this also runs when the write throws or
    // goes unacknowledged.
    invalidateCachedUser(cacheKey);
  }
  if (write.acknowledged !== true) {
    return errorResponse(503, "Unlink is temporarily unavailable. Please try again.", {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (write.matchedCount !== 1) {
    // A concurrent provider, password, ban, or revocation write won the
    // snapshot race. Never report success without a confirmed write.
    return errorResponse(
      409,
      "Your account changed during this request. Please sign in and try again.",
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  if (unlinkWrite) shadowMirrorWrite(unlinkWrite);

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
