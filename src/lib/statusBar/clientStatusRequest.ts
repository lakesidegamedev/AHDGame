export const STATUS_BAR_LAYOUTS = ["standard", "corp", "elections", "full", "minimal"] as const;

export type StatusBarLayout = (typeof STATUS_BAR_LAYOUTS)[number];

export function normalizeStatusBarLayout(layout?: string | null): StatusBarLayout {
  if (!layout) return "standard";
  return STATUS_BAR_LAYOUTS.includes(layout as StatusBarLayout)
    ? (layout as StatusBarLayout)
    : "standard";
}

export function buildClientStatusUrl(layout?: string | null): string {
  const normalizedLayout = normalizeStatusBarLayout(layout);
  return `/api/client-status?layout=${normalizedLayout}`;
}

/**
 * The payload is intentionally untyped here: the two consumers read different
 * field subsets and each maps what it needs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClientStatusJson = Record<string, any>;

export interface ClientStatusJsonResult {
  ok: boolean;
  status: number;
  data: ClientStatusJson | null;
}

interface InflightRequest {
  url: string;
  promise: Promise<ClientStatusJsonResult>;
}

/** A short shared-result window absorbs the second component mounting a tick later. */
const SHARED_RESULT_MS = 1_500;

let inflight: InflightRequest | null = null;
let lastResult: { url: string; at: number; result: ClientStatusJsonResult } | null = null;

/**
 * Fetch `/api/client-status` once per page load.
 *
 * Both the navbar and the status bar need this payload, and they mount in the
 * same commit. Each used to fetch it independently — two requests and ~46 Mongo
 * commands per page view for one bar. Concurrent callers now share one request
 * (and one short-lived result), while each keeps its own mapping and retry
 * policy.
 *
 * The response is always revalidated against the origin: the shared entry only
 * lives for `SHARED_RESULT_MS`, and callers pass their own cache mode, which is
 * honoured by the first request of a page load.
 */
export function fetchClientStatusJson(
  url: string,
  init: RequestInit = {}
): Promise<ClientStatusJsonResult> {
  const now = Date.now();
  if (lastResult && lastResult.url === url && now - lastResult.at < SHARED_RESULT_MS) {
    return Promise.resolve(lastResult.result);
  }
  if (inflight && inflight.url === url) return inflight.promise;

  const entry = { url } as InflightRequest;
  const promise = (async (): Promise<ClientStatusJsonResult> => {
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        ...init,
      });
      if (!res.ok) return { ok: false, status: res.status, data: null };
      const data = (await res.json()) as ClientStatusJson;
      const result: ClientStatusJsonResult = { ok: true, status: res.status, data };
      lastResult = { url, at: Date.now(), result };
      return result;
    } catch {
      // Network/timeout: reported as a transport failure, not a payload.
      return { ok: false, status: 0, data: null };
    } finally {
      if (inflight === entry) inflight = null;
    }
  })();

  entry.promise = promise;
  inflight = entry;
  return promise;
}
