import { describe, expect, it } from "vitest";
import { countBlockEmbargoes, tradeEligibilityScope } from "./tradeEligibilityScope";

describe("tradeEligibilityScope", () => {
  it("builds nothing on a modern world with no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeBlockEmbargoCount: 0 })).toEqual({
      routes: false,
      countryBooks: false,
    });
  });

  it("builds route eligibility but no country books on a modern world with an embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeBlockEmbargoCount: 1 })).toEqual({
      routes: true,
      countryBooks: false,
    });
  });

  it("builds both on an era world with no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 70, activeBlockEmbargoCount: 0 })).toEqual({
      routes: true,
      countryBooks: true,
    });
  });

  it("keeps country books on an era world with an embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 70, activeBlockEmbargoCount: 3 })).toEqual({
      routes: true,
      countryBooks: true,
    });
  });

  it("treats a non-finite embargo count as no embargo", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeBlockEmbargoCount: Number.NaN })).toEqual(
      {
        routes: false,
        countryBooks: false,
      }
    );
  });
});

describe("countBlockEmbargoes", () => {
  it("leaves cap-mode embargoes out, since route eligibility cannot carry a cap", () => {
    expect(countBlockEmbargoes([{ mode: "block" }, { mode: "cap" }, {}])).toBe(2);
  });

  it("keeps a modern world with only cap embargoes off the graph", () => {
    expect(
      tradeEligibilityScope({
        eraUnitScale: 1,
        activeBlockEmbargoCount: countBlockEmbargoes([{ mode: "cap" }]),
      }).routes
    ).toBe(false);
  });
});
