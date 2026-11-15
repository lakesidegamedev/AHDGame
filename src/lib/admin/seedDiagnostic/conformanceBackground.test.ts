import type { Db } from "mongodb";
import { expect, it } from "vitest";
import { checkSectors } from "./conformance";
import { buildSeedExpectations } from "./expectations";

/** A world with no corporations anywhere. */
function emptyDb(): Db {
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

it("checks no opening size for a 2027 background country", async () => {
  const checks = await checkSectors(emptyDb(), buildSeedExpectations("2027-default"));
  for (const id of ["sectors.FR.openingSize", "sectors.RU.openingSize", "sectors.IE.openingSize"]) {
    expect(
      checks.find((check) => check.id === id),
      id
    ).toBeUndefined();
  }
});

it("checks the opening size of a fully simulated 2027 country", async () => {
  const checks = await checkSectors(emptyDb(), buildSeedExpectations("2027-default"));
  for (const id of ["sectors.US.openingSize", "sectors.UK.openingSize", "sectors.DE.openingSize"]) {
    expect(checks.find((check) => check.id === id)?.severity, id).toBe("ok");
  }
});
