import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { authConfig } from "@/lib/config/auth";
import { getJwtSecret } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";
import { safeLakesideLoginReturn } from "@/lib/auth/lakesideLoginReturn";
import { getDb } from "@/lib/mongodb";
import { lakesideHopFlowsCollection } from "@/lib/db/repositories/lakesideHopFlows";
import { bridgeLoginTicket } from "./bridgeClient";
import { getCentralLoginMode } from "./index";
import {
  HOP_CALLBACK_PATH,
  HOP_COOKIE_NAME,
  HOP_FLOW_TTL_MS,
  buildHopAuthorizeUrl,
  judgeHopCallback,
  safeHopDestination,
} from "./hopRules";
import { recordShadowEvent, type ShadowEventReason } from "./shadowEvents";

/**
 * Lakeside session hop. After AHD has signed a player in, the browser makes
 * one round trip through the central issuer so a Lakeside session exists too.
 * The hop is a bonus: every failure lands the player on the normal
 * destination, already signed in to AHD.
 */

interface HopCookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

interface HopFlowDoc {
  _id: string;
  state: string;
  nonce: string;
  verifier: string;
  userId: string;
  destination: string;
  expiresAt: Date;
}

const jwksByIssuer = new Map<string, JWTVerifyGetKey>();

function jwksFor(issuer: string): JWTVerifyGetKey {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

function hopConfig() {
  const issuer = authConfig.unifiedOidcIssuer()?.replace(/\/+$/, "");
  const clientId = authConfig.unifiedOidcClientId();
  const clientSecret = authConfig.unifiedOidcClientSecret();
  if (!issuer || !clientId || !clientSecret) return null;
  return { issuer, clientId, clientSecret };
}

function appOriginFor(fallbackOrigin: string): string {
  const configured = authConfig.unifiedOidcRedirectUri();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request origin.
    }
  }
  return fallbackOrigin;
}

function recordHop(userId: string, ok: boolean, reason?: ShadowEventReason): Promise<void> {
  return recordShadowEvent({
    userId,
    kind: "hop",
    local: "n/a",
    central: "n/a",
    match: ok,
    hop: ok ? "ok" : "failed",
    ...(reason ? { reason } : {}),
    at: new Date(),
  });
}

/**
 * Central mode only. Returns the issuer URL to send the browser to, or null
 * when the hop is skipped; the caller then proceeds exactly as without a hop.
 * Never throws.
 */
export async function startLakesideHop(input: {
  userId: string;
  destination: string;
  cookieStore: HopCookieJar;
  fallbackOrigin: string;
}): Promise<string | null> {
  if (getCentralLoginMode() !== "central") return null;
  try {
    const config = hopConfig();
    // Not configured means the hop is not in use: nothing to record.
    if (!config) return null;
    const ticket = await bridgeLoginTicket(input.userId);
    if (!ticket.ok) {
      // A breaker skip is already recorded by the bridge client.
      if (!ticket.skipped) await recordHop(input.userId, false, "hop_ticket_failed");
      return null;
    }
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const flowId = randomUUID();
    const db = await getDb();
    await lakesideHopFlowsCollection<HopFlowDoc>(db).insertOne({
      _id: flowId,
      state,
      nonce,
      verifier,
      userId: input.userId,
      destination: input.destination,
      expiresAt: new Date(Date.now() + HOP_FLOW_TTL_MS),
    });
    input.cookieStore.set(HOP_COOKIE_NAME, flowId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/lakeside-hop",
      maxAge: HOP_FLOW_TTL_MS / 1000,
    });
    return buildHopAuthorizeUrl({
      issuer: config.issuer,
      clientId: config.clientId,
      redirectUri: `${appOriginFor(input.fallbackOrigin)}${HOP_CALLBACK_PATH}`,
      state,
      nonce,
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
      ticket: ticket.data,
    });
  } catch {
    return null;
  }
}

async function sessionUserId(cookieStore: HopCookieJar): Promise<string | null> {
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["iat", "exp"],
    });
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

async function exchangeForClaims(
  config: NonNullable<ReturnType<typeof hopConfig>>,
  redirectUri: string,
  code: string,
  verifier: string
): Promise<{ claims: Record<string, unknown> | null; reason: ShadowEventReason | null }> {
  const tokenResponse = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!tokenResponse.ok) return { claims: null, reason: "hop_exchange" };
  const tokens = (await tokenResponse.json()) as { id_token?: unknown; access_token?: unknown };
  if (typeof tokens.id_token !== "string") return { claims: null, reason: "hop_exchange" };
  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(tokens.id_token, jwksFor(config.issuer), {
      issuer: config.issuer,
      audience: config.clientId,
      requiredClaims: ["sub", "nonce", "exp", "iat"],
    });
    claims = { ...payload };
  } catch {
    return { claims: null, reason: "hop_token" };
  }
  // The account id may live on the userinfo document instead of the ID token.
  if (typeof claims.ahd_user_id !== "string" && typeof tokens.access_token === "string") {
    try {
      const info = await fetch(`${config.issuer}/protocol/openid-connect/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (info.ok) {
        const body = (await info.json()) as { ahd_user_id?: unknown; sub?: unknown };
        if (body.sub === claims.sub && typeof body.ahd_user_id === "string") {
          claims.ahd_user_id = body.ahd_user_id;
        }
      }
    } catch {
      // The claim stays absent and the verdict reports a user mismatch.
    }
  }
  return { claims, reason: null };
}

/**
 * Finishes a hop and returns where to send the browser. Always returns a
 * destination: success or failure, the player is already signed in to AHD.
 * This never creates or changes an AHD session.
 */
export async function finishLakesideHop(input: {
  query: URLSearchParams;
  cookieStore: HopCookieJar;
  fallbackOrigin: string;
}): Promise<string> {
  const origin = appOriginFor(input.fallbackOrigin);
  let destination = "/";
  let userId = "";
  try {
    const flowId = input.cookieStore.get(HOP_COOKIE_NAME)?.value;
    input.cookieStore.delete(HOP_COOKIE_NAME);
    const db = await getDb();
    const flow = flowId
      ? await lakesideHopFlowsCollection<HopFlowDoc>(db).findOneAndDelete({ _id: flowId })
      : null;
    if (flow) {
      userId = flow.userId;
      destination = safeHopDestination(flow.destination, origin, (value) =>
        Boolean(safeLakesideLoginReturn(value))
      );
    }
    const config = hopConfig();
    const code = input.query.get("code");
    let claims: Record<string, unknown> | null = null;
    let exchangeReason: ShadowEventReason | null = null;
    const stateOk = Boolean(flow && input.query.get("state") === flow.state);
    // The code is only spent once the flow and state check out.
    if (flow && config && code && stateOk && !input.query.get("error")) {
      const exchanged = await exchangeForClaims(
        config,
        `${origin}${HOP_CALLBACK_PATH}`,
        code,
        flow.verifier
      ).catch(() => ({ claims: null, reason: "hop_exchange" as ShadowEventReason }));
      claims = exchanged.claims;
      exchangeReason = exchanged.reason;
    }
    const verdict = judgeHopCallback({
      flow: flow ? { ...flow } : null,
      queryState: input.query.get("state"),
      providerError: Boolean(input.query.get("error")) || !code || !config,
      claims,
      sessionUserId: await sessionUserId(input.cookieStore),
      now: new Date(),
    });
    if (verdict.ok) await recordHop(userId, true);
    else
      await recordHop(
        userId,
        false,
        claims === null && exchangeReason ? exchangeReason : verdict.reason
      );
  } catch {
    await recordHop(userId, false, "hop_exchange");
  }
  return destination;
}
