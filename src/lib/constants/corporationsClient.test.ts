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

  it("pins the load-bearing lane order and the shared clock constants", () => {
    // Seeded state-enterprise ids and specialization rotations derive from a
    // lane's position, so the specialized lanes must keep their slots.
    expect(slim.OPERATING_SECTOR_TYPES[6]).toBe("manufacturing_vehicles");
    expect(slim.OPERATING_SECTOR_TYPES[14]).toBe("media_entertainment");
    expect(slim.OPERATING_SECTOR_TYPES).toHaveLength(17);

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
