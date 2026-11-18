import { describe, it, expect } from "vitest";
import { buildElectricityNetwork, gridZone } from "./network";
import { createGridLedger } from "./paths";
import { electricityMode } from "./types";
describe("versioned electricity catalog", () => {
  it("never treats unknown geography as a worldwide grid", () => {
    const ledger = createGridLedger(buildElectricityNetwork(2027, "enforced"));
    expect(ledger.path({ countryId: "US" }, { countryId: "JP" })).toBeNull();
    expect(
      ledger.path({ countryId: "US", stateId: "HI" }, { countryId: "US", stateId: "CT" })
    ).toBeNull();
    expect(
      ledger.path({ countryId: "CA", stateId: "CA_NU" }, { countryId: "CA", stateId: "CA_ON" })
    ).toBeNull();
    expect(ledger.path({}, { countryId: "US" })).toBeNull();
  });
  it("recognizes regions and commissioned submarine links", () => {
    expect(gridZone({ countryId: "CA", stateId: "CA_NL" })).toBe("CA:NL");
    expect(buildElectricityNetwork(2024, "shadow").links.some((l) => l.id === "Greenlink")).toBe(
      false
    );
    expect(buildElectricityNetwork(2027, "shadow").links.some((l) => l.id === "Greenlink")).toBe(
      true
    );
    expect(
      createGridLedger(buildElectricityNetwork(2027, "enforced")).path(
        { countryId: "UK" },
        { countryId: "IE" }
      )
    ).not.toBeNull();
  });
  it("defaults safely to shadow and rejects invalid dates and capacities", () => {
    expect(electricityMode(null)).toBe("shadow");
    expect(() => buildElectricityNetwork(NaN, "shadow")).toThrow();
    const grid = buildElectricityNetwork(2027, "shadow");
    expect(() =>
      createGridLedger({ ...grid, links: [{ ...grid.links[0], capacity: -1 }] })
    ).toThrow();
  });
});
