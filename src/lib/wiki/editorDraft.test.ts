import { describe, expect, it } from "vitest";
import { draftDiffersFrom, draftKey, DRAFT_MAX_AGE_MS, loadDraft, saveDraft } from "./editorDraft";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const fields = { title: "T", description: "D", content: "C", tags: ["a"] };

describe("editor drafts", () => {
  it("keys edit drafts per page", () => {
    expect(draftKey("edit", "player-1")).toBe("wiki-draft-edit-player-1");
    expect(draftKey("create")).toBe("wiki-draft-new");
  });

  it("restores what was saved", () => {
    const storage = memoryStorage();
    saveDraft(storage, "k", fields, 1000);
    expect(loadDraft(storage, "k", 2000)).toMatchObject({ ...fields, timestamp: 1000 });
  });

  it("drops a stale or broken draft", () => {
    const storage = memoryStorage();
    saveDraft(storage, "k", fields, 0);
    expect(loadDraft(storage, "k", DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.map.has("k")).toBe(false);
    storage.setItem("k", "{not json");
    expect(loadDraft(storage, "k", 5)).toBeNull();
    expect(storage.map.has("k")).toBe(false);
  });

  it("survives a storage that refuses writes", () => {
    const storage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(saveDraft(storage, "k", fields, 1)).toBe(false);
  });

  it("only offers a draft that differs from the saved page", () => {
    const draft = { ...fields, timestamp: 1 };
    expect(draftDiffersFrom(draft, fields)).toBe(false);
    expect(draftDiffersFrom(draft, { ...fields, content: "other" })).toBe(true);
  });
});
