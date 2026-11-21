import { describe, expect, it, vi, beforeEach } from "vitest";
import { type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn(async () => undefined) }));

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/config/market", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET/PATCH /api/admin/config/market — extractionOutputScaleEnabled", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("gameConfig");
    db.collection("gameState");

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { username: "admin" },
    } as never);
  });

  it("GET reflects extractionOutputScaleEnabled from gameConfig", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
      extractionOutputScaleEnabled: true,
    });

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { extractionOutputScaleEnabled: boolean };

    expect(body.extractionOutputScaleEnabled).toBe(true);
  });

  it("GET defaults extractionOutputScaleEnabled to false when absent", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { extractionOutputScaleEnabled: boolean };

    expect(body.extractionOutputScaleEnabled).toBe(false);
  });

  it("PATCH sets extractionOutputScaleEnabled via $set without touching unrelated flags", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makePatchRequest({ mode: "plants", extractionOutputScaleEnabled: true })
    );

    expect(res.status).toBe(200);
    expect(db.collectionMocks.gameConfig!.updateOne).toHaveBeenCalledWith(
      { _id: "default" },
      {
        $set: expect.objectContaining({
          extractionOutputScaleEnabled: true,
        }),
      },
      { upsert: true }
    );
  });

  it("PATCH omits extractionOutputScaleEnabled from $set when not provided", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });

    const { PATCH } = await import("./route");
    await PATCH(makePatchRequest({ mode: "plants" }));

    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls[0]?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg).not.toHaveProperty("extractionOutputScaleEnabled");
  });

  it("mirrors media regulation gates into the existing game-state route snapshot", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
      commandEconomyEnabled: false,
      mediaRegulationEnabled: false,
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(makePatchRequest({ mode: "plants", mediaRegulationEnabled: true }));

    expect(res.status).toBe(200);
    expect(db.collectionMocks.gameState!.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: "current" },
      {
        $set: {
          mediaRegulationSnapshot: {
            enabled: false,
            marketSystemMode: "plants",
            commandEconomyEnabled: false,
          },
        },
      }
    );
    expect(db.collectionMocks.gameState!.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: "current" },
      {
        $set: {
          mediaRegulationSnapshot: {
            enabled: true,
            marketSystemMode: "plants",
            commandEconomyEnabled: false,
          },
        },
      }
    );
  });

  it("fails regulation off when the synchronized activation snapshot write fails", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
      commandEconomyEnabled: false,
      mediaRegulationEnabled: false,
    });
    db.collectionMocks
      .gameState!.updateOne.mockImplementationOnce(async () => ({ acknowledged: true }) as never)
      .mockRejectedValueOnce(new Error("snapshot write failed"))
      .mockImplementationOnce(async () => ({ acknowledged: true }) as never);

    const { PATCH } = await import("./route");
    const res = await PATCH(makePatchRequest({ mode: "plants", mediaRegulationEnabled: true }));

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(db.collectionMocks.gameConfig!.updateOne).toHaveBeenCalledTimes(2);
    expect(db.collectionMocks.gameConfig!.updateOne).toHaveBeenLastCalledWith(
      { _id: "default" },
      { $set: { mediaRegulationEnabled: false } },
      { upsert: true }
    );
    expect(db.collectionMocks.gameState!.updateOne).toHaveBeenLastCalledWith(
      { _id: "current" },
      { $set: { mediaRegulationSnapshot: expect.objectContaining({ enabled: false }) } }
    );
  });

  it("exposes the v2 product flag and keeps it false when absent", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
      productLinesV2Enabled: true,
    });
    const { GET } = await import("./route");
    const enabled = (await (await GET()).json()) as { productLinesV2Enabled: boolean };
    expect(enabled.productLinesV2Enabled).toBe(true);

    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    const absent = (await (await GET()).json()) as { productLinesV2Enabled: boolean };
    expect(absent.productLinesV2Enabled).toBe(false);
  });

  it("GET reflects shortage-responsive sourcing and defaults it off", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
      shortageResponsiveSourcingEnabled: true,
    });
    const { GET } = await import("./route");
    const enabled = (await (await GET()).json()) as {
      shortageResponsiveSourcingEnabled: boolean;
    };
    expect(enabled.shortageResponsiveSourcingEnabled).toBe(true);

    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });
    const absent = (await (await GET()).json()) as {
      shortageResponsiveSourcingEnabled: boolean;
    };
    expect(absent.shortageResponsiveSourcingEnabled).toBe(false);
  });

  it("PATCH writes the dark sourcing gate only when explicitly provided", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });
    const { PATCH } = await import("./route");
    await PATCH(
      makePatchRequest({
        mode: "plants",
        shortageResponsiveSourcingEnabled: true,
        intervention: {
          id: "issue-968-shortage-sourcing",
          issueId: 968,
          owner: "operator",
          objective: "Increase buyer intent fulfillment.",
          targets: [
            {
              metric: "intentFulfillmentRate",
              direction: "increase",
              minimumImprovement: 0.05,
            },
          ],
          guardrails: [
            {
              metric: "physicalSellThrough",
              direction: "increase",
              maximumDeterioration: 0.05,
            },
          ],
          cohort: { initialShare: 0.1, maximumShare: 1, rampTurns: 24 },
          review: { startTurn: 0, reviewTurn: 10_000 },
          rollback: {
            owner: "operator",
            trigger: "A guardrail breaches.",
            action: "Disable shortage sourcing.",
          },
        },
      })
    );
    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls[0]?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg.shortageResponsiveSourcingEnabled).toBe(true);
    expect(setArg.shortageResponsiveSourcingIntervention).toMatchObject({
      id: "issue-968-shortage-sourcing",
      issueId: 968,
    });
  });

  it("refuses an ungoverned shortage-sourcing activation", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makePatchRequest({ mode: "plants", shortageResponsiveSourcingEnabled: true })
    );

    expect(res.status).toBe(400);
    expect(db.collectionMocks.gameConfig!.updateOne).not.toHaveBeenCalled();
  });

  it("requires and persists governance for bond liquidity", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });
    const { PATCH } = await import("./route");
    const refused = await PATCH(
      makePatchRequest({ mode: "plants", indexFundBondLiquidityEnabled: true })
    );
    expect(refused.status).toBe(400);

    const bondLiquidityIntervention = {
      id: "issue-968-bond-liquidity",
      issueId: 968,
      owner: "operator",
      objective: "Reduce unheld sovereign bond issues.",
      targets: [{ metric: "noHolderBondShare", direction: "decrease", minimumImprovement: 0.1 }],
      guardrails: [
        { metric: "fundBackingRatio", direction: "increase", maximumDeterioration: 0.05 },
      ],
      cohort: { initialShare: 0.1, maximumShare: 1, rampTurns: 24 },
      review: { startTurn: 0, reviewTurn: 10_000 },
      rollback: {
        owner: "operator",
        trigger: "Fund backing deteriorates.",
        action: "Disable bond liquidity and retain existing assets.",
      },
    };
    const accepted = await PATCH(
      makePatchRequest({
        mode: "plants",
        indexFundBondLiquidityEnabled: true,
        bondLiquidityIntervention,
      })
    );
    expect(accepted.status).toBe(200);
    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls.at(-1)?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg.indexFundBondLiquidityEnabled).toBe(true);
    expect(setArg.indexFundBondLiquidityIntervention).toEqual(bondLiquidityIntervention);
  });

  it("requires and persists governance for bounded equity liquidity", async () => {
    const { PATCH } = await import("./route");
    const refused = await PATCH(
      makePatchRequest({ mode: "plants", equityLiquidityFacilityEnabled: true })
    );
    expect(refused.status).toBe(400);

    const equityLiquidityIntervention = {
      id: "issue-990-equity-liquidity",
      issueId: 990,
      owner: "operator",
      objective: "Increase executable two-sided equity depth.",
      targets: [{ metric: "twoSidedListingShare", direction: "increase", minimumImprovement: 0.2 }],
      guardrails: [
        { metric: "fundBackingRatio", direction: "increase", maximumDeterioration: 0.02 },
      ],
      cohort: { initialShare: 0.1, maximumShare: 0.4, rampTurns: 48 },
      review: { startTurn: 0, reviewTurn: 10_000 },
      rollback: {
        owner: "operator",
        trigger: "Fund backing, concentration, or market-quality guardrails fail.",
        action: "Disable the facility and cancel all standing quotes.",
      },
    };
    const accepted = await PATCH(
      makePatchRequest({
        mode: "plants",
        equityLiquidityFacilityEnabled: true,
        equityLiquidityIntervention,
      })
    );
    expect(accepted.status).toBe(200);
    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls.at(-1)?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg.equityLiquidityFacilityEnabled).toBe(true);
    expect(setArg.equityLiquidityFacilityIntervention).toEqual(equityLiquidityIntervention);
  });

  it("requires and persists governance for NPP market coverage", async () => {
    const { PATCH } = await import("./route");
    const refused = await PATCH(
      makePatchRequest({ mode: "plants", nppMarketCoverageEnabled: true })
    );
    expect(refused.status).toBe(400);

    const marketCoverageIntervention = {
      id: "issue-991-market-coverage",
      issueId: 991,
      owner: "operator",
      objective: "Reduce facility-ready empty state-sector markets.",
      targets: [
        { metric: "facilityReadyEmptyMarketShare", direction: "decrease", minimumImprovement: 0.1 },
      ],
      guardrails: [{ metric: "pooledFillRate", direction: "increase", maximumDeterioration: 0.02 }],
      cohort: { initialShare: 0.125, maximumShare: 1, rampTurns: 48 },
      review: { startTurn: 0, reviewTurn: 10_000 },
      rollback: {
        owner: "operator",
        trigger: "Coverage or market-quality guardrails fail.",
        action: "Disable NPP market coverage routing.",
      },
    };
    const accepted = await PATCH(
      makePatchRequest({
        mode: "plants",
        nppMarketCoverageEnabled: true,
        marketCoverageIntervention,
      })
    );
    expect(accepted.status).toBe(200);
    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls.at(-1)?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg.nppMarketCoverageEnabled).toBe(true);
    expect(setArg.nppMarketCoverageIntervention).toEqual(marketCoverageIntervention);
  });

  it("requires and persists governance for fragile-market supply routing", async () => {
    const { PATCH } = await import("./route");
    const refused = await PATCH(
      makePatchRequest({ mode: "plants", nppFragileMarketSupplyEnabled: true })
    );
    expect(refused.status).toBe(400);

    const fragileMarketSupplyIntervention = {
      id: "issue-991-fragile-market-supply",
      issueId: 991,
      owner: "operator",
      objective: "Improve supply breadth and fill in four diagnosed fragile commodity markets.",
      targets: [
        { metric: "targetedFragileMarketFill", direction: "increase", minimumImprovement: 0.05 },
      ],
      guardrails: [{ metric: "pooledFillRate", direction: "increase", maximumDeterioration: 0.02 }],
      cohort: { initialShare: 0.125, maximumShare: 1, rampTurns: 48 },
      review: { startTurn: 0, reviewTurn: 10_000 },
      rollback: {
        owner: "operator",
        trigger: "Targeted supply breadth or economy-wide fill guardrails fail.",
        action: "Disable fragile-market supply routing.",
      },
    };
    const accepted = await PATCH(
      makePatchRequest({
        mode: "plants",
        nppFragileMarketSupplyEnabled: true,
        fragileMarketSupplyIntervention,
      })
    );
    expect(accepted.status).toBe(200);
    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls.at(-1)?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg.nppFragileMarketSupplyEnabled).toBe(true);
    expect(setArg.nppFragileMarketSupplyIntervention).toEqual(fragileMarketSupplyIntervention);
  });
});

