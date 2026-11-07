import { describe, expect, it } from "vitest";
import { advanceProducerEconomy } from "../../src/lib/market/producerMarket/production";
import { producerPlanningReplayRequest } from "./producerPlanningConvergence";

type Request = Parameters<typeof advanceProducerEconomy>[0];

function request(): Request {
  return {
    turn: 1,
    accounts: ["company", "households"].map((id) => ({ id, cash: 100 })),
    producers: [
      {
        id: "plant",
        accountId: "company",
        capacityUnits: 1,
        activeFraction: 1,
        outputMultiplier: 1,
        labourCost: 0,
        otherOperatingCost: 0,
        labourRecipientAccountId: "households",
        operatingRecipientAccountId: "households",
        inputStock: [],
        outputStock: [],
        inputs: [],
        outputs: [
          {
            commodity: "energy",
            book: "world",
            unitsPerOutput: 1,
            policy: { kind: "manual", unitPrice: 1 },
            referenceUnitPrice: 1,
            storable: false,
          },
        ],
      },
    ],
  };
}

function roundTrip(input: Request) {
  const result = advanceProducerEconomy(input);
  const frozen = JSON.parse(JSON.stringify({ request: input, result }));
  expect(advanceProducerEconomy(producerPlanningReplayRequest(frozen))).toEqual(result);
}

describe("producer planning replay country attribution", () => {
  it("replays requests and frozen receipts without states or households", () => {
    const input = request();
    expect(advanceProducerEconomy(producerPlanningReplayRequest({ request: input }))).toEqual(
      advanceProducerEconomy(input)
    );
    roundTrip(input);
  });

  it("recovers a national producer's original country from its frozen offers", () => {
    roundTrip({ ...request(), countryOfProducer: () => "GB" });
  });

  it("preserves an untagged receipt even when households could supply a country", () => {
    roundTrip({
      ...request(),
      households: [{ accountId: "households", countryId: "GB", spendFraction: 0, products: [] }],
    });
  });

  it("uses a national wage wallet for request-only fixtures", () => {
    const input = {
      ...request(),
      households: [{ accountId: "households", countryId: "GB", spendFraction: 0, products: [] }],
    };
    const replay = producerPlanningReplayRequest({ request: input });
    expect(replay.countryOfProducer?.("plant")).toBe("GB");
    expect(advanceProducerEconomy(replay)).toEqual(
      advanceProducerEconomy({ ...input, countryOfProducer: () => "GB" })
    );
  });

  it("retains state household inference for legacy request-only fixtures", () => {
    const input = request();
    input.producers = input.producers.map((producer) => ({ ...producer, stateId: "state" }));
    input.households = [
      {
        accountId: "other-wallet",
        stateId: "state",
        countryId: "US",
        spendFraction: 0,
        products: [],
      },
    ];
    expect(producerPlanningReplayRequest({ request: input }).countryOfProducer?.("plant")).toBe(
      "US"
    );
  });

  it("does not borrow the country of an unrelated national wallet", () => {
    const input = request();
    input.households = [
      { accountId: "other-wallet", countryId: "GB", spendFraction: 0, products: [] },
    ];
    expect(producerPlanningReplayRequest({ request: input }).countryOfProducer?.("plant")).toBe(
      undefined
    );
  });

  it("rejects conflicting country attribution instead of silently picking one", () => {
    const input = request();
    const result = advanceProducerEconomy(input);
    result.tradeReceipt.offers = [
      { ...result.tradeReceipt.offers[0], countryId: "GB" },
      {
        ...result.tradeReceipt.offers[0],
        id: JSON.stringify(["plant", "output", "goods"]),
        commodity: "goods",
        countryId: "US",
      },
    ];
    input.producers = input.producers.map((producer) => ({
      ...producer,
      outputs: [...producer.outputs, { ...producer.outputs[0], commodity: "goods" }],
    }));
    expect(() => producerPlanningReplayRequest({ request: input, result })).toThrow(
      "Ambiguous frozen country for producer plant"
    );
  });
});
