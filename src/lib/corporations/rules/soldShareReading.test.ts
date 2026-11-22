import { describe, expect, it } from "vitest";
import { SOLD_SHARE_POOL_NOTE, soldShareTitle } from "./soldShareReading";

describe("soldShareTitle", () => {
  it("keeps the caller's sentence and adds the shared-price note", () => {
    const title = soldShareTitle("Share that found buyers.");
    expect(title.startsWith("Share that found buyers. ")).toBe(true);
    expect(title.endsWith(SOLD_SHARE_POOL_NOTE)).toBe(true);
  });

  it("uses no dashes", () => {
    expect(SOLD_SHARE_POOL_NOTE).not.toMatch(/[–—]/);
  });
});
