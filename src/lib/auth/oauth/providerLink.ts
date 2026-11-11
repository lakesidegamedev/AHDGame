import { ObjectId, type Filter } from "mongodb";
import { getAuthUser, verifyAuth } from "@/lib/auth";
import { credentialSessionIsCurrent } from "@/lib/auth/credentialSession";
import { invalidateCachedUser } from "@/lib/auth/userDocCache";
import {
  decideProviderLink,
  providerWriteSnapshotFilter,
} from "@/lib/auth/providerCredentialWrite";
import {
  providerLinkContextCookieName,
  verifyProviderLinkContext,
} from "@/lib/auth/providerLinkContext";
import { isAuthMigrationFenced } from "@/lib/auth/sourceFence";
import type { User } from "@/lib/db/types";
import type { OAuthCookieStore, OAuthDb, OAuthLinkAdapter } from "./types";
import { usersCollection } from "@/lib/db/repositories/users";

/** Links a provider account to the signed-in user. Requires a current session. */
export async function runOAuthLink(
  db: OAuthDb,
  adapter: OAuthLinkAdapter,
  cookieStore: OAuthCookieStore,
  state: string
) {
  const grant = await getAuthUser();
  if (!grant) {
    return adapter.loginRequired();
  }

  const usersCollectionHandle = usersCollection(db);
  // Credential writes require the uncached account state, never the cached grant.
  const account = await usersCollectionHandle.findOne({ _id: new ObjectId(grant.userId) });
  if (!account) {
    return adapter.loginRequired();
  }

  // Verify the cryptographic cookie payload against the same fresh account so
  // a signed-out, revoked, or banned session cannot link a provider.
  const auth = await verifyAuth();
  if (!credentialSessionIsCurrent(grant.userId, account, auth)) {
    return adapter.loginRequired();
  }
  // Fenced accounts never mutate provider bindings via legacy link.
  if (isAuthMigrationFenced(account)) {
    return adapter.linkResult("error", "session_expired");
  }

  // The link flow started by one account/session must not complete for another:
  // the sealed link context binds canonical userId plus the original session
  // iat, provider, and CSRF state. Delete it from this browser jar so the
  // callback cannot replay here, then verify the current session still matches
  // the initiating binding before any link write. The delete is jar-local, not
  // a durable server-side single-use marker; replay beyond this jar is stopped
  // by the binding check itself, and provider OAuth code replay is prevented
  // separately by the single-use code exchange with the provider.
  const linkCtxCookie = providerLinkContextCookieName(adapter.provider);
  const linkCtx = cookieStore.get(linkCtxCookie)?.value;
  cookieStore.delete(linkCtxCookie);
  if (
    !verifyProviderLinkContext(linkCtx, {
      provider: adapter.provider,
      userId: grant.userId,
      iat: auth?.iat ?? -1,
      state,
    }).ok
  ) {
    return adapter.linkResult("error", "session_expired");
  }

  // Check if this provider account is already linked to another user.
  const existingUser = await usersCollectionHandle.findOne({
    [adapter.idField]: adapter.externalId,
    _id: { $ne: new ObjectId(grant.userId) },
  } as Filter<User>);

  if (existingUser) {
    return adapter.linkResult("error", "already_linked");
  }

  // Never silently replace a different existing provider link; the old link
  // must be explicitly unlinked first.
  const link = decideProviderLink(account, adapter.provider, adapter.externalId);
  if (!link.ok) {
    return adapter.linkResult("error", "already_linked");
  }
  if (link.mode === "idempotent") {
    return adapter.linkResult("success");
  }

  // Evict before the write so parallel requests re-read the pre-link record.
  // The key is canonical: the fresh account id, not the cached grant.
  const cacheKey = account._id.toHexString();
  invalidateCachedUser(cacheKey);
  const linkedAt = new Date();
  let write;
  try {
    write = await usersCollectionHandle.updateOne(
      {
        _id: new ObjectId(grant.userId),
        ...providerWriteSnapshotFilter(account),
      },
      {
        $set: adapter.linkFields(linkedAt),
        // The credential relationship changed: revoke existing sessions so
        // the caller reauthenticates before further credential writes.
        $max: { authRevokedAt: linkedAt },
      }
    );
  } catch {
    return adapter.linkResult("error", "exchange_failed");
  } finally {
    // A concurrent read may have repopulated the cache while the write was
    // pending; evict again after the settled write. A write can commit
    // despite a network error, so this also runs when the write throws or
    // goes unacknowledged.
    invalidateCachedUser(cacheKey);
  }
  if (write.acknowledged !== true) {
    return adapter.linkResult("error", "exchange_failed");
  }
  if (write.matchedCount !== 1) {
    // A concurrent provider, password, ban, or revocation write won the
    // snapshot race. Never report success without a confirmed write.
    return adapter.linkResult("error", "session_expired");
  }

  return adapter.linkResult("success");
}
