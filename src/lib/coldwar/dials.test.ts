import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";
import { dialTensionReading, getColdWarDials, PEACETIME_DIALS } from "./dials";
import { stepBlocDyads } from "./rules/blocTension";
import {
  deriveVietnamDials,
  emptyVietnamState,
  VIETNAM_MAX_LEVEL,
  type VietnamEscalationState,
} from "@/lib/crises/vietnamEscalation";

const ladder = vi.hoisted(() => ({ state: null as VietnamEscalationState | null }));

vi.mock("@/lib/livingConflict/vietnamCompat", async () => {
  const { emptyVietnamState } = await import("@/lib/crises/vietnamEscalation");
  return { livingVietnamAsLegacyState: async () => ladder.state ?? emptyVietnamState() };
});

function dbWithLadder(state: VietnamEscalationState | null) {
  ladder.state = state;
  return {
    collection() {
      return {
        async findOne() {
          return null;
        },
      };
    },
  } as unknown as Db;
}

function stateAt(level: number, over: Partial<VietnamEscalationState> = {}) {
  return { ...emptyVietnamState(), hasOpened: true, level, ...over };
}

describe("Cold War console dials", () => {
  it("reads peacetime when the world has never had a ladder", async () => {
    expect(await getColdWarDials(dbWithLadder(null))).toEqual(PEACETIME_DIALS);
  });

  it("reads peacetime when the ladder has been talked down to nothing", async () => {
    expect(await getColdWarDials(dbWithLadder(stateAt(0)))).toEqual(PEACETIME_DIALS);
  });

  it("labels peacetime values as such, so a calm reading is not ambiguous", async () => {
    const dials = await getColdWarDials(dbWithLadder(null));
    expect(dials.source).toBe("peacetime");
    expect(dials.defcon).toBe(5);
  });

  it("serves the ladder's derived dials once a war is on", async () => {
    const state = stateAt(VIETNAM_MAX_LEVEL, { warTurns: 12, westSupport: 40 });
    const dials = await getColdWarDials(dbWithLadder(state));
    const expected = deriveVietnamDials(state);

    expect(dials.source).toBe("vietnam");
    expect(dials.defcon).toBe(expected.defcon);
    expect(dials.cohesionWest).toBe(expected.cohesionWest);
    expect(dials.cohesionEast).toBe(expected.cohesionEast);
    expect(dials.warWeariness).toBe(expected.warWeariness);
    expect(dials.procurementMultiplier).toBe(expected.procurementMultiplier);
    expect(dials.detenteGoodwillPenalty).toBe(expected.detenteGoodwillPenalty);
  });

  it("drops readiness below peacetime as the war deepens", async () => {
    const low = await getColdWarDials(dbWithLadder(stateAt(1)));
    const high = await getColdWarDials(dbWithLadder(stateAt(VIETNAM_MAX_LEVEL)));
    expect(low.defcon).toBeLessThan(PEACETIME_DIALS.defcon);
    expect(high.defcon).toBeLessThan(low.defcon);
  });

  it("keeps every served value inside the console's expected ranges", async () => {
    for (let level = 0; level <= VIETNAM_MAX_LEVEL; level++) {
      const dials = await getColdWarDials(dbWithLadder(stateAt(level, { warTurns: 40 })));
      expect(dials.defcon).toBeGreaterThanOrEqual(1);
      expect(dials.defcon).toBeLessThanOrEqual(5);
      for (const value of [dials.cohesionWest, dials.cohesionEast, dials.warWeariness]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      expect(dials.procurementMultiplier).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("dialTensionReading (2027 bloc pairs)", () => {
  it("reads the hotter of the global value and the hottest pair", () => {
    const dyads = stepBlocDyads(undefined, {
      "us-cn": 55,
      "us-nonAligned": 10,
      "cn-nonAligned": 8,
    });
    expect(dialTensionReading(20, dyads)).toBe(55);
    expect(dialTensionReading(70, dyads)).toBe(70);
    expect(dialTensionReading(20, undefined)).toBe(20);
  });
});

describe("Cold War console dials in a multipolar world", () => {
  it("answer the hottest bloc pair when the global value is calm", async () => {
    ladder.state = null;
    const db = {
      collection(name: string) {
        return {
          async findOne() {
            if (name !== "coldWarTension") return null;
            return {
              _id: "current",
              value: 20,
              pressureFloor: 20,
              updatedTurn: 5,
              events: [],
              blocDyads: [
                { pair: "us-cn", value: 70, floor: 70 },
                { pair: "us-nonAligned", value: 10, floor: 10 },
                { pair: "cn-nonAligned", value: 8, floor: 8 },
              ],
            };
          },
        };
      },
    } as unknown as Db;
    const dials = await getColdWarDials(db);
    expect(dials.source).toBe("tension");
    expect(dials.defcon).toBe(3);
    expect(dials.blocTension?.find((d) => d.pair === "us-cn")).toEqual({
      pair: "us-cn",
      value: 70,
      band: "CRISIS",
    });
  });
});
