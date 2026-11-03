import { describe, expect, it } from "vitest";
import { birthRateIndexToTFR } from "@/lib/demographics/flows/fertility";
import { fertilityPolicyIndex } from "./fertilityPolicy";

function settled(opening: number, pressure: number, maxBoost: number) {
  let index = opening;
  for (let turn = 0; turn < 2000; turn++)
    index = fertilityPolicyIndex(opening, index, pressure, 2.06, maxBoost);
  return birthRateIndexToTFR(index, 2.06);
}

describe("funded fertility ceiling", () => {
  it("uses the selected +0.40 ceiling by default", () => {
    const index = fertilityPolicyIndex(35, 35, 1.05);
    expect(birthRateIndexToTFR(index, 2.06) - birthRateIndexToTFR(35, 2.06)).toBeCloseTo(
      0.35 * 0.02
    );
  });
  it.each([0.24, 0.32, 0.4])("caps positive pressure at +%s children", (maxBoost) => {
    for (const opening of [25, 45, 55]) {
      const start = birthRateIndexToTFR(opening, 2.06);
      expect(settled(opening, 1.2, maxBoost)).toBeCloseTo(start + maxBoost, 8);
      expect(settled(opening, 100, maxBoost)).toBeCloseTo(start + maxBoost, 8);
      expect(settled(opening, 0.6, maxBoost)).toBeCloseTo(start + maxBoost / 2, 8);
      expect(settled(opening, 0, maxBoost)).toBeCloseTo(start, 8);
    }
  });

  it("leaves negative funding pressure unchanged across candidates", () => {
    for (const pressure of [-0.6, -1.2, -100]) {
      const old = settled(45, pressure, 0.24);
      expect(settled(45, pressure, 0.32)).toBeCloseTo(old, 10);
      expect(settled(45, pressure, 0.4)).toBeCloseTo(old, 10);
    }
  });

  it("retains gradual adjustment, expiry and absolute bounds", () => {
    const start = 35;
    const next = fertilityPolicyIndex(start, start, 1.2, 2.06, 0.4);
    expect(birthRateIndexToTFR(next, 2.06) - birthRateIndexToTFR(start, 2.06)).toBeCloseTo(
      0.4 * 0.02
    );
    expect(fertilityPolicyIndex(start, next, 0, 2.06, 0.4)).toBeLessThan(next);
    expect(settled(100, 1.2, 0.4)).toBeCloseTo(3.4 * 2.06);
    expect(settled(0, -1.2, 0.4)).toBeCloseTo(0.4 * 2.06);
    for (const maxBoost of [-1, NaN, Infinity])
      expect(() => fertilityPolicyIndex(start, start, 1, 2.06, maxBoost)).toThrow();
  });
});
