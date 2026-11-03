import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { makeElection } from "@/lib/test-utils/factories";
import {
  downBallotRedirectTarget,
  primaryPageRedirectTarget,
} from "@/lib/elections/downBallotRedirect";

let db: MockDb;
beforeEach(() => {
  db = createMockDb();
});

const asDb = () => db as unknown as Db;

describe("downBallotRedirectTarget", () => {
  it("redirects a down-ballot race to Campaign Manager", async () => {
    const e = makeElection({ electionType: "senate" });
    db.collection("elections").findOne.mockResolvedValue(e);
    expect(await downBallotRedirectTarget(asDb(), e._id.toHexString())).toBe(
      `/campaign-manager?race=${e._id.toHexString()}`
    );
  });

  it("redirects a past cycle to its finished race", async () => {
    const past = makeElection({ electionType: "senate", seatId: "US-senate-MI-1", cycle: 2 });
    db.collection("elections").findOne.mockResolvedValue(past);
    const target = await downBallotRedirectTarget(asDb(), "US-senate-MI-1", 2);
    expect(db.collection("elections").findOne.mock.calls[0][0]).toMatchObject({
      seatId: "US-senate-MI-1",
      cycle: 2,
    });
    expect(target).toBe(`/campaign-manager?race=${past._id.toHexString()}`);
  });

  it("leaves the presidency alone", async () => {
    const pres = makeElection({ electionType: "president" });
    db.collection("elections").findOne.mockResolvedValue(pres);
    expect(await downBallotRedirectTarget(asDb(), pres._id.toHexString())).toBeNull();
  });

  it("leaves an unknown election to the page", async () => {
    db.collection("elections").findOne.mockResolvedValue(null);
    expect(await downBallotRedirectTarget(asDb(), new ObjectId().toHexString())).toBeNull();
    expect(await downBallotRedirectTarget(asDb(), "not-an-id")).toBeNull();
  });
});

describe("primaryPageRedirectTarget", () => {
  it("redirects a down-ballot party primary page with its party", async () => {
    expect(await primaryPageRedirectTarget(asDb(), "house", "2")).toBe(
      "/campaign-manager?type=house&stage=primary&party=2"
    );
  });

  it("resolves a party abbreviation to its id", async () => {
    db.collection("politicalParties").findOne.mockResolvedValue({ sequentialId: 3 });
    expect(await primaryPageRedirectTarget(asDb(), "senate", "GRN")).toBe(
      "/campaign-manager?type=senate&stage=primary&party=3"
    );
  });

  it("leaves an unknown tier to the page", async () => {
    expect(await primaryPageRedirectTarget(asDb(), "president", "2")).toBeNull();
  });
});
