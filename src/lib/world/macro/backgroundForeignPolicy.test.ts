/**
 * Scripted foreign policy through the real kernel tick (#5702 section 5): a
 * background country's government sets its tariff, sanctions a rival at war
 * with a partner and lifts it when the war ends, answers a bloc's war call
 * once, leans its alignment row, and its trade surplus reaches the central
 * bank the FX target reads.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { MacroCountryState } from "./types";
import { buildBackground2027MacroCountry } from "./background2027";
import { processMacroCountryTurn } from "./macroCountryTurn";
import { macroTickBucket, MACRO_TICK_INTERVAL } from "./schedule";
import { backgroundGovernmentActorId, backgroundTariffSourceId } from "./backgroundForeignPolicy";
import { loadBackgroundStancePulls } from "@/lib/alignment/backgroundStancePulls";

const joinFault = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/military/joinSide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/military/joinSide")>();
  return {
    ...actual,
    joinSide: (...args: Parameters<typeof actual.joinSide>) => {
      if (joinFault.fail) throw new Error("join delivery failed");
      return actual.joinSide(...args);
    },
  };
});
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn(async () => undefined),
  loadTxThresholds: vi.fn(async () => ({})),
}));

const conflictId = new ObjectId();

function fixture() {
  const db = createInMemoryDb();
  const country = buildBackground2027MacroCountry("TR");
  country.lastMacroTickTurn = null;
  country.fundedTrade = {
    turn: 1,
    exportFill: 0.9,
    importFill: 0.9,
    prior: null,
    last: { offeredValue: 400, soldValue: 300, requestedValue: 120, boughtValue: 100 },
  };
  db.seed("macroCountries", [country as unknown as Record<string, unknown>]);
  db.seed("gameState", [{ _id: "current", currentYear: 2027, resetWorldId: "w-fp" }]);
  db.seed("federalBudget", [
    {
      _id: "TR",
      countryId: "TR",
      currencyCode: "TRY",
      gdp: 1_000_000_000_000,
      economicFactors: { inflationRate: 30 },
    },
  ]);
  db.seed(
    "politicalParties",
    [
      ["Justice and Development Party", "AKP", 1, 4, 45],
      ["Republican People's Party", "CHP", -2, -2, 35],
      ["Nationalist Movement Party", "MHP", 1, 5, 20],
    ].map(([name, abbreviation, economicPosition, socialPosition, politicalStrength], i) => ({
      _id: new ObjectId(),
      sequentialId: i + 1,
      countryId: "TR",
      name,
      abbreviation,
      color: "#aa0000",
      economicPosition,
      socialPosition,
      politicalStrength,
    }))
  );
  db.seed("countryAlignments", [
    { _id: new ObjectId(), entityId: "TR", shares: { WASHINGTON: 45, MOSCOW: 15 }, nonAligned: 40 },
    { _id: new ObjectId(), entityId: "RU", shares: { MOSCOW: 80 }, nonAligned: 20 },
    { _id: new ObjectId(), entityId: "PL", shares: { WASHINGTON: 80 }, nonAligned: 20 },
  ]);
  db.seed("organizationMemberships", [
    { _id: new ObjectId(), countryId: "TR", organizationId: "NATO" },
    { _id: new ObjectId(), countryId: "PL", organizationId: "NATO" },
    { _id: new ObjectId(), countryId: "TR", organizationId: "BLACK_SEA_FORUM" },
  ]);
  db.seed("conflicts", [
    {
      _id: conflictId,
      name: "Test War",
      status: "active",
      hostCountry: "PL",
      sideA: { countries: ["RU"] },
      sideB: { countries: ["PL"] },
      intensity: 30,
      control: 50,
    },
  ]);
  // A non-bloc organisation's call is discretionary: the script decides it.
  db.seed("organizationLegislation", [
    {
      _id: new ObjectId(),
      organizationId: "BLACK_SEA_FORUM",
      type: "join_conflict",
      status: "active",
      joinConflictTheaterId: String(conflictId),
      joinConflictSide: "B",
    },
  ]);
  db.seed("centralBanks", [{ _id: "TR", countryId: "TR" }]);
  return { db, firstTick: macroTickBucket("TR") + 1 };
}

describe("background country scripted foreign policy on the kernel tick", () => {
  it("acts through the existing rows and lifts its sanctions when the war ends", async () => {
    const { db, firstTick } = fixture();
    const d = db as unknown as Db;

    const result = await processMacroCountryTurn(d, firstTick);
    expect(result.foreignPolicy).toBeDefined();

    const doc = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    const policy = doc.foreignPolicy!;
    expect(policy.updatedTurn).toBe(firstTick);
    expect(policy.bloc).toBe("us");
    expect(policy.stance.hawkishness).toBeGreaterThan(0.5);

    // Tariff: TR is outside the EU, so it sets its own economy-wide rate.
    const tariff = await db
      .collection("tariffs")
      .findOne({ countryId: "TR", scopeType: "economy_wide" });
    expect(tariff).toMatchObject({ sourceBillId: backgroundTariffSourceId("TR") });
    expect(tariff?.rate).toBe(policy.tariff.economyWide);

    // Sanctions on the rival at war with a NATO partner, time-limited.
    const embargo = await db
      .collection("tradeEmbargoes")
      .findOne({ sourceCountry: "TR", targetCountry: "RU" });
    expect(embargo).toMatchObject({
      origin: "minister",
      direction: "both",
      mode: "block",
      createdBy: backgroundGovernmentActorId("TR"),
    });
    expect(embargo?.expiresTurn).toBeGreaterThan(firstTick);

    // The war call is decided once; joining enrols TR through joinSide.
    expect(policy.warDecisions).toHaveLength(1);
    const war = await db.collection("conflicts").findOne({ _id: conflictId });
    expect((war?.sideB as { countries: string[] }).countries.includes("TR")).toBe(
      policy.warDecisions[0].joined
    );

    // Trade surplus reaches the central bank as FX pressure.
    const bank = await db.collection("centralBanks").findOne({ _id: "TR" });
    expect(bank?.backgroundTradePressure).toBeGreaterThan(0);

    // The alignment phase reads the government's lean.
    const pulls = await loadBackgroundStancePulls(d, ["WASHINGTON", "MOSCOW", "BEIJING"]);
    expect(pulls.get("TR")).toEqual(policy.alignmentPull);
    expect((await loadBackgroundStancePulls(d, ["WEST", "EAST"])).size).toBe(0);

    // The war ends: the next tick lifts the sanctions and asks nothing again.
    await db
      .collection("conflicts")
      .updateOne({ _id: conflictId }, { $set: { status: "resolved" } });
    const next = firstTick + MACRO_TICK_INTERVAL;
    await processMacroCountryTurn(d, next);
    const lifted = await db
      .collection("tradeEmbargoes")
      .find({ sourceCountry: "TR", targetCountry: "RU" })
      .toArray();
    expect(lifted.length).toBeGreaterThan(0);
    for (const row of lifted) expect(row.expiresTurn).toBeLessThan(next);
    const after = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    expect(after.foreignPolicy?.warDecisions).toHaveLength(1);
    expect(after.foreignPolicy?.log.some((e) => e.kind === "lift")).toBe(true);
  });

  it("keeps a war join pending when delivery fails and delivers it on the next tick", async () => {
    const { db, firstTick } = fixture();
    const d = db as unknown as Db;
    joinFault.fail = true;
    try {
      await expect(processMacroCountryTurn(d, firstTick)).rejects.toThrow("join delivery failed");
    } finally {
      joinFault.fail = false;
    }
    const saved = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    const decision = saved.foreignPolicy!.warDecisions[0];
    expect(decision).toMatchObject({ joined: true, pending: true });
    const before = await db.collection("conflicts").findOne({ _id: conflictId });
    expect((before?.sideB as { countries: string[] }).countries).not.toContain("TR");

    await processMacroCountryTurn(d, firstTick + MACRO_TICK_INTERVAL);
    const war = await db.collection("conflicts").findOne({ _id: conflictId });
    expect((war?.sideB as { countries: string[] }).countries).toContain("TR");
    const after = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    expect(after.foreignPolicy!.warDecisions).toHaveLength(1);
    expect(after.foreignPolicy!.warDecisions[0].pending).toBe(false);
  });

  it("redelivers tariff writes that failed instead of dropping them", async () => {
    const { db, firstTick } = fixture();
    const d = db as unknown as Db;
    const real = db.collection.bind(db);
    let failTariffs = true;
    (db as unknown as { collection: unknown }).collection = (name: string) => {
      const collection = real(name);
      if (name !== "tariffs") return collection;
      return new Proxy(collection, {
        get: (target, key) =>
          key === "bulkWrite" && failTariffs
            ? async () => {
                throw new Error("tariff write failed");
              }
            : (target as never)[key],
      });
    };
    await expect(processMacroCountryTurn(d, firstTick)).rejects.toThrow("tariff write failed");
    const saved = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    const pending = saved.foreignPolicy!.pendingTariffs ?? [];
    expect(pending.length).toBeGreaterThan(0);
    expect(await db.collection("tariffs").countDocuments({})).toBe(0);

    failTariffs = false;
    await processMacroCountryTurn(d, firstTick + MACRO_TICK_INTERVAL);
    const wide = await db
      .collection("tariffs")
      .findOne({ countryId: "TR", scopeType: "economy_wide" });
    const wanted = pending.find((t) => t.scopeType === "economy_wide");
    expect(wide?.rate).toBeGreaterThanOrEqual(wanted?.rate ?? 0);
    const after = (await db
      .collection("macroCountries")
      .findOne({ _id: "TR" })) as unknown as MacroCountryState;
    expect(after.foreignPolicy!.pendingTariffs).toEqual([]);
  });

  it("leaves non-background macro documents untouched", async () => {
    const db = createInMemoryDb();
    const country = buildBackground2027MacroCountry("TR");
    country.dataQuality = { ...country.dataQuality, provenance: "estimated-background" };
    db.seed("macroCountries", [country as unknown as Record<string, unknown>]);
    db.seed("gameState", [{ _id: "current", currentYear: 2027 }]);
    const result = await processMacroCountryTurn(db as unknown as Db, macroTickBucket("TR") + 1);
    expect(result.foreignPolicy).toBeUndefined();
    expect(await db.collection("tariffs").countDocuments({})).toBe(0);
  });
});
