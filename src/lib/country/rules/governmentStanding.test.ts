import { describe, expect, it } from "vitest";
import { formedGovernmentLabel, isMinorityGovernment } from "./governmentStanding";

describe("governmentStanding", () => {
  it("does not call a 190-seat coalition in a 343-seat chamber a minority", () => {
    const input = {
      formationType: "minority" as const,
      seatsSupporting: 190,
      threshold: 172,
      coalitionPartnerCount: 2,
    };
    expect(isMinorityGovernment(input)).toBe(false);
    expect(formedGovernmentLabel(input)).toBe("Formed via Coalition");
  });
  it("calls support below the line a minority", () => {
    const input = { formationType: "coalition" as const, seatsSupporting: 150, threshold: 172 };
    expect(isMinorityGovernment(input)).toBe(true);
    expect(formedGovernmentLabel(input)).toBe("Formed as a minority government");
  });
  it("names a single party with enough seats a majority", () => {
    expect(
      formedGovernmentLabel({ formationType: "majority", seatsSupporting: 180, threshold: 172 })
    ).toBe("Formed with a majority");
  });
});
