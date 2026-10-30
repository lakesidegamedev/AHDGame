import { describe, expect, it } from "vitest";
import { experimentalMobileLayout, mobileNavigationLayout } from "./mobileNavigationLayout";

describe("mobile navigation preferences", () => {
  it("defaults opted-in accounts to the dock and requires explicit experimental opt-in", () => {
    expect(experimentalMobileLayout(true, undefined)).toBe("dock");
    for (const enabled of [false, undefined, "true"]) {
      expect(experimentalMobileLayout(enabled, "dock")).toBeNull();
    }
  });

  it("preserves explicit choices and safely handles old values", () => {
    for (const layout of ["dock", "standard"]) {
      expect(mobileNavigationLayout(layout)).toBe(layout);
    }
    expect(mobileNavigationLayout("unknown")).toBe("dock");
  });
});
