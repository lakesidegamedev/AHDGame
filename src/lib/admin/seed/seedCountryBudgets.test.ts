import type { Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  generateCountryOwnedSeedData,
  generateDefaultEnactedLaws,
  generateStateBudgets,
  getInitialNationalBudgetsForPreset,
  getNationalBudgetSeedConfigsForPreset,
} from "@/lib/seeds/reference/budgets";
import { getInitialRates } from "@/lib/constants/currencies";
import { upsertCountryOwnedCorpEntries } from "./upsertCountryOwnedCorps";

vi.mock("@/lib/seeds/reference/budgets", () => ({
  generateCountryOwnedSeedData: vi.fn(),
  generateDefaultEnactedLaws: vi.fn(),
  generateStateBudgets: vi.fn(),
  getInitialNationalBudgetsForPreset: vi.fn(),
  getNationalBudgetSeedConfigsForPreset: vi.fn(),
}));
vi.mock("@/lib/constants/currencies", () => ({ getInitialRates: vi.fn() }));
vi.mock("./upsertCountryOwnedCorps", () => ({ upsertCountryOwnedCorpEntries: vi.fn() }));

const countries = [
  ["At", 1979, true],
  ["Br", 2023, false],
  ["Cn", 2023, false],
  ["Dd", 1979, true],
  ["De", 2020, false],
  ["Es", 1979, true],
  ["Fi", 1979, true],
  ["Fr", 1979, true],
  ["Gr", 1979, true],
  ["Ie", 2023, false],
  ["It", 1979, true],
  ["Ng", 2023, false],
  ["Se", 1979, true],
  ["Tr", 1979, true],
] as const;
const now = new Date("2026-10-17T00:00:00Z");
const costFields = [
  "gdpPerCapitaMultiplier",
  "annualCostPerCapita",
  "annualCostUsd",
  "gdpCostFraction",
  "incomeCostFraction",
];

async function setup(suffix: string) {
  const countryId = suffix.toUpperCase();
  const { [`seed${suffix}Budgets`]: seed } = await import(`./seed${suffix}Budgets.ts`);
  const db = createInMemoryDb();
  db.seed("states", [{ _id: "region", countryId, population: 1000, gdp: 50 }]);
  db.seed("federalBudget", [{ _id: "other", countryId: "US", fiscalYear: 1900 }]);
  db.seed("stateBudgets", [{ _id: "foreign", countryId: "US", stateId: "region" }]);
  db.seed("enactedLaws", [
    { _id: "foreign", countryId: "US" },
    {
      _id: "existing",
      countryId,
      legislationTypeId: "law",
      scope: "national",
      ...Object.fromEntries(costFields.map((field) => [field, 99])),
    },
  ]);
  vi.mocked(getInitialNationalBudgetsForPreset).mockReturnValue([
    { _id: countryId, countryId, fiscalYear: 1953 },
  ] as ReturnType<typeof getInitialNationalBudgetsForPreset>);
  vi.mocked(getNationalBudgetSeedConfigsForPreset).mockReturnValue([
    { countryId, fiscalYear: 1953 },
  ] as ReturnType<typeof getNationalBudgetSeedConfigsForPreset>);
  vi.mocked(generateDefaultEnactedLaws).mockReturnValue([
    {
      _id: "new",
      countryId,
      legislationTypeId: "law",
      scope: "national",
      annualCostUsd: 7,
      gdpCostFraction: 0,
    },
    { _id: "other-law", countryId: "US" },
  ] as unknown as ReturnType<typeof generateDefaultEnactedLaws>);
  vi.mocked(generateStateBudgets).mockImplementation(
    (states, fiscalYear) =>
      states.map((state) => ({
        _id: "regional",
        stateId: state.id,
        countryId: state.countryId,
        fiscalYear,
      })) as ReturnType<typeof generateStateBudgets>
  );
  vi.mocked(generateCountryOwnedSeedData).mockReturnValue([
    {
      corporation: { _id: "corp", countryOwnerId: countryId },
      sectors: [
        { _id: "discarded", corporationId: "corp", stateId: "region", sectorType: "energy" },
      ],
    },
    { corporation: { _id: "foreign", countryOwnerId: "US" }, sectors: [] },
  ] as unknown as ReturnType<typeof generateCountryOwnedSeedData>);
  const log = vi.fn();
  const run = (reset = false) => seed(db as unknown as Db, reset, log, "1953-default");
  return { db, log, run, countryId };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(getInitialRates).mockReturnValue({ NG: 31 });
  vi.mocked(upsertCountryOwnedCorpEntries).mockResolvedValue({
    corporations: 1,
    sectors: 1,
    repointed: 2,
  });
});
afterEach(() => vi.useRealTimers());

