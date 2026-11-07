import { describe, expect, it } from "vitest";
import { replayInputBidHeadroom } from "./producerInputFairness";
import { producerInputBidLimit } from "../../src/lib/market/producerMarket/inputBidRules";
import { settleProducerMarket } from "../../src/lib/market/producerMarket/rules";
import type { ProductionPlan } from "../../src/lib/market/producerMarket/production";

const plant = (id: string, reference: number): ProductionPlan => ({
  id,
  accountId: id,
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  inputs: [{ commodity: "steel", unitsPerOutput: 1, book: "world", maximumUnitPrice: 150 }],
  outputs: [
    {
      commodity: "steel",
      book: "world",
      unitsPerOutput: 1,
      referenceUnitPrice: reference,
      policy: { kind: "manual", unitPrice: 150 },
      storable: true,
    },
  ],
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: id,
  operatingRecipientAccountId: id,
  inputStock: [],
  outputStock: [],
});

describe("input-market replay", () => {
  it("reconstructs independent references without changing output quotes", () => {
    const input = {
      turn: 1,
      accounts: [],
      producers: [plant("us", 100)],
      countryOfProducer: () => "US",
      clearingPriceByLane: { "steel|world": 150 },
    };
    const next = replayInputBidHeadroom(input);
    expect(next.producers[0].inputs[0].maximumUnitPrice).toBe(187.5);
    expect(next.producers[0].outputs).toEqual(input.producers[0].outputs);
    expect(input.producers[0].inputs[0].maximumUnitPrice).toBe(150);
    expect(replayInputBidHeadroom(input, 1.25, new Set(["UK"])).producers[0].inputs).toEqual(
      input.producers[0].inputs
    );
  });

  it("refuses an unverified historical bid instead of inventing a reference", () => {
    const p = plant("us", 100);
    p.inputs[0].maximumUnitPrice = 999;
    expect(() =>
      replayInputBidHeadroom({
        turn: 1,
        accounts: [],
        producers: [p],
        countryOfProducer: () => "US",
      })
    ).toThrow("does not match");
  });

  it("keeps all three countries buying during 24 alternating reference-price turns", () => {
    const run = (fixed: boolean) => {
      let clearing = 100;
      const fills: number[][] = [];
      for (let turn = 1; turn <= 24; turn++) {
        const countries = ["JP", "UK", "US"];
        const accounts = countries.map((id) => ({ id, cash: 100000 }));
        const price = 100 + turn * 0.1;
        const result = settleProducerMarket({
          turn,
          accounts: [...accounts, { id: "supplier", cash: 0 }],
          offers: [
            {
              id: "supply",
              accountId: "supplier",
              commodity: "steel",
              book: "world",
              units: 90,
              unitPrice: price,
            },
          ],
          orders: countries.map((countryId, i) => {
            const reference = i === 0 ? (turn % 2 ? 100 : 50) : 200;
            const limit = fixed
              ? producerInputBidLimit({
                  referenceUnitPrice: reference,
                  headroom: 1.25,
                  clearingUnitPrice: clearing,
                })
              : Math.max(reference * 1.25, Math.min(clearing, reference * 3));
            return {
              id: String(i),
              accountId: countryId,
              countryId,
              commodity: "steel",
              book: "world",
              units: 100,
              maximumUnitPrice: limit,
              priority: 1,
              fairShare: fixed,
            };
          }),
        });
        expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBeCloseTo(300000);
        fills.push(result.orders.map((o) => o.deliveredUnits));
        clearing = result.prices[0].unitPrice;
      }
      return fills;
    };
    const before = run(false),
      after = run(true);
    expect(before[0][0]).toBe(90);
    expect(before[1][0]).toBe(0);
    for (const turn of after) for (const units of turn) expect(units).toBeCloseTo(30);
  });
});
