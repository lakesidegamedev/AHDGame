import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import type { ElectionsPageResponse } from "@/lib/elections/electionDisplay";

const DEFAULT_PAGE_SIZE = 500;

/**
 * Every live election in a country, in summary view, paging the list endpoint
 * until its `total` is read. Shared by the elections board and the Campaign
 * Manager, which both show the whole country at once. `status` and `type`
 * narrow the list (finished races of one type, for Campaign Manager's history).
 */
export async function fetchAllElections(
  countryId: string,
  opts: { pageSize?: number; signal?: AbortSignal; status?: string[]; type?: string } = {}
): Promise<{ elections: ElectionResponse[]; error?: string; aborted?: true }> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const elections: ElectionResponse[] = [];
  let page = 1;
  const filters =
    (opts.status?.length ? `&status=${opts.status.join(",")}` : "") +
    (opts.type ? `&type=${encodeURIComponent(opts.type)}` : "");
  try {
    for (;;) {
      const res = await fetch(
        `/api/elections?country=${countryId}&view=summary&limit=${pageSize}&page=${page}${filters}`,
        { signal: opts.signal ?? AbortSignal.timeout(15_000) }
      );
      if (!res.ok) {
        console.error(`Failed to fetch elections: ${res.status}`);
        return { elections: [], error: `Failed to fetch elections: ${res.status}` };
      }
      const data = (await res.json()) as ElectionsPageResponse;
      const batch = Array.isArray(data.elections) ? data.elections : [];
      elections.push(...batch);
      const total = typeof data.total === "number" ? data.total : elections.length;
      if (batch.length <= 0 || page * pageSize >= total) break;
      page++;
    }
    return { elections };
  } catch (err) {
    // The caller cancelled (an unmount, a newer request): not a failure.
    if (opts.signal?.aborted) return { elections: [], aborted: true };
    console.error("Error fetching elections:", err);
    return { elections: [], error: String(err) };
  }
}
