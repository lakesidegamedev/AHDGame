import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { createEndorsement } from "@/lib/governorOffice/endorsements/createEndorsement";
import { createExecutiveEndorsement } from "@/lib/governorOffice/endorsements/createExecutiveEndorsement";
import {
  getEndorseableElectionTypes,
  getExecutiveEndorseableElectionTypes,
} from "@/lib/constants/countries";
import { getNationalStateId } from "@/lib/policy/nationalStateId";
import { DELETE } from "@/app/api/country/[code]/executive/orders/[orderId]/route";
const h = vi.hoisted(() => ({
  db: null as import("mongodb").Db | null,
  actor: null as import("mongodb").ObjectId | null,
}));
h.actor = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => h.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireHumanSessionWithCharacter: async () => ({
    ok: true,
    user: { character: { _id: h.actor } },
  }),
}));
vi.mock("@/lib/governorOffice/isSittingLeader", () => ({
  isSittingLeader: async (_db: import("mongodb").Db, country: string) => country === "US",
}));

it.each([false, true])(
  "keeps an office action when endorsement publication fails (national=%s)",
  async (national) => {
    const f = createTransactionalMemoryDb();
    const electionId = new ObjectId(),
      candidateId = new ObjectId(),
      candidateCharacterId = new ObjectId();
    const stateId = national ? getNationalStateId("US") : "NY";
    const electionType = (
      national ? getExecutiveEndorseableElectionTypes("US") : getEndorseableElectionTypes("US")
    )[0];
    f.memory.seed("gameState", [{ _id: "current", currentTurn: 24 }]);
    f.memory.seed("elections", [
      { _id: electionId, status: "active", countryId: "US", state: "NY", electionType },
    ]);
    f.memory.seed("electionCandidates", [
      {
        _id: candidateId,
        electionId,
        status: "active",
        party: "1",
        isNPP: false,
        characterId: candidateCharacterId,
        support: 50,
      },
    ]);
    f.memory.seed("governorOfficeState", [
      { _id: new ObjectId(), countryId: "US", stateId, gubernatorialActions: 1 },
    ]);
    const fault = withInjectedCrash(f.memory, {
      collection: national ? "executiveEndorsements" : "governorEndorsements",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    const fn = national ? createExecutiveEndorsement : createEndorsement;
    await expect(
      fn(fault.db, {
        countryId: "US",
        stateId: "NY",
        character: { _id: h.actor!, name: "Synthetic officeholder", party: "1" },
        electionId,
        candidateId,
      })
    ).rejects.toThrow();
    expect(
      (await f.db.collection("governorOfficeState").findOne({ stateId }))!.gubernatorialActions
    ).toBe(1);
    const supportFault = withInjectedCrash(f.memory, {
      collection: "electionCandidates",
      op: "updateMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(
      fn(supportFault.db, {
        countryId: "US",
        stateId: "NY",
        character: { _id: h.actor!, name: "Synthetic officeholder", party: "1" },
        electionId,
        candidateId,
      })
    ).rejects.toThrow();
    expect(
      (await f.db.collection("electionCandidates").findOne({ _id: candidateId }))!.support
    ).toBe(50);
    expect(
      (await f.db.collection("governorOfficeState").findOne({ stateId }))!.gubernatorialActions
    ).toBe(1);

    const command = () =>
      fn(f.db, {
        countryId: "US",
        stateId: "NY",
        character: { _id: h.actor!, name: "Synthetic officeholder", party: "1" },
        electionId,
        candidateId,
      });
    const replies = await Promise.all([command(), command()]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect(replies[0].body.endorsementId).toBe(replies[1].body.endorsementId);
    expect(
      (await f.db.collection("governorOfficeState").findOne({ stateId }))!.gubernatorialActions
    ).toBe(0);
    expect(
      (await f.db.collection("electionCandidates").findOne({ _id: candidateId }))!.support
    ).toBeGreaterThan(50);
    expect(
      await f.db
        .collection(national ? "executiveEndorsements" : "governorEndorsements")
        .countDocuments({})
    ).toBe(1);
  }
);

it.each([
  { countryId: "DE", stateId: getNationalStateId("DE") },
  { countryId: "US", stateId: "NY" },
])("refuses an order outside the national jurisdiction: %j", async (scope) => {
  const f = createTransactionalMemoryDb();
  h.db = f.db;
  const id = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 24 }]);
  f.memory.seed("governorExecutiveOrders", [
    {
      _id: id,
      ...scope,
      legislationTypeId: "review-policy",
      policyOptionIndexBefore: 1,
      policyOptionIndexAfter: 3,
      status: "active",
    },
  ]);
  const response = await DELETE(new Request("https://review.invalid"), {
    params: Promise.resolve({ code: "US", orderId: id.toHexString() }),
  });
  expect(response.status).toBe(404);
  expect((await f.db.collection("governorExecutiveOrders").findOne({ _id: id }))!.status).toBe(
    "active"
  );
});
