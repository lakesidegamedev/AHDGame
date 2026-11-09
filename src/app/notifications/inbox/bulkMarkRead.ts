import { BULK_READ_MAX_IDS } from "@/lib/inbox/bulkRead";

/** A 429 that asks for a longer wait than this is reported instead of waited out. */
const MAX_RETRY_WAIT_SECONDS = 10;

export interface BulkReadResult {
  /** Ids whose chunk the server did not accept. */
  failedIds: Set<string>;
  /** True when any chunk was refused for sending requests too quickly. */
  rateLimited: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function patchChunk(
  url: string,
  ids: string[],
  sleep: (ms: number) => Promise<void>
): Promise<"ok" | "rate_limited" | "failed"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      return "failed";
    }
    if (res.ok) return "ok";
    if (res.status !== 429) return "failed";
    const retryAfter = Number(res.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
    if (attempt === 1 || wait > MAX_RETRY_WAIT_SECONDS) return "rate_limited";
    await sleep(wait * 1000);
  }
  return "rate_limited";
}

/**
 * Marks ids read through a bulk endpoint, in chunks the server accepts. One
 * request covers a whole chunk, so a long unread list costs a couple of
 * requests instead of one per item. A rate-limited chunk is retried once after
 * the server's Retry-After when that wait is short.
 */
export async function bulkMarkRead(
  url: string,
  ids: string[],
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<BulkReadResult> {
  const failedIds = new Set<string>();
  let rateLimited = false;
  for (let start = 0; start < ids.length; start += BULK_READ_MAX_IDS) {
    const chunk = ids.slice(start, start + BULK_READ_MAX_IDS);
    if (rateLimited) {
      // Still inside the refused window: do not spend more requests on it.
      chunk.forEach((id) => failedIds.add(id));
      continue;
    }
    const outcome = await patchChunk(url, chunk, sleep);
    if (outcome === "ok") continue;
    if (outcome === "rate_limited") rateLimited = true;
    chunk.forEach((id) => failedIds.add(id));
  }
  return { failedIds, rateLimited };
}
