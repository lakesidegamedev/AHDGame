import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getGameState } from "@/lib/gameState";
import { loadReviewedLawCatalog } from "@/lib/resetLegislation/loadReviewedCatalog";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";
import { getProvisionCostTotal } from "@shared/constants/legislation";
import { queueBill } from "./queueBill";

vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/resetLegislation/loadReviewedCatalog", () => ({
  loadReviewedLawCatalog: vi.fn(),
}));

const characterId = new ObjectId();
const nppId = new ObjectId();

describe("queueBill — US state tax sliders (ticket #1106)", () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    db.collection("governorLegislationQueue").findOne.mockResolvedValue(null);
    db.collection("npps").findOne.mockResolvedValue({
      _id: nppId,
      name: "NPP Legislator",
      party: "1",
      retiredAt: null,
    });
    db.collection("electedOfficials").findOne.mockResolvedValue({
      nppId,
      officeType: "stateSenate",
      state: "NC",
    });
    db.collection("stateBills").findOne.mockResolvedValue(null);
    db.collection("characters").updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collection("governorLegislationQueue").insertOne.mockResolvedValue({ insertedId: nppId });
    db.collection("legislationTypes");
    db.collection("stateBudgets");
    db.collectionMocks.legislationTypes.findOne.mockResolvedValue({
      _id: "us.tax.stateIncomeTax__income_middle",
      taxSlider: {
        scope: "state",
        taxType: "incomeTaxMiddle",
        minRate: 0,
        maxRate: 25,
        step: 0.5,
        baselineRate: 5,
        waypoints: [],
      },
    });
    db.collectionMocks.stateBudgets.findOne.mockResolvedValue({
      taxRates: { incomeTax: 5 },
    });
  });

  it("stamps proposedRate on a queued governor tax bill", async () => {
    const res = await queueBill(db as unknown as Db, {
      countryId: "US",
      stateId: "NC",
      character: { _id: characterId, name: "Gov", party: "1" },
      targetNppId: nppId,
      title: "Raise NC Income Tax",
      summary: "A hike.",
      category: "tax",
      provisions: [
        {
          legislationTypeId: "us.tax.stateIncomeTax__income_middle",
          effectDirection: 1,
          proposedRate: 7,
        },
      ],
    });

    expect(res.status).toBe(200);
    const inserted = db.collection("governorLegislationQueue").insertOne.mock.calls[0]?.[0] as {
      provisions: Array<Record<string, unknown>>;
    };
    expect(inserted.provisions[0]).toMatchObject({
      legislationTypeId: "us.tax.stateIncomeTax__income_middle",
      proposedRate: 7,
      policyOptionId: "rate:7",
      effectDirection: 1,
    });
  });

  it("rejects a queued tax slider that does not move the live rate", async () => {
    const res = await queueBill(db as unknown as Db, {
      countryId: "US",
      stateId: "NC",
      character: { _id: characterId, name: "Gov", party: "1" },
      targetNppId: nppId,
      title: "No-op",
      summary: "Stay put.",
      category: "tax",
      provisions: [
        {
          legislationTypeId: "us.tax.stateIncomeTax__income_middle",
          effectDirection: 0,
          proposedRate: 5,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least/);
    expect(db.collection("governorLegislationQueue").insertOne).not.toHaveBeenCalled();
  });
});

describe("queueBill — reviewed v2 regional bills", () => {
  let db: MockDb;
  const gameState = {
    currentTurn: 100,
    resetWorldId: "world-1",
    startingYear: 1991,
    metricsSystemVersion: "v2",
    legislationSystemVersion: "v2",
    resetVersionSeeds: Object.fromEntries(
      (["metrics", "legislation"] as const).map((system) => [
        system,
        {
          worldId: "world-1",
          revision: RESET_V2_SEED_REVISION[system],
          sourceTurn: 1,
          completedAt: "2026-10-04T00:00:00.000Z",
          verificationHash: system,
        },
      ])
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("governorLegislationQueue").findOne.mockResolvedValue(null);
    db.collection("npps").findOne.mockResolvedValue({
      _id: nppId,
      name: "NPP Legislator",
      party: "1",
      retiredAt: null,
    });
    db.collection("electedOfficials").findOne.mockResolvedValue({
      nppId,
      officeType: "regionalCouncil",
      state: "SCO",
    });
    db.collection("stateBills").findOne.mockResolvedValue(null);
    db.collection("characters").updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collection("governorLegislationQueue").insertOne.mockResolvedValue({ insertedId: nppId });
    db.collection("gameState").findOne.mockResolvedValue(gameState);
    vi.mocked(getGameState).mockResolvedValue(gameState as never);
    vi.mocked(loadReviewedLawCatalog).mockResolvedValue([
      {
        familyId: "L10",
        currentLaw: "Current law",
        currentLawDescription: "Current description",
        overseeingAgencyId: "uk_education",
        options: [
          {
            option: { familyId: "L10", choice: "center_left" },
            currentChoice: "center",
            title: "L10 proposal",
            description: "Proposed description",
          },
        ],
      },
    ] as never);
  });

  it("freezes the reviewed law and keeps subsidies in a mixed queued bill", async () => {
    const res = await queueBill(db as unknown as Db, {
      countryId: "UK",
      stateId: "SCO",
      character: { _id: characterId, name: "First Minister", party: "1" },
      targetNppId: nppId,
      title: "Schools and Steel Act",
      summary: "Schools and steelworks.",
      category: "custom",
      provisions: [
        {
          type: "reset_law",
          familyId: "L10",
          scope: "regional",
          regionId: "SCO",
          choice: "center_left",
        },
        {
          type: "subsidy",
          scopeType: "sector",
          targetSectorType: "manufacturing",
          domesticOnly: true,
        },
      ] as never,
    });

    expect(res.status).toBe(200);
    const inserted = db.collection("governorLegislationQueue").insertOne.mock.calls[0]?.[0] as {
      provisions: Array<Record<string, unknown>>;
      proposalNpiCost: number;
    };
    expect(inserted.provisions).toEqual([
      {
        type: "subsidy",
        scopeType: "sector",
        targetSectorType: "manufacturing",
        domesticOnly: true,
      },
      expect.objectContaining({
        type: "reset_law",
        familyId: "L10",
        regionId: "SCO",
        choice: "center_left",
        reviewedOption: { familyId: "L10", choice: "center_left" },
        titleSnapshot: "L10 proposal",
      }),
    ]);
    expect(inserted.proposalNpiCost).toBe(getProvisionCostTotal(2));
  });

  it("refuses a legacy policy row in a v2 world", async () => {
    const res = await queueBill(db as unknown as Db, {
      countryId: "UK",
      stateId: "SCO",
      character: { _id: characterId, name: "First Minister", party: "1" },
      targetNppId: nppId,
      title: "Old law",
      summary: "A legacy option.",
      category: "healthcare",
      provisions: [{ legislationTypeId: "uk.legacy.health", effectDirection: 1 }],
    });

    expect(res.status).toBe(409);
    expect(db.collection("governorLegislationQueue").insertOne).not.toHaveBeenCalled();
    expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
  });
});
