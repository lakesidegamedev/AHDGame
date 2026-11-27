import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import type { UKPartyConference } from "./types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { countPartyMembers, ensureEligibleRoll } from "./conferenceShared";
it("keeps foreign characters with the same party number out of member counts and frozen rolls", async () => {
  const f = createTransactionalMemoryDb();
  const local = new ObjectId(),
    foreign = new ObjectId();
  f.memory.seed("characters", [
    { _id: local, countryId: "UK", party: "1", userId: new ObjectId() },
    { _id: foreign, countryId: "CA", party: "1", userId: new ObjectId() },
  ]);
  const party = { sequentialId: 1, countryId: "UK", committeeIds: [] } as unknown as PoliticalParty;
  const doc = {
    _id: "conference",
    eligibleMemberIds: null,
    eligibleCommitteeIds: null,
  } as unknown as UKPartyConference;
  expect(await countPartyMembers(f.db, party)).toBe(1);
  expect((await ensureEligibleRoll(f.db, party, doc, new Date())).memberIds).toEqual([
    local.toString(),
  ]);
});
