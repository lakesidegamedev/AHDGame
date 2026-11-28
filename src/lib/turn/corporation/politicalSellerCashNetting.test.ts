import { describe, expect, it } from "vitest";
import { politicalSellerCashNetting } from "./settleCorporationAccounts";

describe("politicalSellerCashNetting", () => {
  it("does not claw back political receipts from sectors the funded producer market settled", () => {
    const netting = politicalSellerCashNetting(
      new Map([["corp-a", 21_517.08]]),
      new Map([
        ["funded-ca-sector", { corporationId: "corp-a", local: 21_500 }],
        ["legacy-ny-sector", { corporationId: "corp-a", local: 17.08 }],
      ]),
      new Set(["funded-ca-sector"])
    );

    expect(netting.get("corp-a")).toBeCloseTo(17.08, 10);
  });

  it("keeps netting legacy sellers whose revenue already carries the political fill", () => {
    const netting = politicalSellerCashNetting(
      new Map([["corp-b", 40]]),
      new Map([["legacy-sector", { corporationId: "corp-b", local: 40 }]]),
      new Set()
    );

    expect(netting.get("corp-b")).toBe(40);
  });
});
