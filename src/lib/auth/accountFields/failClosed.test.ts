import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { countFailClosedRefusals } from "./consumer";

describe("fail-closed refusal counts for the opening-day watch", () => {
  it("counts login refusals with reason central_unavailable in the last hour and per hour for 24 hours", async () => {
    const seen: { counts: unknown[]; pipelines: unknown[] } = { counts: [], pipelines: [] };
    const col = {
      countDocuments: async (filter: unknown) => {
        seen.counts.push(filter);
        return 3;
      },
      aggregate: (pipeline: unknown) => {
        seen.pipelines.push(pipeline);
        return {
          toArray: async () => [
            { _id: "2030-01-01T09:00Z", count: 2 },
            { _id: "2030-01-01T08:00Z", count: 1 },
          ],
        };
      },
      createIndex: async () => "ok",
      createIndexes: async () => [],
    };
    const db = { collection: () => col } as unknown as Db;
    const now = new Date("2030-01-01T09:30:00Z");
    const out = await countFailClosedRefusals(db, now);
    expect(out).toEqual({
      lastHour: 3,
      byHour: [
        { hour: "2030-01-01T09:00Z", count: 2 },
        { hour: "2030-01-01T08:00Z", count: 1 },
      ],
    });
    expect(seen.counts[0]).toEqual({
      action: "auth.login",
      reason: "central_unavailable",
      ts: { $gte: new Date("2030-01-01T08:30:00Z") },
    });
    const match = (seen.pipelines[0] as { $match?: Record<string, unknown> }[])[0].$match;
    expect(match).toEqual({
      action: "auth.login",
      reason: "central_unavailable",
      ts: { $gte: new Date("2029-12-31T09:30:00Z") },
    });
  });
});
