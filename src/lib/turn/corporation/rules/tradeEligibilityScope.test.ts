import { describe, expect, it } from "vitest";
import { tradeEligibilityScope } from "./tradeEligibilityScope";

describe("tradeEligibilityScope", () => {
  it("builds nothing on a modern world with no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeEmbargoCount: 0 })).toEqual({
      routes: false,
      countryBooks: false,
    });
  });

  it("builds route eligibility but no country books on a modern world with an embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeEmbargoCount: 1 })).toEqual({
      routes: true,
      countryBooks: false,
    });
  });

  it("builds both on an era world with no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 70, activeEmbargoCount: 0 })).toEqual({
      routes: true,
      countryBooks: true,
    });
  });

  it("keeps country books on an era world with an embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 70, activeEmbargoCount: 3 })).toEqual({
      routes: true,
      countryBooks: true,
    });
  });

  it("treats a non-finite embargo count as no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeEmbargoCount: Number.NaN })).toEqual({
      routes: false,
      countryBooks: false,
    });
  });
});
