"use client";

import { captureClientException } from "@/lib/observability/sentryClientLazy";

/** A map request that never answers must fail, not leave the spinner up forever. */
export const MAP_FETCH_TIMEOUT_MS = 20_000;

export class MapLoadError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status: number | null
  ) {
    super(message);
    this.name = "MapLoadError";
  }
}

const reported = new Set<string>();

/**
 * Report a map load failure with the failing URL, status and page origin.
 * Unlike the generic fetch helper this also reports network-level failures,
 * because a blocked cross-origin request surfaces as one. Once per url/phase
 * per page session so a retry loop cannot flood the tracker.
 */
export function reportMapLoadFailure(phase: string, url: string, err: unknown): void {
  const key = `${phase}|${url}`;
  if (reported.has(key)) return;
  reported.add(key);
  const status = err instanceof MapLoadError ? err.status : null;
  captureClientException(err, {
    tags: { kind: "map-load", phase, ...(status != null ? { status } : {}) },
    extra: {
      url,
      status,
      origin: typeof window !== "undefined" ? window.location.origin : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
    },
  });
}

/** Fetch JSON with a hard timeout; throws MapLoadError carrying url and status. */
export async function fetchMapJson<T>(
  url: string,
  init?: Omit<RequestInit, "signal">,
  phase = "fetch"
): Promise<T> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(MAP_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new MapLoadError(`Map data failed to load (${res.status})`, url, res.status);
    return (await res.json()) as T;
  } catch (err) {
    const wrapped =
      err instanceof MapLoadError
        ? err
        : new MapLoadError(
            `Map data request failed: ${err instanceof Error ? err.message : String(err)}`,
            url,
            null
          );
    reportMapLoadFailure(phase, url, wrapped);
    throw wrapped;
  }
}

export function resetMapLoadReports(): void {
  reported.clear();
}
