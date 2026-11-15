import type { Db } from "mongodb";
import { expect, it } from "vitest";
import { checkSectors } from "./conformance";
import { buildSeedExpectations } from "./expectations";

/** A world with no unowned sector pool anywhere. */
function emptyPoolDb(): Db {
  return {
    collection: () => ({
      findOne: async () => null,
      countDocuments: async () => 0,
      find: () => ({
        toArray: async () => [],
        project: () => ({ toArray: async () => [] }),
      }),
    }),
  } as unknown as Db;
}

it("accepts an empty sector pool for a 2027 background country", async () => {
  const checks = await checkSectors(emptyPoolDb(), buildSeedExpectations("2027-default"));
  for (const id of ["sectors.FR.unowned", "sectors.RU.unowned", "sectors.IE.unowned"]) {
    expect(checks.find((check) => check.id === id)?.severity, id).toBe("ok");
  }
});

it("still rejects an empty sector pool for a fully simulated 2027 country", async () => {
  const checks = await checkSectors(emptyPoolDb(), buildSeedExpectations("2027-default"));
  for (const id of ["sectors.US.unowned", "sectors.UK.unowned", "sectors.DE.unowned"]) {
    expect(checks.find((check) => check.id === id)?.severity, id).toBe("critical");
  }
});
