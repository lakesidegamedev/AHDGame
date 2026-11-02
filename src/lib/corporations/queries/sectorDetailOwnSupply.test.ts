import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import { explainOwnSupplyReach, type OwnSupplyRow } from "./sectorDetailOwnSupply";

function fakeDb(agreementCommodities: string[]) {
  const find = vi.fn(() => ({
    toArray: async () => agreementCommodities.map((commodity) => ({ commodity })),
  }));
  return { db: { collection: () => ({ find }) } as unknown as Db, find };
}

const corpId = new ObjectId();
const sectorId = new ObjectId();
const sector = { _id: sectorId, stateId: "KYU" } as CorporateSector;
const pharmaSite = {
  _id: new ObjectId(),
  stateId: "HOK",
  producerSettlement: {
    turn: 9,
    products: [{ commodity: "pharmaceuticals", producedUnits: 500 }],
  },
} as unknown as CorporateSector;

function corp(
  priority: "market" | "own" | "group",
  shareholders: Corporation["shareholders"] = []
) {
  return {
    _id: corpId,
    internalSupplyPolicy: { priority, discount: 0 },
    shareholders,
  } as unknown as Corporation;
}

async function run(args: {
  corporation: Corporation;
  siblings?: CorporateSector[];
  routedUnits?: number;
  agreements?: string[];
  shortInputs?: string[];
}) {
  const { db, find } = fakeDb(args.agreements ?? []);
  const out = new Map<string, OwnSupplyRow>();
  await explainOwnSupplyReach({
    db,
    corporation: args.corporation,
    sector,
    siblings: args.siblings ?? [sector, pharmaSite],
    shortInputs: args.shortInputs ?? ["pharmaceuticals"],
    stateNameById: new Map([["HOK", "Hokkaido"]]),
    ownRouteDelivered: args.routedUnits
      ? [
          {
            commodity: "pharmaceuticals",
            corporationId: corpId.toString(),
            originStateId: "HOK",
            destStateId: "KYU",
            units: args.routedUnits,
          },
        ]
      : [],
    currentTurn: 10,
    out,
  });
  return { row: out.get("pharmaceuticals"), find };
}

describe("explainOwnSupplyReach", () => {
  it("names the making region and a missing haul plus a claiming agreement", async () => {
    const { row } = await run({ corporation: corp("own"), agreements: ["pharmaceuticals"] });
    expect(row).toEqual({
      sourceStateIds: ["HOK"],
      sourceStateNames: ["Hokkaido"],
      reasons: ["no_route", "agreement_reserved"],
    });
  });

  it("reads an arrived haul as own supply falling short", async () => {
    const { row } = await run({ corporation: corp("own"), routedUnits: 40 });
    expect(row?.reasons).toEqual(["not_enough"]);
  });

  it("does not query agreements when no other site makes a short input", async () => {
    const { row, find } = await run({ corporation: corp("own"), siblings: [sector] });
    expect(row).toBeUndefined();
    expect(find).not.toHaveBeenCalled();
  });

  it("ignores a receipt older than last turn", async () => {
    const stale = {
      ...pharmaSite,
      producerSettlement: { ...pharmaSite.producerSettlement!, turn: 5 },
    } as CorporateSector;
    const { row } = await run({ corporation: corp("own"), siblings: [sector, stale] });
    expect(row).toBeUndefined();
  });

  it("skips a wholly owned subsidiary, whose parent may set its policy", async () => {
    const parent = new ObjectId();
    const { row } = await run({
      corporation: corp("market", [
        { corporationId: parent, shares: 100 },
      ] as unknown as Corporation["shareholders"]),
    });
    expect(row).toBeUndefined();
  });
});
