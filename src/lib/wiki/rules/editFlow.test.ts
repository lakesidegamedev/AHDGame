import { describe, expect, it } from "vitest";
import { hasOpenPendingEdit, mergeApproval, planAuthorEdit } from "./editFlow";

const base = {
  title: "Title",
  description: "A description here",
  content: "x".repeat(60),
  tags: ["a"],
};

describe("planAuthorEdit", () => {
  it("parks an edit to a live page beside it", () => {
    const plan = planAuthorEdit({ ...base, status: "published" }, { content: "new ".repeat(20) });
    expect(plan.kind).toBe("hold-pending");
    if (plan.kind === "hold-pending") {
      expect(plan.edit.content).toBe("new ".repeat(20));
      expect(plan.edit.title).toBe("Title");
    }
  });

  it("writes in place and goes to review when the page is not live", () => {
    const plan = planAuthorEdit({ ...base, status: "draft" }, { title: "Other" });
    expect(plan).toEqual({
      kind: "write-in-place",
      fields: { title: "Other" },
      nextStatus: "pending_review",
    });
  });
});

describe("mergeApproval", () => {
  it("lets moderator edits override the author text", () => {
    const merged = mergeApproval(base, { editedTitle: "Fixed" });
    expect(merged.title).toBe("Fixed");
    expect(merged.content).toBe(base.content);
  });
});

describe("hasOpenPendingEdit", () => {
  it("ignores edits that were already declined", () => {
    expect(hasOpenPendingEdit({})).toBe(false);
    expect(hasOpenPendingEdit({ pendingEdit: {} })).toBe(true);
    expect(hasOpenPendingEdit({ pendingEdit: { rejection: { reason: "x" } } })).toBe(false);
  });
});
