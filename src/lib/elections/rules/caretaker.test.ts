import { describe, expect, it } from "vitest";
import { caretakerBlocksBill, isCaretakerActive, openCaretaker } from "./caretaker";

describe("caretaker government", () => {
  const caretaker = openCaretaker(10, "A. Leader");

  it("is active while the government is not formed", () => {
    expect(isCaretakerActive({ status: "pending", caretaker })).toBe(true);
  });

  it("ends once a government is formed, even with the stale marker present", () => {
    expect(isCaretakerActive({ status: "formed", caretaker })).toBe(false);
  });

  it("is inactive without a marker", () => {
    expect(isCaretakerActive({ status: "pending" })).toBe(false);
    expect(isCaretakerActive(null)).toBe(false);
  });

  it("blocks major bills but not flavor-only bills", () => {
    const gov = { status: "pending", caretaker };
    expect(caretakerBlocksBill(gov, "economic")).toBe(true);
    expect(caretakerBlocksBill(gov, "custom")).toBe(false);
    expect(caretakerBlocksBill({ status: "formed", caretaker }, "economic")).toBe(false);
  });
});