// MARKET_MODE_INFO[mode].live was enforced ONLY by the admin selector disabling
// the option. A direct PATCH — curl, a stale tab, a script — could flip the LIVE
// world onto an unlaunched tier with nothing on the server to stop it.
//
// Every shipped tier is now `live: true`, so there is no real mode left that
// exercises the refusal branch. Mocking the metadata rather than deleting the
// test is deliberate: the guard is a standing safety property of the ROUTE, and
// it has to keep working for whatever tier ships next. A test that could only
// be written while an unlaunched tier happened to exist would delete itself at
// exactly the moment the next one needed it.
vi.mock("@/lib/market/modes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market/modes")>();
  return {
    ...actual,
    MARKET_MODE_INFO: {
      ...actual.MARKET_MODE_INFO,
      plants: { ...actual.MARKET_MODE_INFO.plants, live: false },
    },
  };
});

describe("GET/PATCH /api/admin/config/market — #1001 sandbox-only gates", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("gameConfig");
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { username: "admin" },
    } as never);
  });

  it("GET reflects both gates and defaults them to false when absent", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
      sovereignIssuanceConsolidationEnabled: true,
      domesticSovereignBondCoverageEnabled: true,
    });
    const { GET } = await import("./route");
    const enabled = (await (await GET()).json()) as {
      sovereignIssuanceConsolidationEnabled: boolean;
      domesticSovereignBondCoverageEnabled: boolean;
    };
    expect(enabled.sovereignIssuanceConsolidationEnabled).toBe(true);
    expect(enabled.domesticSovereignBondCoverageEnabled).toBe(true);

    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "capital",
    });
    const absent = (await (await GET()).json()) as {
      sovereignIssuanceConsolidationEnabled: boolean;
      domesticSovereignBondCoverageEnabled: boolean;
    };
    expect(absent.sovereignIssuanceConsolidationEnabled).toBe(false);
    expect(absent.domesticSovereignBondCoverageEnabled).toBe(false);
  });

  it("PATCH persists explicit false without touching unrelated flags", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makePatchRequest({
        mode: "plants",
        sovereignIssuanceConsolidationEnabled: false,
        domesticSovereignBondCoverageEnabled: false,
      })
    );

    expect(res.status).toBe(200);
    expect(db.collectionMocks.gameConfig!.updateOne).toHaveBeenCalledWith(
      { _id: "default" },
      {
        $set: expect.objectContaining({
          sovereignIssuanceConsolidationEnabled: false,
          domesticSovereignBondCoverageEnabled: false,
        }),
      },
      { upsert: true }
    );
  });

  it("PATCH omits both gates from $set when not provided", async () => {
    const { PATCH } = await import("./route");
    await PATCH(makePatchRequest({ mode: "plants" }));

    const setArg = db.collectionMocks.gameConfig!.updateOne.mock.calls[0]?.[1]?.$set as Record<
      string,
      unknown
    >;
    expect(setArg).not.toHaveProperty("sovereignIssuanceConsolidationEnabled");
    expect(setArg).not.toHaveProperty("domesticSovereignBondCoverageEnabled");
  });

  it.each([["sovereignIssuanceConsolidationEnabled"], ["domesticSovereignBondCoverageEnabled"]])(
    "PATCH rejects enabling %s live (sandbox-only) and writes nothing",
    async (flag) => {
      const { PATCH } = await import("./route");
      const res = await PATCH(makePatchRequest({ mode: "plants", [flag]: true }));

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("sandbox-only");
      expect(db.collectionMocks.gameConfig!.updateOne).not.toHaveBeenCalled();
    }
  );

  it.each(["sovereignIssuanceConsolidationEnabled", "domesticSovereignBondCoverageEnabled"])(
    "PATCH rejects a non-boolean %s with 400",
    async (flag) => {
      const { PATCH } = await import("./route");
      const res = await PATCH(makePatchRequest({ mode: "plants", [flag]: "yes" }));

      expect(res.status).toBe(400);
      expect(db.collectionMocks.gameConfig!.updateOne).not.toHaveBeenCalled();
    }
  );
});

