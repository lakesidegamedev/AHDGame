import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { repairCountryBriefText } from "./2026-11-23-repair-country-brief-text";

function fakeDb(data: Record<string, Record<string, unknown>[]>) {
  const writes: { collection: string; id: unknown; set: Record<string, unknown> }[] = [];
  const db = {
    collection: (name: string) => ({
      find: () => ({
        async *[Symbol.asyncIterator]() {
          for (const row of data[name] ?? []) yield row;
        },
      }),
      updateOne: async (filter: { _id: unknown }, update: { $set: Record<string, unknown> }) => {
        writes.push({ collection: name, id: filter._id, set: update.$set });
      },
    }),
  } as unknown as Db;
  return { db, writes };
}

const oldBody = "In Romania, its rating moved. Its nearest bond pays 10.25% and trades at 100.4.";

describe("repairCountryBriefText", () => {
  it("writes nothing on a dry run but reports the plan", async () => {
    const { db, writes } = fakeDb({
      countryBriefs: [{ _id: "RO:debt_stress:1", countryId: "RO", body: oldBody }],
      newsPosts: [{ _id: "n1", content: `${oldBody} (/country/ro)` }],
    });
    const result = await repairCountryBriefText(db, { dryRun: true });
    expect(result.briefsChanged).toBe(1);
    expect(result.newsChanged).toBe(1);
    expect(writes).toEqual([]);
  });

  it("updates only body and content when applied", async () => {
    const { db, writes } = fakeDb({
      countryBriefs: [{ _id: "RO:debt_stress:1", countryId: "RO", body: oldBody }],
      newsPosts: [{ _id: "n1", content: `${oldBody} (/country/ro)` }],
    });
    await repairCountryBriefText(db, { dryRun: false });
    expect(writes).toHaveLength(2);
    expect(String(writes[0].set.body)).toContain("fixed coupon of 10.25%");
    expect(String(writes[1].set.content)).toMatch(/fixed coupon of 10\.25%.*\(\/country\/ro\)$/);
  });
});

describe("repairCountryBriefText stories", () => {
  it("retitles stored upgrade stories and rebuilds outlooks", async () => {
    const { db, writes } = fakeDb({
      countryBriefs: [],
      newsPosts: [
        {
          _id: "n1",
          title: "Romania debt under strain",
          content:
            "In Romania, its credit rating moved from AA to AAA. Thin demand can push yields up and bond prices down. (/country/ro)",
        },
        {
          _id: "n2",
          title: "Italy outlook",
          content: "Italy: growth 0.3%, inflation 24.2%, debt 169% of GDP, rated B. (/country/it)",
        },
      ],
    });
    const result = await repairCountryBriefText(db, { dryRun: false });
    expect(result.newsChanged).toBe(2);
    expect(writes[0].set.title).toBe("Romania upgraded to AAA");
    expect(String(writes[1].set.content)).toContain("Italy is barely growing");
  });
});
