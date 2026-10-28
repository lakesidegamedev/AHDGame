import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { seedCNWiki } from "./seedCNWiki";
import { seedNGWiki } from "./seedNGWiki";

describe.each([
  ["China", seedCNWiki],
  ["Nigeria", seedNGWiki],
] as const)("%s wiki bootstrap", (_country, seed) => {
  it("only inserts missing articles, preserving existing edits and metadata on repeat bootstrap", async () => {
    const db = createMockDb();
    await seed(db as unknown as Db);
    await seed(db as unknown as Db);
    const writes = db.collectionMocks.wikiPages.updateOne.mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    for (const [filter, update, options] of writes) {
      expect(filter).toEqual({ slug: expect.any(String) });
      expect(Object.keys(update)).toEqual(["$setOnInsert"]);
      expect(update.$setOnInsert).toMatchObject({
        content: expect.any(String),
        status: "published",
      });
      expect(options).toEqual({ upsert: true });
    }
  });
});
