/**
 * Client side of mothballing from the sector list (suggestion 412). It posts
 * the same `{ action }` body the sector page sends to the build route, so a
 * route rename breaks this function's test rather than the menu in silence.
 */
export type MothballAction = "mothball" | "reactivate";

export async function mothballSectorRequest(
  corpId: string,
  sectorId: string,
  action: MothballAction
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(`/api/corporations/${corpId}/sectors/${sectorId}/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}
