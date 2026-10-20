import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { TRANSITION_WINDOW_TURNS } from "@/lib/market/producerMarket/transitionRules";
import { convertSectorIndustryCore } from "./convertSectorIndustry";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const OPENING = 500;
const corpId = new ObjectId();

function world(currentTurn: number, extraSectors: Record<string, unknown>[] = []) {
  const memory = createInMemoryDb();
  const sectorId = new ObjectId();
  memory.seed("gameState", [
    {
      _id: "current",
      currentTurn,
      worldEpochId: "w",
      producerOpening: { worldEpoch: "w", turn: OPENING, digest: "d" },
    },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: corpId,
      stateId: "US-CA",
      countryId: "US",
      sectorType: "media",
      industryModel: null,
      mediaDiscriminator: null,
      strategyId: "standard",
      capitalStock: 100,
      capacityBookAnchor: 5000,
      buildQueue: [],
      cutoverTransition: {
        mismatched: true,
        legacyRevenueAnchor: 9,
        fundedRevenueAnchor: 1,
        basisTurns: 5,
      },
    },
    ...extraSectors,
  ]);
  return { memory, sectorId, db: memory as unknown as Db };
}

const sectorDoc = (memory: ReturnType<typeof createInMemoryDb>, id: ObjectId) =>
  memory.collection("corporateSectors").docs.find((d) => String(d._id) === String(id))!;

describe("convertSectorIndustryCore", () => {
  it("converts once at book value inside the window", async () => {
    const { memory, sectorId, db } = world(OPENING + 2);
    const out = await convertSectorIndustryCore(db, {
      corporationId: corpId,
      sectorId,
      targetLane: "construction",
    });
    expect(out.ok).toBe(true);
    const doc = sectorDoc(memory, sectorId);
    expect(doc.sectorType).toBe("construction");
    expect(doc.capacityBookAnchor).toBe(5000);
    expect(doc.cutoverConvertedAtTurn).toBe(OPENING + 2);

    const again = await convertSectorIndustryCore(db, {
      corporationId: corpId,
      sectorId,
      targetLane: "energy",
    });
    expect(again).toMatchObject({ ok: false, status: 400 });
  });

  it("is closed after the window", async () => {
    const { sectorId, db } = world(OPENING + TRANSITION_WINDOW_TURNS + 1);
    const out = await convertSectorIndustryCore(db, {
      corporationId: corpId,
      sectorId,
      targetLane: "construction",
    });
    expect(out).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a lane the corporation already runs in the same state", async () => {
    const { sectorId, db } = world(OPENING + 2, [
      {
        _id: new ObjectId(),
        corporationId: corpId,
        stateId: "US-CA",
        sectorType: "construction",
        industryModel: null,
        mediaDiscriminator: null,
      },
    ]);
    const out = await convertSectorIndustryCore(db, {
      corporationId: corpId,
      sectorId,
      targetLane: "construction",
    });
    expect(out).toMatchObject({ ok: false, status: 400 });
  });
});
