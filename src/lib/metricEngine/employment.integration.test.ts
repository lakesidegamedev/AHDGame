import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { runMetricEngine } from "./phase";
import { employmentStaffingTightness } from "@/lib/labour/rules/employment";
import { mergeRegionMetrics } from "@/lib/macroMetrics/merge";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import { ALL_COUNTRY_IDS } from "@/lib/constants/countries";

describe("regional employment phase integration", () => {
  it("runs the same count accounting for every country and persists an idempotent allocation for staffing", async () => {
    const db = createMockDb();
    const countries = ALL_COUNTRY_IDS;
    const states = countries.map((countryId, i) => ({
      _id: `employment_${i}`,
      name: `Region ${i}`,
      countryId,
      population: 150_000,
      workingAgePopulation: 100_000,
      gdp: 1000,
      capitalStock: 3000,
    }));
    const macro = states.map((s) => ({
      _id: s._id,
      countryId: s.countryId,
      economic: {
        unemploymentRate: { value: 10 },
        laborParticipation: { value: 60 },
        laborForce: { value: 60_000 },
        labourDemand: { value: 1200 },
        labourDemandTurn: 10,
        matchingFriction: { value: 4 },
      },
      population: {},
    })) as unknown as MacroMetricsDoc[];
    for (const [name, rows] of [
      ["states", states],
      ["macroMetrics", macro],
    ] as const) {
      const cursor = { project: vi.fn(), toArray: vi.fn().mockResolvedValue(rows) };
      cursor.project.mockReturnValue(cursor);
      db.collection(name).find.mockReturnValue(cursor);
    }
    const written = new Map<string, Record<string, unknown>>();
    db.collection("macroMetrics").bulkWrite.mockImplementation(
      async (
        ops: Array<{
          updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } };
        }>
      ) => {
        for (const op of ops) written.set(op.updateOne.filter._id, op.updateOne.update.$set);
        return { ok: 1 };
      }
    );
    await runMetricEngine(db as unknown as Db, 10);
    expect(written.size).toBe(states.length);
    for (const m of macro) {
      const fields = written.get(m._id)!;
      const employment = fields.labourEmployment as NonNullable<
        MacroMetricsDoc["labourEmployment"]
      >;
      const rate = fields["economic.unemploymentRate.value"] as number;
      expect(rate).toBeGreaterThan(9);
      expect(rate).toBeLessThan(10);
      expect(employment.lastTurn).toBe(10);
      expect(
        100 *
          (1 -
            (employment.corporateEmployed + employment.backgroundEmployed) / employment.laborForce)
      ).toBeCloseTo(rate, 2);
      m.labourEmployment = employment;
      m.economic.unemploymentRate.value = rate;
      expect(employmentStaffingTightness(mergeRegionMetrics(m)?.labourEmployment)).toBeCloseTo(1);
    }
    const firstRates = [...written.values()].map((f) => f["economic.unemploymentRate.value"]);
    await runMetricEngine(db as unknown as Db, 10);
    expect([...written.values()].map((f) => f["economic.unemploymentRate.value"])).toEqual(
      firstRates
    );
  });
});
