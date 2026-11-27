import { describe, expect, it } from "vitest";
import { retoolQuote, readRetoolQuote } from "./retoolQuote";
const input = {
  revenueAnchor: 1000,
  baseFraction: 0.25,
  multiplier: 0.4,
  downsideFraction: 0.3,
  freeConversion: false,
  shortageDiscount: false,
  foreignSpreadRate: 0.01,
};
describe("shared retool pricing", () => {
  it("discounts only the base fee and prices foreign spread over the complete method charge", () => {
    expect(retoolQuote(input)).toMatchObject({
      baseRetoolCost: 100,
      downsideCharge: 300,
      foreignSpread: 4,
      retoolCost: 404,
    });
  });
  it.each(["freeConversion", "shortageDiscount"])(
    "%s waives the base fee but preserves the method charge",
    (flag) => {
      expect(retoolQuote({ ...input, [flag]: true })).toMatchObject({
        baseRetoolCost: 0,
        downsideCharge: 300,
        foreignSpread: 3,
        retoolCost: 303,
      });
    }
  );
  it("does not silently price missing inputs or accept incomplete display records", () => {
    expect(() => retoolQuote({ ...input, revenueAnchor: NaN })).toThrow();
    expect(readRetoolQuote({ retoolCost: 100 })).toBeNull();
    expect(readRetoolQuote(retoolQuote(input))).toEqual(retoolQuote(input));
  });
});
