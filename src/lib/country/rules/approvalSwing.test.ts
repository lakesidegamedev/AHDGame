import { describe, expect, it } from "vitest";
import { approvalSwingStory } from "./approvalSwing";

describe("approvalSwingStory", () => {
  it("reports a large one-turn drop", () => {
    const story = approvalSwingStory({
      countryName: "United States",
      before: 26.7,
      after: 14.7,
      headName: "Calloway",
    });
    expect(story?.title).toBe("United States approval drops 12.0 points");
    expect(story?.content).toContain("from 26.7% to 14.7%");
    expect(story?.content).toContain("Calloway");
  });

  it("reports a large rise", () => {
    expect(approvalSwingStory({ countryName: "Canada", before: 30, after: 36 })?.title).toBe(
      "Canada approval jumps 6.0 points"
    );
  });

  it("stays quiet for small moves and bad numbers", () => {
    expect(approvalSwingStory({ countryName: "X", before: 40, after: 43 })).toBeNull();
    expect(approvalSwingStory({ countryName: "X", before: NaN, after: 10 })).toBeNull();
  });
});
