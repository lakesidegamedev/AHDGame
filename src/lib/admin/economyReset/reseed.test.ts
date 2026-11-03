import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { reseedCountryOwnedCorporations } from "./reseed";

let db: Db;

const RU_STATES = [
  { _id: "CEN", countryId: "RU", population: 30_000_000, gdp: 400_000_000_000 },
  { _id: "URA", countryId: "RU", population: 20_000_000, gdp: 250_000_000_000 },
];

async function seedWorld(dissolved: boolean): Promise<void> {
  db = createInMemoryDb() as unknown as Db;
  await db.collection("states").insertMany(RU_STATES as never[]);
  await db
    .collection("federalBudget")
    .insertOne({ _id: "RU", countryId: "RU", currencyCode: "RUB" } as never);
  if (dissolved)
    await db.collection("federationSettlementApplications").insertOne({
      _id: "1991-default:ru-1991-default:1",
      presetId: "1991-default",
      settlementId: "ru-1991-default",
      sourceEntityId: "RU",
      entityIds: ["RU", "UKR", "BLR"],
      status: "applied",
    } as never);
}

async function russianCorporations() {
  return db.collection("corporations").find({ countryOwnerId: "RU" }).toArray();
}

describe("reseedCountryOwnedCorporations after a federation breakup", () => {
  beforeEach(() => undefined);

  it("rebuilds the Soviet command conglomerate while the union stands", async () => {
    await seedWorld(false);
    await reseedCountryOwnedCorporations(db, "1991-default", true, () => {});
    expect(
      await db.collection("corporateSectors").countDocuments({ countryId: "RU" })
    ).toBeGreaterThan(0);
  });

  it("seeds only the Russian sovereign issuer, in the live currency, once the breakup applied", async () => {
    await seedWorld(true);
    await reseedCountryOwnedCorporations(db, "1991-default", true, () => {});
    const corporations = await russianCorporations();
    expect(corporations).toHaveLength(1);
    expect(corporations[0]).toMatchObject({
      name: "Russian Federation",
      isPrimaryNationalCorporation: true,
      liquidCurrencyCode: "RUB",
    });
    expect(await db.collection("corporateSectors").countDocuments({ countryId: "RU" })).toBe(0);
  });
});
