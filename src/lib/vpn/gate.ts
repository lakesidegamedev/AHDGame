import { ERROR_CATALOG } from "@/lib/errors/catalog";
import type { IpClassification } from "./detection";

/** Stable error code returned to clients when a write is blocked by the VPN gate. */
export const VPN_BLOCKED_CODE = "VPN_BLOCKED";

export const VPN_BLOCKED_MESSAGE = ERROR_CATALOG.VPN_BLOCKED.message;

/**
 * API namespaces a VPN-gated player may still write to: signing in and out,
 * account settings, reporting a problem, and client telemetry. Everything
 * else (every game action) is blocked.
 */
const ALLOWED_WRITE_PREFIXES = [
  "/api/auth/",
  "/api/settings/",
  "/api/feedback",
  "/api/ask-drawer/",
  "/api/analytics/",
  "/api/client-status",
  "/api/performance",
  "/api/push/",
  "/api/notifications/",
];

export function isVpnGateAllowedWritePath(pathname: string): boolean {
  return ALLOWED_WRITE_PREFIXES.some((prefix) => {
    const base = prefix.replace(/\/$/, "");
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

export interface VpnGateSubject {
  isAdmin?: boolean;
  isModerator?: boolean;
  isJuniorDev?: boolean;
  vpnWhitelisted?: boolean;
}

/**
 * Whether this signed-in user is VPN-gated given their connection.
 * Staff are never gated; whitelisted players are never gated; Private Relay
 * is exempt.
 */
export function isVpnGated(user: VpnGateSubject, classification: IpClassification): boolean {
  if (classification !== "vpn") return false;
  if (user.isAdmin || user.isModerator || user.isJuniorDev) return false;
  return user.vpnWhitelisted !== true;
}

/** Whether a request should be blocked: a gated user making a game write. */
export function shouldBlockVpnRequest(args: {
  method: string;
  pathname: string;
  user: VpnGateSubject | null;
  classification: IpClassification;
}): boolean {
  const method = args.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!args.user) return false;
  if (isVpnGateAllowedWritePath(args.pathname)) return false;
  return isVpnGated(args.user, args.classification);
}
