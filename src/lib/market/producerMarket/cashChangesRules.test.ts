import { describe, expect, it } from "vitest";
import {
  closingProducerCash,
  ProducerCashChanges,
  producerCashChangeMap,
} from "./cashChangesRules";

describe("producer cash movement accounting", () => {
  it("keeps a small movement through cancelling large movements", () => {
    const changes = new ProducerCashChanges(["buyer", "seller"]);
    changes.transfer("buyer", "seller", 1e16);
    changes.transfer("buyer", "seller", 0.1);
    changes.transfer("seller", "buyer", 1e16);
    expect(changes.rows()).toEqual([
      { accountId: "buyer", change: -0.1 },
      { accountId: "seller", change: 0.1 },
    ]);
  });

  it("rebases accumulated balance drift while preserving ordinary snapshots", () => {
    const opening = [
      { id: "buyer", cash: 6e12 },
      { id: "seller", cash: 100 },
    ];
    const changes = new ProducerCashChanges(opening.map((a) => a.id));
    let reported = opening[0].cash;
    for (let i = 0; i < 1000; i++) {
      changes.transfer("buyer", "seller", 0.1);
      reported -= 0.1;
    }
    const closing = closingProducerCash(opening, changes.rows(), [
      { id: "buyer", cash: reported },
      { id: "seller", cash: 200 },
    ]);
    expect(closing).toEqual([
      { id: "buyer", cash: 6e12 - 100 },
      { id: "seller", cash: 200 },
    ]);
    expect(reported).not.toBe(closing[0].cash);
    expect(
      closingProducerCash(
        [{ id: "x", cash: 1 }],
        [{ accountId: "x", change: 0 }],
        [{ id: "x", cash: 1 + Number.EPSILON }]
      )[0].cash
    ).toBe(1 + Number.EPSILON);
  });

  it("rejects money creation, unknown accounts, malformed witnesses and overdrafts", () => {
    expect(() =>
      closingProducerCash([{ id: "buyer", cash: 6e12 }], [{ accountId: "buyer", change: 0.01 }])
    ).toThrow("conserve");
    expect(() => new ProducerCashChanges(["buyer"]).transfer("buyer", "missing", 1)).toThrow(
      "Invalid"
    );
    expect(() => new ProducerCashChanges(["buyer", "buyer"])).toThrow("Invalid");
    expect(() => new ProducerCashChanges(["buyer"], [])).toThrow("Missing");
    expect(() => new ProducerCashChanges(["buyer"], [{ accountId: "missing", change: 0 }])).toThrow(
      "Invalid"
    );
    expect(() => producerCashChangeMap([{ accountId: "buyer", change: NaN }])).toThrow("witness");
    expect(() =>
      closingProducerCash([{ id: "buyer", cash: NaN }], [{ accountId: "buyer", change: 0 }])
    ).toThrow("invalid");
    expect(() =>
      closingProducerCash([{ id: "buyer", cash: 1 }], [{ accountId: "buyer", change: 0 }], [])
    ).toThrow("invalid");
    expect(() =>
      closingProducerCash(
        [
          { id: "a", cash: 0 },
          { id: "b", cash: 1 },
        ],
        [
          { accountId: "a", change: -1 },
          { accountId: "b", change: 1 },
        ]
      )
    ).toThrow("overdraw");
  });
});
