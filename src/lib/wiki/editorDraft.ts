/**
 * Browser-saved drafts for the wiki editor. Storage is passed in so the
 * logic runs without a browser; the editor hands it `localStorage`.
 */

export interface EditorDraft {
  title: string;
  description: string;
  content: string;
  tags: string[];
  category?: string;
  difficulty?: "beginner" | "intermediate" | "advanced" | null;
  featured?: boolean;
  timestamp: number;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function draftKey(mode: "create" | "edit", slug?: string): string {
  return mode === "edit" ? `wiki-draft-edit-${slug ?? ""}` : "wiki-draft-new";
}

export function saveDraft(
  storage: DraftStorage,
  key: string,
  draft: Omit<EditorDraft, "timestamp">,
  now: number
): boolean {
  try {
    storage.setItem(key, JSON.stringify({ ...draft, timestamp: now }));
    return true;
  } catch {
    // Storage can be full or blocked; the editor still works without a draft.
    return false;
  }
}

/** Returns the saved draft, or null when it is missing, malformed or too old. */
export function loadDraft(storage: DraftStorage, key: string, now: number): EditorDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<EditorDraft>;
    const valid =
      typeof draft.title === "string" &&
      typeof draft.description === "string" &&
      typeof draft.content === "string" &&
      Array.isArray(draft.tags) &&
      typeof draft.timestamp === "number";
    if (!valid || now - (draft.timestamp as number) > DRAFT_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    return draft as EditorDraft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

/** A draft is worth offering back only when it differs from what is already saved. */
export function draftDiffersFrom(
  draft: EditorDraft,
  saved: { title: string; description: string; content: string; tags: string[] }
): boolean {
  return (
    draft.title !== saved.title ||
    draft.description !== saved.description ||
    draft.content !== saved.content ||
    draft.tags.join("\u0000") !== saved.tags.join("\u0000")
  );
}
