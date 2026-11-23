import { describe, expect, it } from "vitest";
import { buildInputReceipt } from "./inputReceipt";

const base = {
  commodity: "steel",
  neededUnits: 100,
  stockUnits: 10,
  boughtUnits: 50,
  unsoldWithinLimitUnits: 0,
  unsoldAboveLimitUnits: 0,
};

describe("buildInputReceipt", () => {
  it("reports no blocker when the input arrived in full", () => {
    expect(buildInputReceipt({ ...base, boughtUnits: 90 })).toEqual({
      commodity: "steel",
      neededUnits: 100,
      arrivedUnits: 100,
      missingUnits: 0,
    });
  });

  it("names sold out sellers when nothing was left unsold", () => {
    const r = buildInputReceipt(base);
    expect(r.missingUnits).toBe(40);
    expect(r.blocker).toBe("sold_out");
  });

  it("names the price when only offers above the limit remained", () => {
    expect(buildInputReceipt({ ...base, unsoldAboveLimitUnits: 500 }).blocker).toBe(
      "price_above_limit"
    );
  });

  it("names a delivery gap when supply within the limit stayed unsold", () => {
    expect(
      buildInputReceipt({ ...base, unsoldWithinLimitUnits: 5, unsoldAboveLimitUnits: 500 }).blocker
    ).toBe("not_delivered");
  });

  it("records own-site units without touching the other fields", () => {
    const plain = buildInputReceipt(base);
    const own = buildInputReceipt({ ...base, ownSiteUnits: 30 });
    expect(own).toEqual({ ...plain, ownSiteUnits: 30 });
    expect(buildInputReceipt(base)).not.toHaveProperty("ownSiteUnits");
  });

  it("never reports more own-site units than were delivered", () => {
    expect(buildInputReceipt({ ...base, ownSiteUnits: 500 }).ownSiteUnits).toBe(50);
  });
});
