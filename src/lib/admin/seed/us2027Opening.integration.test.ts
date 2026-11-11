import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getInitialNationalBudgetsForPreset } from "@/lib/seeds/reference/budgets";
import { loadModeledOpening } from "@/lib/resetVersions/seedModeledOpening";
import { checkUS2027Opening } from "../seedDiagnostic/us2027Opening";

const db = createInMemoryDb() as unknown as Db;
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(async () => db),
  getMongoClient: vi.fn(async () => ({ db: () => ({ command: async () => ({}) }) })),
}));
beforeAll(async () => {
  const { initializeGameState } = await import("@/lib/turnSystem");
  await initializeGameState();
  await db
    .collection("gameState")
    .updateOne(
      { _id: "current" as never },
      { $set: { preset: "2027-default", startingYear: 2027, currentYear: 2027, currentTurn: 1 } }
    );
  const { bootstrapGameWorld } = await import("../bootstrapGameWorld");
  await bootstrapGameWorld({ db, preset: "2027-default", resetReference: true, log: () => {} });
}, 600_000);

describe("real US 2027 opening pipeline", () => {
  it("passes population, fiscal composition, holder and calendar qualification", async () => {
    const checks = await checkUS2027Opening(db, "2027-default");
    expect(checks.filter((c) => c.severity === "critical")).toEqual([]);
    expect(checks.some((c) => c.id.endsWith("provenance") && c.severity === "warn")).toBe(true);
  });
  it("funds departments from the actual new-generation enacted law book", async () => {
    const opening = await loadModeledOpening(db, "2027-default", "test-world", 1);
    const accounts = opening.partition.accounts.filter((a) => a.countryId === "US");
    expect(accounts.filter((a) => a.annualAuthority > 0).length).toBeGreaterThan(5);
    const lawBoard = opening.fiscal.laws.find(
      (b) => b.countryId === "US" && b.scope === "national"
    )!;
    const sources = Object.values(lawBoard.references)
      .flatMap((r) => r.sourceComponents)
      .filter((s) => s.annualBooked > 0);
    expect(sources.some((s) => s.sourceId === "us.defense.armedForces.primary")).toBe(true);
    expect(new Set(sources.map((s) => s.sourceId)).size).toBe(sources.length);
    const treasury = opening.partition.continuity.find((r) => r.countryId === "US")!;
    const budget = await db.collection("federalBudget").findOne({ _id: "federal" as never });
    expect(
      accounts.reduce((sum, a) => sum + a.annualAuthority + a.grantReservation, 0) +
        treasury.annualAuthority +
        treasury.grantReservation
    ).toBe(Math.round(budget!.spending.total - budget!.spending.debtInterest));
  });
  it("retains the modeled fiscal composition through repeated real budget refreshes", async () => {
    const { refreshNationalBudgetRevenue } = await import("@/lib/budget/revenue");
    const authored = getInitialNationalBudgetsForPreset("2027-default").find(
      (b) => b.countryId === "US"
    )!;
    for (let n = 0; n < 2; n++) await refreshNationalBudgetRevenue(db, ["federal"]);
    const budget = await db.collection("federalBudget").findOne({ _id: "federal" as never });
    expect(budget!.spending.total - budget!.spending.debtInterest).toBeCloseTo(
      authored.spending.total - authored.spending.debtInterest,
      0
    );
    const checks = await checkUS2027Opening(db, "2027-default");
    expect(checks.filter((c) => c.severity === "critical")).toEqual([]);
  });
  it("replays calibration without losing the absolute scales for future bills", async () => {
    const { calibrateUS2027ProgramBook } = await import("./seedPoliticalLegislation");
    const before = await db.collection("federalBudget").findOne({ _id: "federal" as never });
    await calibrateUS2027ProgramBook(db, () => {});
    await calibrateUS2027ProgramBook(db, () => {});
    const after = await db.collection("federalBudget").findOne({ _id: "federal" as never });
    expect(after!.spending.byCategory).toEqual(before!.spending.byCategory);
    for (const [category, scale] of Object.entries(before!.programCostScaleByCategoryBaseline))
      expect(after!.programCostScaleByCategoryBaseline[category]).toBeCloseTo(scale as number, 8);
  });
});
