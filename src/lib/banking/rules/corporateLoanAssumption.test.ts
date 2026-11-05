import { describe, expect, it } from "vitest";
import { corporateLoanAssumptionRefusal } from "./corporateLoanAssumption";
import { assumedSecuredPrincipalAnchor } from "./constructionBorrowerTransfer";

describe("ordinary loans an absorbing corporation takes on", () => {
  it("allows live loans in the new owner's currency", () => {
    expect(
      corporateLoanAssumptionRefusal(
        [
          { status: "current", currency: "USD" },
          { status: "arrears", currency: "USD" },
        ],
        "USD"
      )
    ).toBeNull();
    expect(corporateLoanAssumptionRefusal([], undefined)).toBeNull();
  });

  it("refuses a request still waiting on the bank", () => {
    expect(corporateLoanAssumptionRefusal([{ status: "pending", currency: "USD" }], "USD")).toMatch(
      /waiting on the bank/
    );
  });

  it("refuses a live loan in another currency", () => {
    expect(corporateLoanAssumptionRefusal([{ status: "current", currency: "EUR" }], "USD")).toMatch(
      /repaid in EUR.*cash in USD/
    );
  });
});

describe("secured principal a new owner takes on", () => {
  it("converts each balance to the anchor and ignores empty ones", () => {
    const fx = new Map([
      ["GBP", 0.5],
      ["USD", 1],
    ]);
    expect(
      assumedSecuredPrincipalAnchor(
        [
          { outstandingLocal: 1_000, currency: "GBP" },
          { outstandingLocal: 500, currency: "USD" },
          { outstandingLocal: 0, currency: "USD" },
          { outstandingLocal: Number.NaN, currency: "USD" },
        ],
        fx
      )
    ).toBe(2_500);
  });

  it("counts a currency with no usable rate at face", () => {
    expect(
      assumedSecuredPrincipalAnchor([{ outstandingLocal: 700, currency: "XYZ" }], new Map())
    ).toBe(700);
  });
});
