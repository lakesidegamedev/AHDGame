import { describe, it, expect } from "vitest";
import { runSourcingPass, type SourcingInputs } from "@/lib/logistics/sourcing";
import type { ElectricityNetwork } from "./rules/types";
const network: ElectricityNetwork = {
  version: "test",
  year: 2027,
  mode: "enforced",
  notes: [],
  links: [
    { id: "tie", from: "US", to: "CA", capacity: 10, loss: 0.1, name: "Test", source: "test" },
  ],
};
function run(mode: ElectricityNetwork["mode"], commodity = "energy", buyer = "CA", state = "ON") {
  const balances = new Map([[commodity, { supply: 100, demand: 0 }]]),
    demand = new Map([[commodity, { supply: 0, demand: 100 }]]);
  const input: SourcingInputs = {
    states: [{ stateId: state, countryId: buyer as "CA" }],
    byState: new Map([[state, demand]]) as SourcingInputs["byState"],
    byCountry: new Map([
      ["US", balances],
      [buyer, demand],
    ]) as SourcingInputs["byCountry"],
    statePricesFor: () => ({ [state]: 10 }),
    nationalPricesFor: () => ({ US: 1 }),
    basePriceFor: () => 10,
    freightPrice: 1,
    hops: () => 1,
    tariffRatePct: () => 0,
    isBlocked: () => false,
    electricityNetwork: { ...network, mode },
  };
  return runSourcingPass(input);
}
describe("aggregate electricity sourcing", () => {
  it("caps foreign deliveries after line losses", () => {
    const result = run("enforced");
    const flows = result.flows.filter((f) => f.commodity === "energy");
    expect(flows.reduce((s, f) => s + f.units, 0)).toBeCloseTo(9);
  });
  it("has no sea fallback or domestic bypass to an isolated territory", () => {
    expect(
      run("enforced", "energy", "JP", "TOK").flows.filter((f) => f.commodity === "energy")
    ).toHaveLength(0);
    expect(
      run("enforced", "energy", "CA", "CA_NU").flows.filter((f) => f.commodity === "energy")
    ).toHaveLength(0);
  });
  it("does not export isolated generation through the national mainland pool", () => {
    const result = runSourcingPass({
      states: [
        { stateId: "HI", countryId: "US" },
        { stateId: "CA_ON", countryId: "CA" },
      ],
      byState: new Map([
        ["HI", new Map([["energy", { supply: 100, demand: 0 }]])],
        ["CA_ON", new Map([["energy", { supply: 0, demand: 100 }]])],
      ]),
      byCountry: new Map([
        ["US", new Map([["energy", { supply: 100, demand: 0 }]])],
        ["CA", new Map([["energy", { supply: 0, demand: 100 }]])],
      ]),
      statePricesFor: () => ({ HI: 1, CA_ON: 10 }),
      nationalPricesFor: () => ({ US: 1 }),
      basePriceFor: () => 10,
      freightPrice: 1,
      hops: () => 1,
      tariffRatePct: () => 0,
      isBlocked: () => false,
      electricityNetwork: network,
    });
    expect(result.flows.filter((f) => f.commodity === "energy")).toHaveLength(0);
  });
  it("keeps Shadow and Off aggregate sourcing identical", () =>
    expect(run("shadow")).toEqual(run("off")));
  it("does not apply the electricity network to natural gas", () =>
    expect(run("enforced", "natural_gas")).toEqual(run("off", "natural_gas")));
});
