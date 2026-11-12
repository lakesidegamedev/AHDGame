import { NextResponse } from "next/server";
import { ObjectId, type Filter, type WithId } from "mongodb";
import { randomBytes, randomUUID } from "crypto";
import { SignJWT } from "jose";
import { captureIntakeEvent } from "@/lib/analytics/intakeEvents";
import {
  ACQUISITION_COOKIE,
  acquisitionEventProperties,
  parseAcquisition,
} from "@/lib/analytics/acquisition";
import { OAUTH_NEW_ACCOUNT_COOKIE } from "@/lib/analytics/storageKeys";
import { recordIdentitySignals } from "@/lib/identityHistory/recordObservation";
import { getJwtSecret, getAuthCookieOptions, getTrackingCookieOptions } from "@/lib/auth";
import { needsCharacterHint } from "@/lib/auth/characterGate";
import { setCharacterGateCookie } from "@/lib/auth/characterGateCookie";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";
import { createAdminLog } from "@/lib/adminLog";
import { createNotification } from "@/lib/notifications";
import { OAUTH_DEVICE_KEY_COOKIE, OAUTH_FINGERPRINT_COOKIE } from "@/lib/auth/oauthFingerprint";
import { resolveReferredByFromOAuthCookie } from "@/lib/auth/referralCode";
import { getClientIp } from "@/lib/utils/network";
import { isEmptyCfFingerprint, type CfFingerprint } from "@/lib/utils/cfFingerprint";
import { assertRegistrationAllowed } from "@/lib/auth/registrationGate";
import { normalizeIp } from "@/lib/utils/ipNormalize";
import { classifyDevice } from "@/lib/utils/userAgent";
import { checkIpFireAndForget } from "@/lib/ip/ipteoh";
import type { GameConfig, User } from "@/lib/db/types";
import { normalizeMaintenanceMode } from "@/lib/maintenanceStatus";
import { lakesideAccountFields } from "@/lib/auth/lakesideAccount";
import { loginDestination, takeOAuthReturnUrlCookie } from "@/lib/auth/lakesideLoginReturn";
import { resolveReauthIssuedAt } from "@/lib/auth/sessionIssue";
import { authMigrationFenceAbsentFilter, isAuthMigrationFenced } from "@/lib/auth/sourceFence";
import {
  bridgeAccountFromUser,
  centralRollbackCreate,
  getCentralLoginMode,
  centralWriteFirst,
  shadowMirrorWrite,
  shadowRecordProviderLogin,
  type BridgeWriteOp,
} from "@/lib/auth/centralLogin";
import { startLakesideHop } from "@/lib/auth/centralLogin/hop";
import type { OAuthCookieStore, OAuthDb, OAuthLoginAdapter } from "./types";
import { usersCollection } from "@/lib/db/repositories/users";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { activityLogCollection } from "@/lib/db/repositories/activityLog";
import type { Document } from "mongodb";

/** Player-facing welcome text; only the separator before "then" differs per provider. */
export function oauthWelcomeMessage(separator: string): string {
  return (
    "You've entered one of the most competitive political simulations online. " +
    `Create your character, choose a home state, and pick a party${separator} then start building influence. ` +
    "Use Actions to campaign, fundraise, and advertise. Enter elections to win office. " +
    "Primary elections narrow each party to one candidate; the general election decides the winner. " +
    "Good luck, and may the best politician win."
  );
}

/**
 * Logs in the account bound to the provider id, or registers a new one.
 * No existing session is required.
 */
export async function runOAuthLogin(
  db: OAuthDb,
  adapter: OAuthLoginAdapter,
  cookieStore: OAuthCookieStore,
  baseUrl: string,
  userAgent: string | null,
  cf: CfFingerprint
) {
  const usersCollectionHandle = usersCollection(db);
  const idFilter = { [adapter.idField]: adapter.externalId } as Filter<User>;

  const existingUser = await usersCollectionHandle.findOne(idFilter);
  if (existingUser) {
    return loginExistingUser(db, adapter, cookieStore, baseUrl, userAgent, cf, existingUser);
  }
  return registerNewUser(db, adapter, cookieStore, baseUrl, userAgent, cf);
}

