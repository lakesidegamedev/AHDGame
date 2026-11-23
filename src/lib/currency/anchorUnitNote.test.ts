import { describe, expect, it } from "vitest";
import { ANCHOR_UNIT_NOTE } from "./anchorUnitNote";

describe("ANCHOR_UNIT_NOTE", () => {
  it("explains the unit in plain words without dashes", () => {
    expect(ANCHOR_UNIT_NOTE).toMatch(/accounting unit/);
    expect(ANCHOR_UNIT_NOTE).not.toMatch(/[–—]/);
  });
});
