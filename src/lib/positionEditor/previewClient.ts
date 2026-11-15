import type { DerivedComposition, EditorStateConfig } from "./types";

/** Ask the server for the census preview of each config, in order. */
export async function fetchDerivedPreviews(
  configs: EditorStateConfig[],
  signal?: AbortSignal
): Promise<DerivedComposition[]> {
  if (configs.length === 0) return [];
  const response = await fetch("/api/admin/position-editor/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ configs }),
    signal,
  });
  if (!response.ok) throw new Error(`Preview failed (${response.status})`);
  const data = (await response.json()) as { derived: DerivedComposition[] };
  return data.derived;
}
