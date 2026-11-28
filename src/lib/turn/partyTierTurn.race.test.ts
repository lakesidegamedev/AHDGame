import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processPartyTierTurn } from "./partyTierTurn";
import { MAJOR_DEMOTION_GRACE_TURNS } from "@/lib/parties/partyTier";
it("a stale tier cap never restores political strength already spent", async () => {
  const memory = createInMemoryDb();
  memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "UK",
      sequentialId: 1,
      tier: "major",
      politicalStrength: 128,
      psCapEarnedRegions: ["ENG"],
      majorDemotionWarning: { startedTurn: 50 },
    },
  ]);
  memory.seed("statePartyOrg", [
    { countryId: "UK", stateId: "ENG", partyId: "1", organization: 15 },
  ]);
  const collection = memory.collection("politicalParties"),
    write = collection.bulkWrite.bind(collection);
  vi.spyOn(collection, "bulkWrite").mockImplementationOnce(async (...args) => {
    collection.docs[0].politicalStrength = 0;
    return write(...args);
  });
  await processPartyTierTurn(50 + MAJOR_DEMOTION_GRACE_TURNS, new Date(), memory as never);
  expect(collection.docs[0]).toMatchObject({ tier: "minor", politicalStrength: 0 });
});