describe("PATCH /api/admin/config/market: media slate prerequisites", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("gameConfig");
    db.collection("gameState");
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { username: "admin" },
    } as never);
  });

  it("rejects slate activation when media models are not active", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "clearing",
      mediaOperatingModelsEnabled: false,
      mediaProductSlatesEnabled: false,
      brandLoyaltyEnabled: true,
      brandLoyaltySliceEnabled: true,
      qualityPremiumPricingEnabled: true,
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      makePatchRequest({ mode: "plants", mediaProductSlatesEnabled: true })
    );

    expect(response.status).toBe(400);
    expect(db.collectionMocks.gameConfig!.updateOne).not.toHaveBeenCalled();
  });

  it("allows same-request prerequisite activation in one guarded config write", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "clearing",
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      makePatchRequest({
        mode: "plants",
        mediaOperatingModelsEnabled: true,
        mediaProductSlatesEnabled: true,
        brandLoyaltyEnabled: true,
        brandLoyaltySliceEnabled: true,
        qualityPremiumPricingEnabled: true,
      })
    );

    expect(response.status).toBe(200);
    expect(db.collectionMocks.gameConfig!.updateOne).toHaveBeenCalledWith(
      { _id: "default" },
      {
        $set: expect.objectContaining({
          mediaOperatingModelsEnabled: true,
          mediaProductSlatesEnabled: true,
          brandLoyaltyEnabled: true,
          brandLoyaltySliceEnabled: true,
          qualityPremiumPricingEnabled: true,
        }),
      },
      { upsert: false }
    );
  });

  it("fails activation if the guarded write loses a prerequisite race", async () => {
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "clearing",
      mediaOperatingModelsEnabled: true,
      mediaProductSlatesEnabled: false,
      brandLoyaltyEnabled: true,
      brandLoyaltySliceEnabled: true,
      qualityPremiumPricingEnabled: true,
    });
    db.collectionMocks.gameConfig!.updateOne.mockResolvedValue({ matchedCount: 0 } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(
      makePatchRequest({ mode: "plants", mediaProductSlatesEnabled: true })
    );

    expect(response.status).toBe(409);
    expect(db.collectionMocks.gameState!.updateOne).not.toHaveBeenCalled();
  });
});