describe.each(countries)("%s country budget seeder", (suffix, fallback, skipMissing) => {
  it("preserves preset, fiscal year, country scope, and stale-law cleanup on repeated seeding", async () => {
    const { db, run, countryId } = await setup(suffix);
    await run();
    await run();
    expect(db.collection("federalBudget").docs).toEqual([
      { _id: "other", countryId: "US", fiscalYear: 1900 },
      { _id: countryId, countryId, fiscalYear: 1953, updatedAt: now },
    ]);
    const local = db.collection("enactedLaws").docs.find((law) => law.countryId === countryId);
    expect(local).toEqual({
      _id: "existing",
      countryId,
      legislationTypeId: "law",
      scope: "national",
      annualCostUsd: 7,
      gdpCostFraction: 0,
    });
    expect(db.collection("enactedLaws").docs).toContainEqual({ _id: "foreign", countryId: "US" });
    expect(generateStateBudgets).toHaveBeenLastCalledWith(
      [{ id: "region", countryId, population: 1000, gdp: 50 }],
      1953
    );
    expect(db.collection("stateBudgets").docs).toContainEqual({
      _id: "foreign",
      countryId: "US",
      stateId: "region",
    });
    expect(db.collection("stateBudgets").docs).toHaveLength(2);
    if (suffix === "Cn" || suffix === "Dd") {
      expect(generateCountryOwnedSeedData).toHaveBeenLastCalledWith(
        expect.any(Array),
        "1953-default",
        false,
        expect.any(Function)
      );
      expect(upsertCountryOwnedCorpEntries).toHaveBeenLastCalledWith(db, countryId, [
        expect.objectContaining({ corporation: { _id: "corp", countryOwnerId: countryId } }),
      ]);
    } else {
      expect(generateCountryOwnedSeedData).toHaveBeenLastCalledWith(
        expect.any(Array),
        "1953-default"
      );
      expect(db.collection("corporations").docs).toEqual([
        { _id: "corp", countryOwnerId: countryId },
      ]);
      const sectors = db.collection("corporateSectors").docs;
      expect(sectors).toHaveLength(1);
      expect(sectors[0]._id).not.toBe("discarded");
    }
  });

  it("preserves reset filters, including Germany's region-only legacy filter", async () => {
    const { db, run, countryId } = await setup(suffix);
    await run(true);
    expect(db.collection("federalBudget").docs).toContainEqual({
      _id: "other",
      countryId: "US",
      fiscalYear: 1900,
    });
    expect(db.collection("enactedLaws").docs).toContainEqual({ _id: "foreign", countryId: "US" });
    expect(db.collection("enactedLaws").docs.some((law) => law._id === "existing")).toBe(false);
    expect(db.collection("stateBudgets").docs.some((budget) => budget._id === "foreign")).toBe(
      suffix !== "De"
    );
    expect(db.collection("stateBudgets").docs).toContainEqual({
      _id: "regional",
      stateId: "region",
      countryId,
      fiscalYear: 1953,
    });
  });

  it("keeps each country's missing-budget policy and fiscal-year fallback", async () => {
    const { db, run, log, countryId } = await setup(suffix);
    vi.mocked(getInitialNationalBudgetsForPreset).mockReturnValue([]);
    vi.mocked(getNationalBudgetSeedConfigsForPreset).mockReturnValue([]);
    await run(true);
    expect(db.collection("enactedLaws").docs.some((law) => law._id === "existing")).toBe(false);
    if (skipMissing) {
      expect(generateDefaultEnactedLaws).not.toHaveBeenCalled();
      expect(generateStateBudgets).not.toHaveBeenCalled();
      expect(log).toHaveBeenLastCalledWith(
        `[${countryId}] no national budget config for preset 1953-default — skipping`
      );
    } else {
      expect(generateStateBudgets).toHaveBeenCalledWith(expect.any(Array), fallback);
      expect(generateCountryOwnedSeedData).toHaveBeenCalled();
    }
  });
});

