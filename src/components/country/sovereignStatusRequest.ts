/**
 * One shared read of `/api/country/[code]/sovereign-status`.
 *
 * Three panels stack on the country page (crisis decision, recovery progress,
 * bond market demand) and each used to fetch this same public payload on mount:
 * three identical requests per view, three times the server work for one answer.
 * The first caller starts the request and the rest join it, and the answer is
 * held briefly so a panel mounting a tick later does not start another.
 */

export interface SovereignStatusFetch {
  ok: boolean;
  data: Record<string, unknown> | null;
  /** Transport failure message, when the request threw. */
  error: string | null;
}

/** Long enough to cover the panels mounting across a couple of frames. */
const RESULT_TTL_MS = 5_000;

const inflight = new Map<string, Promise<SovereignStatusFetch>>();
const settled = new Map<string, { at: number; result: SovereignStatusFetch }>();

/**
 * The sovereign status payload for a country, shared across its panels.
 *
 * Same data and cache behaviour as the per-panel fetches it replaces: a GET with
 * the browser's default caching, and no payload at all on failure so each panel
 * keeps its own empty state.
 */
export function fetchSovereignStatus(countryCode: string): Promise<SovereignStatusFetch> {
  const url = `/api/country/${countryCode}/sovereign-status`;

  const held = settled.get(url);
  if (held && Date.now() - held.at < RESULT_TTL_MS) return Promise.resolve(held.result);

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = (async (): Promise<SovereignStatusFetch> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return { ok: false, data: null, error: null };
      const data = (await res.json()) as Record<string, unknown>;
      const result: SovereignStatusFetch = { ok: true, data, error: null };
      settled.set(url, { at: Date.now(), result });
      return result;
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : null,
      };
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}

/** Test hook: drop held answers between cases. */
export function clearSovereignStatusCache(): void {
  inflight.clear();
  settled.clear();
}
