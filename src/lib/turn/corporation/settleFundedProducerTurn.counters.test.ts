import { describe, expect, it } from "vitest";
import { noRepeatIncrement, settledSectorCounterUpdate } from "./settleFundedProducerTurn";
import { fundedLowSaleStreakStep, fundedTakenShare } from "@/lib/turn/npp/rules/fundedSellThrough";

const EPOCH = "epoch-1";
const step = (offered: number, sold: number, ownSites = 0) =>
  fundedLowSaleStreakStep(
    fundedTakenShare(
      {
        producerSettlement: {
          worldEpoch: EPOCH,
          turn: 5,
          offeredUnits: offered,
          soldUnits: sold,
          products: [{ internalDeliveredUnits: ownSites }],
        },
      },
      EPOCH
    )
  );

/** Apply one turn's update document to a stored sector, as Mongo would. */
function apply(
  stored: Record<string, number>,
  update: ReturnType<typeof settledSectorCounterUpdate>
) {
  const next: Record<string, number> = { ...stored, ...(update.$set as Record<string, number>) };
  for (const [k, v] of Object.entries(update.$inc ?? {})) next[k] = (next[k] ?? 0) + v;
  return next;
}

describe("settled sector counters", () => {
  it("counts consecutive funded turns under half sold, starting from an absent field", () => {
    let doc: Record<string, number> = {};
    for (const [offered, sold] of [
      [100, 10],
      [100, 49],
      [100, 0],
    ])
      doc = apply(doc, settledSectorCounterUpdate({}, "hold", step(offered, sold)));
    expect(doc.fundedLowSaleTurns).toBe(3);
  });

  it("resets on a turn selling half or more", () => {
    const doc = apply(
      { fundedLowSaleTurns: 7 },
      settledSectorCounterUpdate({}, "reset", step(100, 50))
    );
    expect(doc.fundedLowSaleTurns).toBe(0);
  });

  it("counts own-site deliveries as taken, so a plant feeding its own sites does not extend the streak", () => {
    const doc = apply(
      { fundedLowSaleTurns: 7 },
      settledSectorCounterUpdate({}, "reset", step(669, 0, 669))
    );
    expect(doc.fundedLowSaleTurns).toBe(0);
  });

  it("extends the streak when nothing was sold or delivered to own sites", () => {
    const doc = apply(
      { fundedLowSaleTurns: 7 },
      settledSectorCounterUpdate({}, "increment", step(120, 0, 0))
    );
    expect(doc.fundedLowSaleTurns).toBe(8);
  });

  it("holds through a turn with nothing offered", () => {
    const update = settledSectorCounterUpdate({ demandThrottleFactor: 1 }, "hold", step(0, 0));
    expect(update).toEqual({ $set: { demandThrottleFactor: 1 } });
    expect(apply({ fundedLowSaleTurns: 4 }, update).fundedLowSaleTurns).toBe(4);
  });

  it("keeps the zero-sales counter as before", () => {
    expect(settledSectorCounterUpdate({}, "increment", "increment")).toEqual({
      $set: {},
      $inc: { producerZeroSalesTurns: 1, fundedLowSaleTurns: 1 },
    });
    expect(settledSectorCounterUpdate({}, "reset", "reset")).toEqual({
      $set: { producerZeroSalesTurns: 0, fundedLowSaleTurns: 0 },
    });
  });

  it("a replayed turn already published never extends the streak again", () => {
    expect(noRepeatIncrement("increment", true)).toBe("hold");
    expect(noRepeatIncrement("reset", true)).toBe("reset");
    expect(noRepeatIncrement("increment", false)).toBe("increment");
  });
});
