import { describe, expect, it } from "vitest";
import { MARKETIZATION_SCHEDULE } from "./marketizationSchedule";
import { MARKETIZATION_SCHEDULE as FROM_COMMAND_ECONOMY } from "./commandEconomy";

describe("marketizationSchedule", () => {
  it("is the very map commandEconomy re-exports", () => {
    expect(FROM_COMMAND_ECONOMY).toBe(MARKETIZATION_SCHEDULE);
  });

  it("keeps a step for every country that is still planned in 1953", () => {
    for (const countryId of ["RU", "CN", "DD", "PL", "HU", "CS", "BG", "RO", "YU"] as const) {
      expect(MARKETIZATION_SCHEDULE[countryId]?.length).toBeGreaterThan(0);
    }
  });
});
