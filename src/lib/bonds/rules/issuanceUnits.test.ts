import { describe, expect, it } from "vitest";
import { BOND_UNIT_FACE_VALUE } from "@/lib/constants/bonds";
import { bondUnitFaceAnchor, floorToBondUnits, wholeBondUnits } from "./issuanceUnits";

describe("bond issuance units", () => {
  it("a unit is 1,000 face in the bond's own currency, not 1,000 anchor", () => {
    const localPerAnchor = 150;
    expect(bondUnitFaceAnchor(BOND_UNIT_FACE_VALUE, localPerAnchor)).toBeCloseTo(1000 / 150, 10);
  });

  it("is identity for a currency worth one anchor unit", () => {
    expect(bondUnitFaceAnchor(BOND_UNIT_FACE_VALUE, 1)).toBe(1000);
  });

  it("slider floor and server unit count agree for the same request", () => {
    for (const localPerAnchor of [0.78, 1, 1.32, 150, 4200]) {
      const unit = bondUnitFaceAnchor(BOND_UNIT_FACE_VALUE, localPerAnchor);
      for (const anchor of [123_456.78, 999_999, 5_000_000.5]) {
        const sliderValue = floorToBondUnits(anchor, unit);
        const serverUnits = wholeBondUnits(sliderValue * localPerAnchor, BOND_UNIT_FACE_VALUE);
        expect(serverUnits).toBe(wholeBondUnits(anchor, unit));
        expect(sliderValue).toBeLessThanOrEqual(anchor);
        expect(anchor - sliderValue).toBeLessThan(unit);
      }
    }
  });

  it("does not drop a unit to float error at an exact multiple", () => {
    const unit = bondUnitFaceAnchor(BOND_UNIT_FACE_VALUE, 1.32);
    expect(wholeBondUnits(unit * 37, unit)).toBe(37);
  });

  it("returns zero for empty or invalid input", () => {
    expect(wholeBondUnits(0, 1000)).toBe(0);
    expect(wholeBondUnits(500, 1000)).toBe(0);
    expect(wholeBondUnits(5000, 0)).toBe(0);
  });
});
