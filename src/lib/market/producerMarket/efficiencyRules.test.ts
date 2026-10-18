import { describe, expect, it } from "vitest";
import {
  organisationalOutputFactor,
  ORGANISATIONAL_EFFICIENCY_MIN_FACTOR,
} from "./efficiencyRules";

describe("organisational efficiency is productivity, not margin", () => {
  it("an off-type plant makes 15% less from the same inputs", () => {
    expect(organisationalOutputFactor({ typeMatchPp: -15, soeEfficiencyPp: 0 })).toBeCloseTo(
      0.85,
      12
    );
  });
  it("an own-type plant makes a little more", () => {
    expect(organisationalOutputFactor({ typeMatchPp: 5, soeEfficiencyPp: 0 })).toBeCloseTo(
      1.05,
      12
    );
  });
  it("state-company drag only ever lowers output", () => {
    expect(organisationalOutputFactor({ typeMatchPp: 0, soeEfficiencyPp: -20 })).toBeCloseTo(
      0.8,
      12
    );
    expect(organisationalOutputFactor({ typeMatchPp: 0, soeEfficiencyPp: 7 })).toBe(1);
  });
  it("never drops below the floor and ignores junk", () => {
    expect(organisationalOutputFactor({ typeMatchPp: -90, soeEfficiencyPp: -25 })).toBe(
      ORGANISATIONAL_EFFICIENCY_MIN_FACTOR
    );
    expect(organisationalOutputFactor({ typeMatchPp: NaN, soeEfficiencyPp: NaN })).toBe(1);
  });
});
