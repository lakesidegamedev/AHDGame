import { describe, expect, it } from "vitest";
import { characterSwitcherDetail } from "./characterSwitcherDetail";

describe("characterSwitcherDetail", () => {
  it("lists office, national influence and actions", () => {
    expect(
      characterSwitcherDetail({ officeLabel: "Senator", nationalInfluence: 12.34, actions: 40.9 })
    ).toBe("Senator · NI 12.3 · 40 actions");
  });

  it("falls back to zeros for a fresh character", () => {
    expect(
      characterSwitcherDetail({
        officeLabel: "Private Citizen",
        nationalInfluence: undefined,
        actions: undefined,
      })
    ).toBe("Private Citizen · NI 0.0 · 0 actions");
  });
});
