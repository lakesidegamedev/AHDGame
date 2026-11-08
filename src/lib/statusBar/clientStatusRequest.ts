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
let unauthorized = false;

/**
 * True once this page load has been told 401 by the status route.
 *
 * The status request starts at mount off a server cookie hint, which can be a
 * stale or revoked token. The first 401 is the whole cost of that; without this
 * flag the bar's 60 second poll would keep re-asking the origin for the rest of
 * the visit.
 */
export function clientStatusUnauthorized(): boolean {
  return unauthorized;
}

/**
 * Fetch `/api/client-status` once per page load.
 *
 * Navbar and status bar mount together and both need this payload, so
 * concurrent callers share one request and a short-lived result
 * (`SHARED_RESULT_MS`). Each caller keeps its own mapping and retry policy;
 * the shared entry is briefly revalidated against the origin.
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
      if (res.status === 401) unauthorized = true;
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
