import { describe, expect, it } from "vitest";
import {
  advanceProducerEconomy,
  type ProductionPlan,
} from "@/lib/market/producerMarket/production";
import { shadowCountryBooks } from "./producerTurnDemand";

const plan = (changes: Partial<ProductionPlan>): ProductionPlan => ({
  id: "plant",
  accountId: "corp",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [],
  inputStock: [],
  outputStock: [],
  ...changes,
});

describe("country-scoped construction services", () => {
  it("a plant in one state buys construction from a seller in another state of its country", () => {
    const buyer = shadowCountryBooks(
      plan({
        id: "works",
        accountId: "buyer",
        inputs: [
          {
            commodity: "construction_services",
            unitsPerOutput: 1,
            book: "state:ny",
            maximumUnitPrice: 5,
          },
        ],
        outputs: [
          {
            commodity: "steel",
            unitsPerOutput: 1,
            book: "world",
            policy: { kind: "manual", unitPrice: 9 },
            referenceUnitPrice: 9,
            storable: true,
          },
        ],
      }),
      "us"
    );
    const builder = shadowCountryBooks(
      plan({
        id: "crew",
        accountId: "seller",
        outputs: [
          {
            commodity: "construction_services",
            unitsPerOutput: 1,
            book: "state:ca",
            policy: { kind: "manual", unitPrice: 4 },
            referenceUnitPrice: 4,
            storable: false,
          },
        ],
      }),
      "us"
    );
    expect(buyer.inputs[0].book).toBe("country:us");
    expect(builder.outputs[0].book).toBe("country:us");
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "buyer", cash: 100 },
        { id: "seller", cash: 0 },
        { id: "households", cash: 0 },
        { id: "services", cash: 0 },
      ],
      producers: [buyer, builder],
    });
    const works = result.producers.find((p) => p.id === "works")!;
    const crew = result.producers.find((p) => p.id === "crew")!;
    expect(works.producedUnits).toBeCloseTo(10, 9);
    expect(crew.deliveredUnits).toBeCloseTo(10, 9);
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBeCloseTo(100, 9);
  });
});
