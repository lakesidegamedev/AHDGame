import { describe, it, expect } from "vitest";
import { dividendRemainder, cappedUnitDividend } from "./dividendRemainder";
describe("fund dividend cash allocation", () => {
  it("retains the exact sub-cent remainder", () => {
    const gross = 1.5,
      pass = gross * 0.25,
      paid = cappedUnitDividend(pass, 0, 100, pass / 100);
    expect(paid).toBe(0.37);
    expect(gross - pass + dividendRemainder(pass, paid) + paid).toBe(gross);
  });
  it("never pays more than the pool even with excessive recorded units", () => {
    const first = cappedUnitDividend(25, 0, 90, 0.25);
    const second = cappedUnitDividend(25, first, 90, 0.25);
    expect(first + second).toBe(25);
    expect(dividendRemainder(25, first + second)).toBe(0);
  });
  it("retains every penny when a fund has no issued units", () => {
    expect(cappedUnitDividend(25, 0, 0, 0)).toBe(0);
    expect(dividendRemainder(25, 0)).toBe(25);
  });
});
