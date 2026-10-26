import { describe, expect, it } from "vitest";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { commodityStateKey, laneKeyOf } from "./laneKey";

/** The key forms the concatenated keys replace. */
const legacyLaneKey = (commodity: string, book: string) => JSON.stringify([commodity, book]);
const legacyCommodityStateKey = (commodity: string, stateId: string | null) =>
  JSON.stringify([commodity, stateId]);

const BOOKS = ["world", "state:CA", "state:MN", "state:NY", "state:TX", "country:US", "country:DE"];
const STATES = [null, "CA", "MN", "NY", "TX"];

/** Distinct fixture pairs a key builder must keep apart. */
function collisionsOf<S>(build: (commodity: string, second: S) => string, seconds: readonly S[]) {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const commodity of COMMODITY_TYPES) {
    for (const second of seconds) {
      const key = build(commodity, second);
      const pair = `${commodity} / ${second}`;
      const previous = seen.get(key);
      if (previous !== undefined && previous !== pair) collisions.push(`${previous} <> ${pair}`);
      seen.set(key, pair);
    }
  }
  return { collisions, size: seen.size, pairs: COMMODITY_TYPES.length * seconds.length };
}

describe("laneKeyOf", () => {
  it("is one to one over every commodity and book the funded market uses", () => {
    const current = collisionsOf(laneKeyOf, BOOKS);
    const legacy = collisionsOf(legacyLaneKey, BOOKS);
    expect(current.collisions).toEqual([]);
    expect(current.size).toBe(current.pairs);
    expect(current.size).toBe(legacy.size);
  });

  it("keeps a stored country-book stock on its own lane", () => {
    expect(laneKeyOf("freight", "state:CA")).not.toBe(laneKeyOf("freight", "country:CA"));
    expect(legacyLaneKey("freight", "state:CA")).not.toBe(legacyLaneKey("freight", "country:CA"));
  });
});

describe("commodityStateKey", () => {
  it("is one to one over every commodity and state, including the world bucket", () => {
    const current = collisionsOf(commodityStateKey, STATES);
    const legacy = collisionsOf(legacyCommodityStateKey, STATES);
    expect(current.collisions).toEqual([]);
    expect(current.size).toBe(current.pairs);
    expect(current.size).toBe(legacy.size);
  });

  it("separates a state from the world row, as the array form did", () => {
    expect(commodityStateKey("steel", null)).not.toBe(commodityStateKey("steel", "null"));
    expect(legacyCommodityStateKey("steel", null)).not.toBe(
      legacyCommodityStateKey("steel", "null")
    );
    // Same lane for the same inputs, whatever the separator renders as.
    expect(commodityStateKey("steel", "CA").includes("steel")).toBe(true);
    expect(commodityStateKey("steel", "CA")).not.toBe(commodityStateKey("steel", null));
  });
});
