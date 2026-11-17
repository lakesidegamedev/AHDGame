import { recordProviderLinkAudit } from "@/lib/auth/providerLinkAudit";
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
import {
  bridgeAccountFromUser,
  centralRestoreAccount,
  centralWriteFirst,
  shadowMirrorWrite,
  type BridgeWriteOp,
} from "@/lib/auth/centralLogin";
import { isAuthMigrationFenced } from "@/lib/auth/sourceFence";
import { isProviderSubjectBanned, recordProviderLinkEvent } from "@/lib/auth/providerLinkHistory";
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
  const audit = (reason: Parameters<typeof recordProviderLinkAudit>[0]["reason"]) => {
    if (adapter.provider === "discord") {
      recordProviderLinkAudit({
        provider: adapter.provider,
        stage: "result",
        reason,
        userId: grant?.userId,
        state,
      });
    }
  };
  const result = (
    status: "success" | "error",
    reason?: "already_linked" | "registration_blocked" | "session_expired" | "exchange_failed"
  ) => {
    audit(status === "success" ? "completed" : (reason ?? "exchange_failed"));
    return adapter.linkResult(status, reason);
  };
  if (!grant) {
    audit("session_expired");
    return adapter.loginRequired();
  }

  const usersCollectionHandle = usersCollection(db);
  // Credential writes require the uncached account state, never the cached grant.
  const account = await usersCollectionHandle.findOne({ _id: new ObjectId(grant.userId) });
  if (!account) {
    audit("session_expired");
    return adapter.loginRequired();
  }

  // Verify the cryptographic cookie payload against the same fresh account so
  // a signed-out, revoked, or banned session cannot link a provider.
  const auth = await verifyAuth();
  if (!credentialSessionIsCurrent(grant.userId, account, auth)) {
    audit("session_expired");
    return adapter.loginRequired();
  }
  // Fenced accounts never mutate provider bindings via legacy link.
  if (isAuthMigrationFenced(account)) {
    return result("error", "session_expired");
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
  const context = verifyProviderLinkContext(linkCtx, {
    provider: adapter.provider,
    userId: grant.userId,
    iat: auth?.iat ?? -1,
    state,
  });
  if (!context.ok) {
    audit(context.reason === "account_mismatch" ? "account_mismatch" : "context_invalid");
    return adapter.linkResult("error", "session_expired");
  }

  // Check if this provider account is already linked to another user.
  const existingUser = await usersCollectionHandle.findOne({
    [adapter.idField]: adapter.externalId,
    _id: { $ne: new ObjectId(grant.userId) },
  } as Filter<User>);

  if (existingUser) {
    return result("error", "already_linked");
  }

  // A login account tied to a banned player cannot be linked to another account.
  if (await isProviderSubjectBanned(db, adapter.provider, adapter.externalId)) {
    return result("error", "registration_blocked");
  }

  // Never silently replace a different existing provider link; the old link
  // must be explicitly unlinked first.
  const link = decideProviderLink(account, adapter.provider, adapter.externalId);
  if (!link.ok) {
    return result("error", "already_linked");
  }
  if (link.mode === "idempotent") {
    return result("success");
  }

  // Central mode records the provider id centrally first; refuse if it is unreachable.
  const linkWrite: BridgeWriteOp = {
    op: "account-upsert",
    account: bridgeAccountFromUser(account, { [adapter.idField]: adapter.externalId }),
  };
  if (!(await centralWriteFirst(linkWrite))) {
    return result("error", "exchange_failed");
  }
  const restoreLink = () =>
    centralRestoreAccount(account, { overrides: { [adapter.idField]: null } });

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
    await restoreLink();
    return result("error", "exchange_failed");
  } finally {
    // A concurrent read may have repopulated the cache while the write was
    // pending; evict again after the settled write. A write can commit
    // despite a network error, so this also runs when the write throws or
    // goes unacknowledged.
    invalidateCachedUser(cacheKey);
  }
  if (write.acknowledged !== true) {
    await restoreLink();
    return result("error", "exchange_failed");
  }
  if (write.matchedCount !== 1) {
    await restoreLink();
    // A concurrent provider, password, ban, or revocation write won the
    // snapshot race. Never report success without a confirmed write.
    return result("error", "session_expired");
  }

  shadowMirrorWrite(linkWrite);
  await recordProviderLinkEvent(db, {
    userId: account._id,
    provider: adapter.provider,
    providerId: adapter.externalId,
    action: "link",
    at: linkedAt,
  });
  return result("success");
}