/**
 * Central mode only: send the browser through the Lakeside session hop on the
 * way to the normal result page. Headers of the normal redirect are kept.
 * Any problem returns the normal redirect untouched.
 */
async function withLakesideHop(
  normal: NextResponse,
  userId: string,
  cookieStore: OAuthCookieStore,
  baseUrl: string
): Promise<NextResponse> {
  if (getCentralLoginMode() !== "central") return normal;
  const destination = normal.headers.get("location");
  if (!destination) return normal;
  const hopUrl = await startLakesideHop({
    userId,
    destination,
    cookieStore,
    fallbackOrigin: new URL(baseUrl).origin,
  });
  if (!hopUrl) return normal;
  const hop = NextResponse.redirect(hopUrl);
  normal.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "location") hop.headers.set(key, value);
  });
  return hop;
}

async function loginExistingUser(
  db: OAuthDb,
  adapter: OAuthLoginAdapter,
  cookieStore: OAuthCookieStore,
  baseUrl: string,
  userAgent: string | null,
  cf: CfFingerprint,
  existingUser: WithId<User>
) {
  const usersCollectionHandle = usersCollection(db);
  const idFilter = { [adapter.idField]: adapter.externalId } as Filter<User>;

  if (existingUser.isBanned) {
    const reason = encodeURIComponent(existingUser.banReason || "Violation of rules");
    return NextResponse.redirect(new URL(`/banned?reason=${reason}`, baseUrl));
  }
  // Fenced provider accounts never log in via legacy OAuth. Same
  // session_expired redirect as a revocation race so fenced is not an oracle.
  // This return sits before registration so a fenced alias never falls
  // through to duplicate creation.
  if (isAuthMigrationFenced(existingUser)) {
    return adapter.resultRedirect("error", "/login", "session_expired");
  }

  const existingTrack = cookieStore.get("__ahd_track")?.value;
  const trackingId = existingTrack || randomUUID();
  const oauthDeviceKey = cookieStore.get(OAUTH_DEVICE_KEY_COOKIE)?.value;
  cookieStore.delete(OAUTH_DEVICE_KEY_COOKIE);

  const clientIp = await getClientIp();
  const device = classifyDevice(userAgent);
  const observedAt = new Date();
  const issued = await resolveReauthIssuedAt(existingUser.authRevokedAt);
  if (!issued.ok) {
    return adapter.resultRedirect("error", "/login", "session_expired");
  }
  const token = await new SignJWT({
    userId: existingUser._id.toString(),
    email: existingUser.email,
    username: existingUser.username,
    role: existingUser.role,
    isAdmin: existingUser.isAdmin || false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issued.iat)
    .setExpirationTime("7d")
    .sign(getJwtSecret());

  const updateResult = await usersCollectionHandle.updateOne(
    {
      _id: existingUser._id,
      isBanned: { $ne: true },
      ...idFilter,
      ...issued.snapshotFilter,
      ...authMigrationFenceAbsentFilter(),
    },
    {
      $set: {
        lastLogin: observedAt,
        lastKnownIp: clientIp,
        lastKnownIpAt: observedAt,
        lastAuthToken: token.slice(-12),
        trackingId,
        trackingIdAt: observedAt,
        lastDevice: device,
        ...adapter.existingLoginFields(),
        // Stamp inside the guard: an OAuth login without a device key must
        // not refresh `deviceKeyAt` (src/lib/auth/identitySignals.ts).
        ...(oauthDeviceKey ? { deviceKey: oauthDeviceKey, deviceKeyAt: observedAt } : {}),
        ...(isEmptyCfFingerprint(cf)
          ? {}
          : {
              lastCf: cf,
              ...(existingUser.registrationCf == null ? { registrationCf: cf } : {}),
            }),
      },
    }
  );

  if (updateResult.matchedCount !== 1) {
    return adapter.resultRedirect("error", "/login", "session_expired");
  }

  cookieStore.set(AUTH_COOKIE_NAME, token, await getAuthCookieOptions());
  shadowRecordProviderLogin(
    existingUser._id.toString(),
    adapter.idField.replace(/Id$/, "") as "apple" | "google" | "discord"
  );
  await setCharacterGateCookie(
    cookieStore,
    needsCharacterHint({
      role: existingUser.role,
      isAdmin: existingUser.isAdmin === true,
      hasCharacter: existingUser.hasCompletedSetup ?? true,
    })
  );
  if (!existingTrack) {
    cookieStore.set("__ahd_track", trackingId, await getTrackingCookieOptions());
  }

  activityLogCollection<Document>(db)
    .insertOne({
      type: "login",
      timestamp: new Date(),
      userId: existingUser._id,
      username: existingUser.username,
      ipAddress: clientIp ?? undefined,
      userAgent: userAgent ?? undefined,
      trackingId,
      deviceKey: oauthDeviceKey || undefined,
    })
    .catch(() => {});

  // Identity history. IP only: the OAuth login path never carries a
  // fingerprint (the OAuth fingerprint cookie is read only on the new-user
  // branch). The fingerprint arrives moments later via the result page's
  // call to /api/auth/record-fingerprint, which records its own run.
  recordIdentitySignals(db, {
    userId: existingUser._id,
    ip: clientIp,
    observedAt,
    source: "oauth",
  });

  // Prefer a stashed Lakeside SSO continuation over the in-game default.
  const next = loginDestination(takeOAuthReturnUrlCookie(cookieStore, adapter.returnUrlCookie), {
    role: existingUser.role,
    isAdmin: existingUser.isAdmin === true,
    hasCompletedSetup: existingUser.hasCompletedSetup ?? true,
  });
  return withLakesideHop(
    adapter.resultRedirect("login_success", next),
    existingUser._id.toString(),
    cookieStore,
    baseUrl
  );
}

async function registerNewUser(
  db: OAuthDb,
  adapter: OAuthLoginAdapter,
  cookieStore: OAuthCookieStore,
  baseUrl: string,
  userAgent: string | null,
  cf: CfFingerprint
) {
  const usersCollectionHandle = usersCollection(db);
  const account = adapter.newAccount;

  // Block new registrations during maintenance (partial or full) and test
  // mode, mirroring the email signup path. Test mode limits signup to holders
  // of the test secret, which only the email form can carry.
  const gameConfig = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { maintenanceMode: 1, testMode: 1, ipDetectionEnabled: 1 } }
  );
  if (normalizeMaintenanceMode(gameConfig?.maintenanceMode) !== "off") {
    return adapter.resultRedirect("error", "/maintenance", "maintenance");
  }
  if (gameConfig?.testMode) {
    return adapter.resultRedirect("error", "/login", "test_mode");
  }

  // Gate new-user creation only; existing users re-authenticating via OAuth
  // never reach this branch.
  const clientIp = await getClientIp();
  const existingTrack = cookieStore.get("__ahd_track")?.value;
  const oauthFingerprint = cookieStore.get(OAUTH_FINGERPRINT_COOKIE)?.value;
  cookieStore.delete(OAUTH_FINGERPRINT_COOKIE);
  const oauthDeviceKey = cookieStore.get(OAUTH_DEVICE_KEY_COOKIE)?.value;
  cookieStore.delete(OAUTH_DEVICE_KEY_COOKIE);

  const referredByObjectId = await resolveReferredByFromOAuthCookie(
    cookieStore,
    usersCollectionHandle
  );

  const device = classifyDevice(userAgent);
  let gateDecision: Awaited<ReturnType<typeof assertRegistrationAllowed>> = {};
  try {
    gateDecision = await assertRegistrationAllowed(db, {
      clientIp,
      trackingId: existingTrack,
      fingerprint: oauthFingerprint,
      deviceKey: oauthDeviceKey,
      device,
    });
  } catch (err) {
    // ApiError: surface as a user-facing redirect rather than a 500.
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 403) {
      return adapter.resultRedirect("error", "/login", "registration_blocked");
    }
    throw err;
  }
  const trackingId = existingTrack || randomUUID();
  if (!existingTrack) {
    cookieStore.set("__ahd_track", trackingId, await getTrackingCookieOptions());
  }

  const baseUsername =
    account
      .usernameSeed()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 16) || "player";

  let username = baseUsername;
  let attempts = 0;
  const maxAttempts = 15;
  while (attempts < maxAttempts) {
    const taken = await usersCollectionHandle.findOne({ username });
    if (!taken) break;
    // Crypto-random suffix keeps collisions unguessable.
    const suffix = randomBytes(4).toString("hex");
    username = `${baseUsername}_${suffix}`.slice(0, 32);
    attempts++;
  }
  if (attempts >= maxAttempts) {
    username = account.fallbackUsername();
  }

  // Single instant for this row's timestamps, including the per-signal `*At`
  // stamps (src/lib/auth/identitySignals.ts).
  const newUserObservedAt = new Date();

  const acquisition = parseAcquisition(cookieStore.get(ACQUISITION_COOKIE)?.value);
  const newUserId = new ObjectId();
  // Central mode creates the central account first; refuse if it is unreachable.
  const createWrite: BridgeWriteOp = {
    op: "account-upsert",
    account: bridgeAccountFromUser(
      { _id: newUserId, username, email: account.email },
      { emailVerified: false, [adapter.idField]: adapter.externalId }
    ),
  };
  if (!(await centralWriteFirst(createWrite))) {
    return adapter.resultRedirect("error", "/login", "exchange_failed");
  }
  const result = await usersCollectionHandle
    .insertOne({
      _id: newUserId,
      ...(acquisition ? { acquisition } : {}),
      email: account.email,
      username,
      displayName: account.displayName(username),
      password: "", // No password for provider-only accounts: the login route rejects empty-password accounts
      role: "player",
      isAdmin: false,
      hasCompletedSetup: false,
      ...account.fields(newUserObservedAt),
      // Normalized so the IP-collision check matches consistently across
      // header variants (see registrationGate.ts).
      registrationIp: normalizeIp(clientIp) ?? clientIp,
      lastKnownIp: clientIp,
      lastKnownIpAt: newUserObservedAt,
      // Persist the fingerprint carried via the OAuth cookie so the registration
      // gate can match a later alt from the same device immediately (not only after
      // the post-auth record-fingerprint backfill).
      registrationFingerprint: oauthFingerprint || null,
      lastFingerprint: oauthFingerprint || null,
      ...(oauthFingerprint
        ? { registrationFingerprintAt: newUserObservedAt, lastFingerprintAt: newUserObservedAt }
        : {}),
      fingerprintHistory: oauthFingerprint ? [oauthFingerprint] : [],
      ...(isEmptyCfFingerprint(cf) ? {} : { registrationCf: cf, lastCf: cf }),
      trackingId,
      trackingIdAt: newUserObservedAt,
      deviceKey: oauthDeviceKey || null,
      ...(oauthDeviceKey ? { deviceKeyAt: newUserObservedAt } : {}),
      lastDevice: device,
      ...(referredByObjectId ? { referredBy: referredByObjectId } : {}),
      referralCount: 0,
      ...lakesideAccountFields(`ahd-${adapter.provider}`),
      createdAt: newUserObservedAt,
      updatedAt: newUserObservedAt,
    } as unknown as User)
    .catch(async (error: unknown) => {
      await centralRollbackCreate(newUserId.toHexString());
      throw error;
    });
  shadowMirrorWrite(createWrite);

  await createAdminLog({
    category: "account",
    action: "account_created",
    username,
    details: account.adminLogDetails,
  });

  // Anonymous, consent-independent signup count (see intakeEvents.ts).
  await captureIntakeEvent("account_registered", {
    auth_provider: adapter.provider,
    has_referral: Boolean(referredByObjectId),
    ...acquisitionEventProperties(acquisition),
  });

  // Identity history runs. Recorded after the insert so the run carries the
  // real user id.
  recordIdentitySignals(db, {
    userId: result.insertedId,
    ip: clientIp,
    fingerprint: oauthFingerprint,
    observedAt: newUserObservedAt,
    source: "oauth",
  });

  if (gateDecision.softAllow) {
    const sa = gateDecision.softAllow;
    await createAdminLog({
      category: "account",
      action: "cgnat_soft_allow",
      username,
      details: `Allowed despite IP collision (${sa.device})${account.softAllowSeparator} shared IP ${sa.sharedIp} already used by ${sa.existingCount} account${sa.existingCount === 1 ? "" : "s"}.`,
    });
  }

  // Fire-and-forget: IP/VPN detection via ipapi.co.
  const detectIp = () => {
    checkIpFireAndForget(clientIp).then((ipDetails) => {
      if (ipDetails) {
        usersCollectionHandle
          .updateOne({ _id: result.insertedId }, { $set: { ipDetails } })
          .catch(() => {});
      }
    });
  };
  if (account.ipDetection === "inline") {
    if (gameConfig?.ipDetectionEnabled) detectIp();
  } else {
    gameConfigCollection(db)
      .findOne({ _id: "default" }, { projection: { ipDetectionEnabled: 1 } })
      .then((config) => {
        if (config?.ipDetectionEnabled) detectIp();
      })
      .catch(() => {});
  }

  await createNotification({
    userId: result.insertedId as ObjectId,
    type: "welcome",
    title: "Welcome to A House Divided!",
    message: account.welcomeMessage,
  });

  const token = await new SignJWT({
    userId: result.insertedId.toString(),
    email: account.email,
    username,
    role: "player",
    isAdmin: false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());

  cookieStore.set(AUTH_COOKIE_NAME, token, await getAuthCookieOptions());
  // Brand-new OAuth account: no character yet, so gate it into /create-character.
  await setCharacterGateCookie(cookieStore, true);
  // Lets the consented client funnel record account_created for an OAuth
  // signup (see OAUTH_NEW_ACCOUNT_COOKIE). Carries only the provider name.
  cookieStore.set(OAUTH_NEW_ACCOUNT_COOKIE, adapter.provider, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });

  await usersCollectionHandle.updateOne(
    { _id: result.insertedId },
    // No `lastKnownIpAt` here: this `$set` writes no IP, and stamping it would
    // assert an observation that did not happen.
    {
      $set: {
        lastLogin: new Date(),
        lastAuthToken: token.slice(-12),
        trackingId,
        trackingIdAt: new Date(),
      },
    }
  );

  activityLogCollection<Document>(db)
    .insertOne({
      type: "login",
      timestamp: new Date(),
      userId: result.insertedId,
      username,
      ipAddress: clientIp ?? undefined,
      userAgent: userAgent ?? undefined,
      trackingId,
    })
    .catch(() => {});

  // New user needs character creation (unless a Lakeside SSO continuation wins).
  const next = loginDestination(takeOAuthReturnUrlCookie(cookieStore, adapter.returnUrlCookie), {
    role: "player",
    isAdmin: false,
    hasCompletedSetup: false,
  });
  return withLakesideHop(
    adapter.resultRedirect("login_success", next),
    result.insertedId.toString(),
    cookieStore,
    baseUrl
  );
}
