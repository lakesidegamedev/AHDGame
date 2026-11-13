import { authConfig } from "@/lib/config/auth";
import { bridgeBreakerOpen } from "./bridgeClient";
import { getCentralLoginMode, getCentralLoginModeFor } from "./index";
import { READINESS_CACHE_MS, READINESS_TIMEOUT_MS } from "./hopRules";

interface CachedReadiness {
  issuer: string;
  ready: boolean;
  until: number;
}

let cached: CachedReadiness | null = null;

export function resetIssuerReadinessCache(): void {
  cached = null;
}

/**
 * Whether the central issuer answers right now. Central mode only: any other
 * mode reports not ready without a network call. The result is cached
 * in-process for a few seconds, and an open bridge breaker counts as not ready.
 * Never throws.
 */
export async function isHopIssuerReady(userId?: string): Promise<boolean> {
  const mode = userId ? getCentralLoginModeFor(userId) : getCentralLoginMode();
  if (mode !== "central") return false;
  const issuer = authConfig.unifiedOidcIssuer()?.replace(/\/+$/, "");
  if (!issuer) return false;
  if (bridgeBreakerOpen()) return false;
  const now = Date.now();
  if (cached && cached.issuer === issuer && now < cached.until) return cached.ready;
  let ready = false;
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      cache: "no-store",
      signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
    });
    ready = res.ok;
  } catch {
    ready = false;
  }
  cached = { issuer, ready, until: Date.now() + READINESS_CACHE_MS };
  return ready;
}
