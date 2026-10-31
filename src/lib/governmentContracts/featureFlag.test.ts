import { describe, it, expect } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { isGovernmentContractsEnabled } from "./featureFlag";
import { governmentContractsEnabled } from "./rules/featureGate";

describe("government contracts kill switch", () => {
  it.each([undefined, null, {}, { governmentContractsEnabled: true }])(
    "preserves enabled behavior for %j",
    (config) => {
      expect(governmentContractsEnabled(config)).toBe(true);
    }
  );
  it("reflects disable and re-enable without caching", async () => {
    const db = createInMemoryDb() as unknown as Db;
    expect(await isGovernmentContractsEnabled(db)).toBe(true);
    await db
      .collection("gameConfig")
      .insertOne({ _id: "default" as never, governmentContractsEnabled: false });
    expect(await isGovernmentContractsEnabled(db)).toBe(false);
    await db
      .collection("gameConfig")
      .updateOne({ _id: "default" as never }, { $set: { governmentContractsEnabled: true } });
    expect(await isGovernmentContractsEnabled(db)).toBe(true);
  });
});
