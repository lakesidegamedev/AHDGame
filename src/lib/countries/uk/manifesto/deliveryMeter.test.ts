import { describe, it, expect, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { loadUkBrokenPromiseMeter } from "./deliveryMeter";

let db: MockDb;

beforeEach(() => {
  db = createMockDb();
  for (const name of ["governmentFormations", "manifestos", "enactedLaws"]) db.collection(name);
});

function formedGovernment(party = "3") {
  db.collectionMocks["governmentFormations"]!.findOne.mockResolvedValue({
    _id: "UK",
    status: "formed",
    governingPartyId: party,
  });
}

function manifesto(pledgeIds: string[]) {
  db.collectionMocks["manifestos"]!.findOne.mockResolvedValue({
    _id: new ObjectId(),
    party: "3",
    lockedAt: new Date(),
    pledges: pledgeIds.map((catalogEntryId) => ({ catalogEntryId })),
  });
}

function laws(rows: Array<{ legislationTypeId: string; policyOptionIndex: number }>) {
  db.collectionMocks["enactedLaws"]!.find.mockReturnValue({
    toArray: async () => rows,
  } as never);
}

describe("loadUkBrokenPromiseMeter", () => {
  it("is undefined when no government has formed, so silence is not total failure", async () => {
    db.collectionMocks["governmentFormations"]!.findOne.mockResolvedValue(null);
    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBeUndefined();
  });

  it("is undefined while a government is still pending", async () => {
    db.collectionMocks["governmentFormations"]!.findOne.mockResolvedValue({
      _id: "UK",
      status: "pending",
      governingPartyId: "3",
    });
    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBeUndefined();
  });

  it("is undefined when the governing party has no locked manifesto", async () => {
    formedGovernment();
    db.collectionMocks["manifestos"]!.findOne.mockResolvedValue(null);
    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBeUndefined();
  });

  it("reports the kept share of the governing party's pledges against laws in force", async () => {
    formedGovernment();
    // NHS universal care is an enact pledge at level 4; income tax cut is an
    // enact pledge with no concrete target, so it judges as broken.
    manifesto(["uk.nhs.universal", "uk.tax.cutIncome"]);
    laws([{ legislationTypeId: "uk.health.universalCare.primary", policyOptionIndex: 4 }]);

    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBe(0.5);
  });

  it("drops to zero when every pledge has been broken", async () => {
    formedGovernment();
    manifesto(["uk.nhs.universal"]);
    laws([{ legislationTypeId: "uk.health.universalCare.primary", policyOptionIndex: 1 }]);

    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBe(0);
  });

  it("ignores pledges that are no longer in the catalog", async () => {
    formedGovernment();
    manifesto(["uk.retired.pledge", "uk.nhs.universal"]);
    laws([{ legislationTypeId: "uk.health.universalCare.primary", policyOptionIndex: 4 }]);

    await expect(loadUkBrokenPromiseMeter(db as unknown as Db)).resolves.toBe(1);
  });
});
