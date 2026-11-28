import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { chargeOrganizationDues } from "./organizationFund";
import { chargeOrganizationTribute } from "./tribute";
import { applyOrgFundProvision } from "./membershipBills";
import { payOrganizationAid } from "./aid";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./orgMembership", () => ({ tributeMembers: vi.fn(async () => ["US"]) }));
vi.mock("./entityGdp", () => ({
  loadGdpUsdMillionsByEntity: vi.fn(async () => new Map([["US", 48]])),
}));
function world(organizationId = "UN", funded = false) {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 25, preset: "1953-default" }]);
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: funded }]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("federalBudget", [
    {
      _id: new ObjectId(),
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: 10000,
      treasuryCashLocal: 10000,
    },
  ]);
  memory.seed("organizationFunds", [
    {
      _id: new ObjectId(),
      organizationId,
      currencyCountryId: "US",
      balanceLocal: 1000,
      duesRateAnnual: 0.00006,
    },
  ]);
  memory.seed("states", [{ _id: "US-CA", countryId: "US" }]);
  memory.seed("macroMetrics", [{ _id: "US-CA", economic: { gdpGrowth: { value: 1 } } }]);
  return { db, memory };
}
it.each(["dues", "tribute"])(
  "rolls back interrupted legacy %s and charges concurrent retries once",
  async (kind) => {
    const { db, memory } = world(kind === "dues" ? "UN" : "NATO");
    const run = (target = db) =>
      kind === "dues"
        ? chargeOrganizationDues(target, "UN", [{ countryId: "US", gdpUsd: 48000000 }])
        : chargeOrganizationTribute(target, "NATO");
    const fault = withInjectedCrash(memory, {
      collection: "organizationFunds",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    await expect(run(fault.db)).rejects.toThrow();
    expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(10000);
    expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
    fault.disarm();
    await Promise.all([run(), run()]);
    const debit = 10000 - Number(memory.collection("federalBudget").docs[0].treasuryBalance);
    expect(debit).toBeGreaterThan(0);
    expect(Number(memory.collection("organizationFunds").docs[0].balanceLocal) - 1000).toBeCloseTo(
      debit,
      6
    );
    expect(memory.collection("bankMoneyMoves").docs).toHaveLength(1);
  }
);
it("keeps two same-recipient aid resolutions distinct and replays the original receipt across turns", async () => {
  const { db, memory } = world();
  expect(await payOrganizationAid(db, "UN", "US", 100, { settlementKey: "resolution:a" })).toBe(
    true
  );
  expect(await payOrganizationAid(db, "UN", "US", 200, { settlementKey: "resolution:b" })).toBe(
    true
  );
  const growth = structuredClone(memory.collection("macroMetrics").docs[0]);
  memory.collection("gameState").docs[0].currentTurn = 26;
  expect(await payOrganizationAid(db, "UN", "US", 999, { settlementKey: "resolution:a" })).toBe(
    true
  );
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(700);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(10300);
  expect(memory.collection("macroMetrics").docs[0]).toEqual(growth);
});
it("preserves aid cash if the recipient credit is interrupted or the Treasury is absent", async () => {
  const { db, memory } = world();
  const fault = withInjectedCrash(memory, {
    collection: "federalBudget",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(payOrganizationAid(fault.db, "UN", "US", 100)).rejects.toThrow();
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(10000);
  memory.collection("federalBudget").docs.splice(0);
  expect(await payOrganizationAid(db, "UN", "US", 100)).toBe(false);
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
});
it("does not fall back to legacy accounting when enabled funded context reads fail", async () => {
  const { db, memory } = world("UN", true);
  vi.spyOn(memory.collection("exchangeRates"), "find").mockImplementation(() => {
    throw new Error("quotes unavailable");
  });
  await expect(
    chargeOrganizationDues(db, "UN", [{ countryId: "US", gdpUsd: 48000000 }])
  ).rejects.toThrow("quotes unavailable");
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    treasuryBalance: 10000,
    treasuryCashLocal: 10000,
  });
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
});

it("commits legacy capitalization with its bill receipt and keeps different provisions distinct", async () => {
  const { db, memory } = world();
  memory.seed("organizationMemberships", [
    { _id: new ObjectId(), organizationId: "UN", countryId: "US" },
  ]);
  const provision = {
    type: "international_organization" as const,
    subType: "fund" as const,
    organizationId: "UN" as const,
    organizationName: "United Nations",
    amountLocal: 100,
  };
  const fault = withInjectedCrash(memory, {
    collection: "countryHistory",
    op: "insertOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(applyOrgFundProvision(fault.db, "US", provision, "bill", 0)).rejects.toThrow();
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(10000);
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
  fault.disarm();
  await Promise.all([
    applyOrgFundProvision(db, "US", provision, "bill", 0),
    applyOrgFundProvision(db, "US", provision, "bill", 0),
  ]);
  memory.collection("gameState").docs[0].currentTurn = 26;
  await applyOrgFundProvision(db, "US", provision, "bill", 0);
  await applyOrgFundProvision(db, "US", provision, "bill", 1);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(9800);
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1200);
  expect(memory.collection("countryHistory").docs).toHaveLength(2);
});
