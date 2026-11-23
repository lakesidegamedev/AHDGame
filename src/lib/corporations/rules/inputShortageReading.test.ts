import { describe, expect, it } from "vitest";
import { inputShortageReading, inputSourceSplit } from "./inputShortageReading";

describe("inputShortageReading", () => {
  const receipts = [
    {
      commodity: "steel",
      neededUnits: 10,
      arrivedUnits: 6,
      missingUnits: 4,
      blocker: "sold_out" as const,
    },
    { commodity: "coal", neededUnits: 10, arrivedUnits: 10, missingUnits: 0 },
  ];

  it("scales a per-turn receipt to units a day and keeps the blocker", () => {
    expect(inputShortageReading(receipts, "steel", 5)).toEqual({
      turn: 5,
      neededPerDay: 240,
      arrivedPerDay: 144,
      missingPerDay: 96,
      blocker: "sold_out",
    });
  });

  it("reads zero missing and no blocker when the input arrived in full", () => {
    const r = inputShortageReading(receipts, "coal", 5)!;
    expect(r.missingPerDay).toBe(0);
    expect(r.blocker).toBeUndefined();
  });

  it("is null without a row", () => {
    expect(inputShortageReading(receipts, "oil", 5)).toBeNull();
    expect(inputShortageReading(undefined, "steel", 5)).toBeNull();
  });
});

describe("own-site units", () => {
  const receipt = { commodity: "steel", neededUnits: 10, arrivedUnits: 10, missingUnits: 0 };

  it("converts recorded own-site units to a daily figure", () => {
    const r = inputShortageReading([{ ...receipt, ownSiteUnits: 4 }], "steel", 3);
    expect(r?.ownSitePerDay).toBeGreaterThan(0);
  });

  it("leaves older receipts without the field", () => {
    expect(inputShortageReading([receipt], "steel", 3)).not.toHaveProperty("ownSitePerDay");
  });

  it("splits units, and flags an all own-site row", () => {
    expect(inputSourceSplit(100, 40)).toEqual({
      ownSitePerDay: 40,
      boughtPerDay: 60,
      allOwnSite: false,
    });
    expect(inputSourceSplit(100, 100)?.allOwnSite).toBe(true);
    expect(inputSourceSplit(100, undefined)).toBeNull();
    expect(inputSourceSplit(100, 0)).toBeNull();
  });
});
