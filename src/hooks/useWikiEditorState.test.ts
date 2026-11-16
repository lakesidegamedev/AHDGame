import { describe, expect, it } from "vitest";
import { initialWikiEditorState, wikiEditorReducer } from "./useWikiEditorState";

describe("wikiEditorReducer", () => {
  it("loads saved page content without marking it as unsaved", () => {
    const next = wikiEditorReducer(initialWikiEditorState, {
      type: "LOAD_INITIAL",
      fields: { title: "Page", content: "Body" },
    });
    expect(next.title).toBe("Page");
    expect(next.isDirty).toBe(false);
  });

  it("keeps the text and stays dirty when a save fails", () => {
    let state = wikiEditorReducer(initialWikiEditorState, {
      type: "SET_FIELD",
      field: "content",
      value: "my long edit",
    });
    state = wikiEditorReducer(state, { type: "SUBMIT_START" });
    state = wikiEditorReducer(state, { type: "SUBMIT_ERROR", error: "Server said no" });
    expect(state.content).toBe("my long edit");
    expect(state.isDirty).toBe(true);
    expect(state.isSaving).toBe(false);
    expect(state.errors._form).toBe("Server said no");
  });

  it("clears the dirty flag only after a successful save", () => {
    let state = wikiEditorReducer(initialWikiEditorState, {
      type: "SET_FIELD",
      field: "title",
      value: "X",
    });
    state = wikiEditorReducer(state, { type: "SUBMIT_SUCCESS" });
    expect(state.isDirty).toBe(false);
  });

  it("restores a draft as unsaved work", () => {
    const next = wikiEditorReducer(initialWikiEditorState, {
      type: "LOAD_DRAFT",
      draft: { content: "from draft" },
    });
    expect(next.content).toBe("from draft");
    expect(next.isDirty).toBe(true);
  });
});
