import { describe, expect, it } from "vitest";
import { CATEGORY_VISUALS, categoryVisualFor } from "./inboxVisuals";

describe("categoryVisualFor", () => {
  it("keeps a live crisis in the alarm colour", () => {
    expect(categoryVisualFor({ category: "crisis", type: "crisis" })).toBe(CATEGORY_VISUALS.crisis);
  });

  it("takes a resolved crisis out of the alarm colour", () => {
    expect(categoryVisualFor({ category: "crisis", type: "crisis_resolved" }).text).toBe(
      "text-success"
    );
  });
});

describe("previewSentence", () => {
  it("cuts the preview at the end of the first sentence", async () => {
    const { previewSentence } = await import("./RailItem");
    expect(
      previewSentence("The crisis in Ohio has ended. Approval recovers over the next turns.")
    ).toBe("The crisis in Ohio has ended.");
  });

  it("keeps text without a short first sentence", async () => {
    const { previewSentence } = await import("./RailItem");
    expect(previewSentence("Vote open")).toBe("Vote open");
  });
});