it.each(["Cn", "Dd"])(
  "%s forwards the enabled SOE flag and retains repair logging",
  async (suffix) => {
    const { db, run, log } = await setup(suffix);
    db.seed("gameConfig", [{ _id: "default", commandEconomyEnabled: true }]);
    await run();
    expect(generateCountryOwnedSeedData).toHaveBeenCalledWith(
      expect.any(Array),
      "1953-default",
      true,
      log
    );
    if (suffix === "Dd") expect(log.mock.calls.at(-1)?.[0]).toContain("re-pointed 2 sector(s)");
  }
);

it.each([false, true])(
  "CN legacy regional cleanup requires local regions (present=%s)",
  async (present) => {
    const { db, run } = await setup("Cn");
    db.seed("stateBudgets", [{ _id: "NORTH" }]);
    if (!present) db.collection("states").docs.length = 0;
    await run(true);
    expect(db.collection("stateBudgets").docs.some((budget) => budget._id === "NORTH")).toBe(
      !present
    );
  }
);

it("seeds Nigeria's rate between the national budget and laws, preserving a live rate", async () => {
  const { db, run } = await setup("Ng");
  db.seed("exchangeRates", [{ _id: "NG", rate: 42 }]);
  const national = vi.spyOn(db.collection("federalBudget"), "updateOne");
  const rates = vi.spyOn(db.collection("exchangeRates"), "updateOne");
  const laws = vi.spyOn(db.collection("enactedLaws"), "updateOne");
  await run();
  expect(national.mock.invocationCallOrder[0]).toBeLessThan(rates.mock.invocationCallOrder[0]);
  expect(rates.mock.invocationCallOrder[0]).toBeLessThan(laws.mock.invocationCallOrder[0]);
  expect(db.collection("exchangeRates").docs).toEqual([{ _id: "NG", rate: 42 }]);
  expect(getInitialRates).toHaveBeenCalledWith("1953-default");
});

it("propagates a failed national-budget write without starting later seed steps", async () => {
  const { db, run } = await setup("At");
  vi.spyOn(db.collection("federalBudget"), "updateOne").mockRejectedValueOnce(
    new Error("write failed")
  );
  await expect(run()).rejects.toThrow("write failed");
  expect(generateDefaultEnactedLaws).not.toHaveBeenCalled();
});

it.each([false, true])(
  "preserves every defined zero cost field and clears absent ones (defined=%s)",
  async (defined) => {
    const { db, run, countryId } = await setup("At");
    vi.mocked(generateDefaultEnactedLaws).mockReturnValue([
      {
        _id: "new",
        countryId,
        legislationTypeId: "law",
        scope: "national",
        ...(defined ? Object.fromEntries(costFields.map((field) => [field, 0])) : {}),
      },
    ] as unknown as ReturnType<typeof generateDefaultEnactedLaws>);
    await run();
    const law = db.collection("enactedLaws").docs.find((row) => row.countryId === countryId)!;
    for (const field of costFields) expect(law[field]).toBe(defined ? 0 : undefined);
  }
);
