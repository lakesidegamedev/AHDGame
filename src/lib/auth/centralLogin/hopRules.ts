import type { ShadowEventReason } from "./shadowEvents";

/**
 * Rules for the Lakeside session hop. Plain data in, plain data out: random
 * values and the clock are supplied by the caller.
 */

export const HOP_CALLBACK_PATH = "/api/auth/lakeside-hop/callback";
export const HOP_COOKIE_NAME = "ahd_lakeside_hop";
export const HOP_FLOW_TTL_MS = 10 * 60_000;

export interface HopAuthorizeInput {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  ticket: string;
}

export function buildHopAuthorizeUrl(input: HopAuthorizeInput): string {
  const url = new URL(`${input.issuer.replace(/\/+$/, "")}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    lakeside_ticket: input.ticket,
  }).toString();
  return url.toString();
}

export interface HopFlowRecord {
  state: string;
  nonce: string;
  userId: string;
  expiresAt: Date;
}

export interface HopCallbackInput {
  flow: HopFlowRecord | null;
  queryState: string | null;
  providerError: boolean;
  /** Claims of the verified ID token, or null when the exchange or verification failed. */
  claims: { nonce?: unknown; ahd_user_id?: unknown } | null;
  /** The user in AHD's own session cookie, or null when there is none. */
  sessionUserId: string | null;
  now: Date;
}

export type HopVerdict = { ok: true } | { ok: false; reason: ShadowEventReason };

/** Every check that must pass before the Lakeside session is considered established. */
export function judgeHopCallback(input: HopCallbackInput): HopVerdict {
  const { flow } = input;
  if (!flow || flow.expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reason: "hop_no_flow" };
  }
  if (input.providerError) return { ok: false, reason: "hop_provider_error" };
  if (!input.queryState || input.queryState !== flow.state) {
    return { ok: false, reason: "hop_state" };
  }
  if (!input.claims) return { ok: false, reason: "hop_exchange" };
  if (typeof input.claims.nonce !== "string" || input.claims.nonce !== flow.nonce) {
    return { ok: false, reason: "hop_nonce" };
  }
  if (!input.sessionUserId) return { ok: false, reason: "hop_no_session" };
  if (
    typeof input.claims.ahd_user_id !== "string" ||
    input.claims.ahd_user_id !== input.sessionUserId ||
    flow.userId !== input.sessionUserId
  ) {
    return { ok: false, reason: "hop_user_mismatch" };
  }
  return { ok: true };
}

/**
 * Where the browser lands after the hop. Only a path on this site or the
 * allowed Lakeside return URL is kept; anything else becomes the site root.
 */
export function safeHopDestination(
  destination: string | null | undefined,
  appOrigin: string,
  isAllowedExternal: (value: string) => boolean
): string {
  if (!destination) return "/";
  if (destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\")) {
    return destination;
  }
  try {
    const url = new URL(destination);
    if (url.origin === appOrigin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
  return isAllowedExternal(destination) ? destination : "/";
}

export const HOP_READY_PATH = "/api/auth/lakeside-hop/ready";
/** Server-side budget for the issuer discovery probe. */
export const READINESS_TIMEOUT_MS = 800;
export const READINESS_CACHE_MS = 10_000;
/** Client-side budget for the readiness call, covering the server probe and the network. */
export const READINESS_CLIENT_TIMEOUT_MS = 1500;

/** Where the login page goes after a successful password sign-in that offered a hop. */
export function chooseHopNavigation(
  hopUrl: string,
  readiness: { ready?: unknown } | null,
  destination: string
): string {
  return readiness !== null && readiness.ready === true ? hopUrl : destination;
}
