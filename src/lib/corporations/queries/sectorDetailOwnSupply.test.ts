import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import { explainOwnSupplyReach, type OwnSupplyRow } from "./sectorDetailOwnSupply";

type AgreementRow = {
  commodity: string;
  volumeCap?: number;
  lastDeliveryTurn?: number;
  lastDeliveredUnits?: number;
};

/** A string is a pharma-style agreement that delivered nothing against a 50 cap last turn. */
function fakeDb(agreements: (string | AgreementRow)[]) {
  const rows = agreements.map((a) =>
    typeof a === "string"
      ? { commodity: a, volumeCap: 50, lastDeliveryTurn: 9, lastDeliveredUnits: 0 }
      : a
  );
  const find = vi.fn(() => ({ toArray: async () => rows }));
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
  agreements?: (string | AgreementRow)[];
  shortInputs?: string[];
  routeTurn?: number | null;
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
    ownRouteTurn: args.routeTurn === undefined ? 9 : args.routeTurn,
    currentTurn: 10,
    out,
  });
  return { row: out.get("pharmaceuticals"), find };
}

describe("explainOwnSupplyReach", () => {
  it("does not claim a missing haul from a stale sourcing record", async () => {
    const { row } = await run({ corporation: corp("own"), routeTurn: 6 });
    expect(row?.reasons).toEqual(["not_enough"]);
  });

  it("does not blame an agreement that delivered in full last turn", async () => {
    const { row } = await run({
      corporation: corp("own"),
      agreements: [
        {
          commodity: "pharmaceuticals",
          volumeCap: 50,
          lastDeliveryTurn: 9,
          lastDeliveredUnits: 50,
        },
      ],
    });
    expect(row?.reasons).toEqual(["no_route"]);
  });

  it("does not blame an agreement with nothing reserved or no record from last turn", async () => {
    const { row } = await run({
      corporation: corp("own"),
      agreements: [
        { commodity: "pharmaceuticals", volumeCap: 0, lastDeliveryTurn: 9, lastDeliveredUnits: 0 },
        { commodity: "pharmaceuticals", volumeCap: 50, lastDeliveryTurn: 4, lastDeliveredUnits: 0 },
      ],
    });
    expect(row?.reasons).toEqual(["no_route"]);
  });

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