/**
 * A mode change has to be answerable in TURNS, not just wall-clock.
 *
 * Everything an operator asks after a tier flip is turn-indexed — how much
 * soak has accumulated, which turns are the pre-flip baseline, whether the
 * plants governor ramp (anchored on `plantsStartTurn`) has finished. Turns do
 * not advance on a fixed wall clock (pauses, stalls, sim worlds), so an ISO
 * timestamp cannot be mapped back to one after the fact. The route reads the
 * turn at the moment of the flip and stamps it alongside the who and the when.
 */

describe("PATCH /api/admin/config/market: the tier is not selectable", () => {
  it.each(["off", "realization", "ledger", "clearing", "capital"])(
    "refuses %s and writes nothing",
    async (mode) => {
      const db = createMockDb();
      db.collection("gameConfig");
      const { getDb } = await import("@/lib/mongodb");
      vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
      const { requireAdmin } = await import("@/lib/api/requireAdmin");
      vi.mocked(requireAdmin).mockResolvedValue({
        ok: true,
        admin: { username: "admin" },
      } as never);

      const { PATCH } = await import("./route");
      const res = await PATCH(makePatchRequest({ mode }));

      expect(res.status).toBe(400);
      expect(db.collectionMocks.gameConfig!.updateOne).not.toHaveBeenCalled();
    }
  );
});
