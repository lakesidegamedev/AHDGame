import { describe, expect, it } from "vitest";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import { operatingSectorIdentity } from "@/lib/constants/corporationsClient";
import { OPENING_PLANT_COUNT, nppOpeningUnits } from "./nppOpeningSize";

describe("NPP opening size", () => {
  it("is a whole number of standard plants for every lane", () => {
    for (const lane of OPERATING_SECTOR_TYPES) {
      const id = operatingSectorIdentity(lane);
      const plant = plantSizeUnits(lane, id.industryModel, id.mediaDiscriminator);
      expect(plant).toBeGreaterThan(0);
      expect(nppOpeningUnits(lane)).toBe(OPENING_PLANT_COUNT * plant);
    }
  });
});
