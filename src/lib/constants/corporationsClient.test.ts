import { describe, expect, it } from "vitest";
import * as full from "./corporations";
import * as slim from "./corporationsClient";

describe("corporationsClient", () => {
  it("re-exports the exact tables corporations.ts serves, so server imports cannot drift", () => {
    expect(full.CORPORATION_TYPES).toBe(slim.CORPORATION_TYPES);
    expect(full.OPERATING_SECTOR_TYPES).toBe(slim.OPERATING_SECTOR_TYPES);
    expect(full.CORPORATION_TYPE_LABELS).toBe(slim.CORPORATION_TYPE_LABELS);
    expect(full.OPERATING_SECTOR_TYPE_LABELS).toBe(slim.OPERATING_SECTOR_TYPE_LABELS);
  });

  it("pins the sector count and the shared clock constants", () => {
    expect(slim.OPERATING_SECTOR_TYPES).toHaveLength(15);
    expect(slim.OPERATING_SECTOR_TYPES).toEqual(slim.CORPORATION_TYPES);

    expect(slim.TURNS_PER_DAY).toBe(24);
    expect(slim.GROWTH_RATE_TURNS_PER_YEAR).toBe(48);
    expect(slim.MAX_DIVIDEND_RATE).toBe(25);
  });

  it("labels every corporation type and operating lane", () => {
    for (const type of slim.CORPORATION_TYPES) {
      expect(slim.CORPORATION_TYPE_LABELS[type]).toBeTruthy();
    }
    for (const lane of slim.OPERATING_SECTOR_TYPES) {
      expect(slim.OPERATING_SECTOR_TYPE_LABELS[lane]).toBeTruthy();
    }
  });
});

describe("OPERATING_SECTOR_CHOICES", () => {
  it("lists every sector type once with its label", async () => {
    const { OPERATING_SECTOR_CHOICES, OPERATING_SECTOR_TYPES } =
      await import("./corporationsClient");
    const keys = OPERATING_SECTOR_CHOICES.map((c) => c.key);
    expect([...keys].sort()).toEqual([...OPERATING_SECTOR_TYPES].sort());
    const label = (k: string) => OPERATING_SECTOR_CHOICES.find((c) => c.key === k)?.label;
    expect(label("manufacturing")).toBe("Manufacturing");
    expect(label("media")).toBe("Media");
  });
});
