import { describe, expect, it } from "vitest";
import { fundedBuyerDemandRows, fundedBuyerKind } from "./fundedBuyerDemandRules";
import { fundedBuyerSourceRows } from "@/lib/commodities/fundedBuyerSources";

const wallet = (kind: string, country = "US") =>
  JSON.stringify(["epoch", kind, country, null, "USD"]);

describe("fundedBuyerKind", () => {
  it("reads wallet kinds and leaves company accounts out", () => {
    expect(fundedBuyerKind(wallet("publicBuyer"))).toBe("publicBuyer");
    expect(fundedBuyerKind(wallet("households"))).toBe("households");
    expect(fundedBuyerKind("6afb7ec6f2d559ce85b3bb10")).toBeNull();
    expect(fundedBuyerKind(wallet("operatingPayee"))).toBe("other");
    expect(fundedBuyerKind("not-json")).toBe("other");
  });
});

describe("fundedBuyerDemandRows", () => {
  it("sums ordered and received units by commodity and buyer kind, scaled", () => {
    const rows = fundedBuyerDemandRows(
      [
        {
          commodity: "healthcare_services",
          accountId: wallet("publicBuyer", "US"),
          requestedUnits: 3,
          deliveredUnits: 2,
        },
        {
          commodity: "healthcare_services",
          accountId: wallet("publicBuyer", "CA"),
          requestedUnits: 1,
          deliveredUnits: 1,
        },
        {
          commodity: "healthcare_services",
          accountId: wallet("households"),
          requestedUnits: 2,
          deliveredUnits: 1,
        },
        {
          commodity: "healthcare_services",
          accountId: "6afb7ec6f2d559ce85b3bb10",
          requestedUnits: 9,
          deliveredUnits: 9,
        },
        {
          commodity: "food",
          accountId: wallet("households"),
          requestedUnits: 0,
          deliveredUnits: 0,
        },
      ],
      24
    );
    expect(rows).toEqual([
      { commodity: "healthcare_services", kind: "households", requested: 48, delivered: 24 },
      { commodity: "healthcare_services", kind: "publicBuyer", requested: 96, delivered: 72 },
    ]);
  });

  it("rejects an invalid unit scale", () => {
    expect(() => fundedBuyerDemandRows([], 0)).toThrow();
  });
});

describe("fundedBuyerSourceRows", () => {
  it("lists one commodity's buyers, largest order first, with what they received", () => {
    const rows = fundedBuyerSourceRows(
      [
        { commodity: "healthcare_services", kind: "households", requested: 48, delivered: 24 },
        { commodity: "healthcare_services", kind: "publicBuyer", requested: 96, delivered: 72 },
        { commodity: "food", kind: "households", requested: 10, delivered: 10 },
      ],
      "healthcare_services"
    );
    expect(rows.map((r) => [r.name, r.units, r.receivedUnits])).toEqual([
      ["Government procurement", 96, 72],
      ["Households", 48, 24],
    ]);
  });
});
