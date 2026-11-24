import { describe, expect, it } from "vitest";
import { mobileNavigationLayout } from "./mobileNavigationLayout";

describe("mobile navigation preferences", () => {
  it("gives every account the bottom dock until they pick a layout", () => {
    expect(mobileNavigationLayout(undefined)).toBe("dock");
    expect(mobileNavigationLayout(null)).toBe("dock");
  });

  it("respects a saved standard menu", () => {
    expect(mobileNavigationLayout("standard")).toBe("standard");
  });

  it("preserves explicit choices and safely handles old values", () => {
    for (const layout of ["dock", "standard"]) {
      expect(mobileNavigationLayout(layout)).toBe(layout);
    }
    expect(mobileNavigationLayout("unknown")).toBe("dock");
  });
});
