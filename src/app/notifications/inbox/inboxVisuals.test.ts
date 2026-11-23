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
