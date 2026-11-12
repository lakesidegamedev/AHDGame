import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
let db: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => db }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: async () => ({ ok: true }) }));
import { GET } from "./route";

beforeEach(async () => {
  db = createInMemoryDb() as unknown as Db;
  await db.collection("states").insertMany([
    { _id: "TX" as never, countryId: "US", population: 100 },
    { _id: "CA" as never, countryId: "US", population: 100 },
  ]);
  await db.collection("macroMetrics").insertMany([
    { _id: "TX" as never, countryId: "US", economic: { povertyRate: { value: 0 } } },
    { _id: "CA" as never, countryId: "US", economic: { povertyRate: { value: 20 } } },
  ]);
  await db.collection("stateBudgets").insertOne({
    _id: "TX" as never,
    stateId: "TX",
    countryId: "US",
    balance: 125,
    surplus: 37,
    revenue: { total: 200, federalGrants: 35 },
    spending: { total: 163, byCategory: { education: 163 } },
  });
});
describe("US budget publication", () => {
  const request = () =>
    GET(new Request("http://localhost/api/country/US/region/TX/budget"), {
      params: Promise.resolve({ code: "US", id: "TX" }),
    });
  it("publishes formula-weighted programs and preserves cash separately from annual surplus", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.budget.balance).toBe(125);
    expect(body.budget.surplus).toBe(37);
    expect(body.grantBreakdown.map((p: { program: string }) => p.program)).toEqual([
      "Medicaid",
      "Highway Trust Fund",
      "Education Block Grant",
      "SNAP (Food Assistance)",
    ]);
    [0, 25, 10, 0].forEach((amount, index) =>
      expect(body.grantBreakdown[index].amount).toBeCloseTo(amount, 12)
    );
    expect(
      body.grantBreakdown.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
    ).toBeCloseTo(35, 12);
    expect(body.grantBreakdownBasis).toBe("current-formula-estimate");
    expect(body.grantBreakdownNote).toMatch(/estimate/i);
  });
  it("does not substitute cash when annual surplus is zero", async () => {
    await db
      .collection("stateBudgets")
      .updateOne({ _id: "TX" as never }, { $set: { "revenue.total": 163, surplus: 0 } });
    const body = await (await request()).json();
    expect(body.budget.surplus).toBe(0);
    expect(body.budget.balance).toBe(125);
  });
});
