import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { loadImpeachmentFilingWindow } from "./filingWindow";
import type { Character } from "@/lib/db/types";

describe("verified election wins for impeachment protection", () => {
  let memory: ReturnType<typeof createInMemoryDb>;
  const older = new ObjectId(),
    latest = new ObjectId();
  const target = {
    careerHistory: [older, latest].map((id) => ({
      type: "elected",
      office: { type: "governor", state: "NY" },
      electionId: id.toString(),
    })),
  } as Pick<Character, "careerHistory">;
  const load = () =>
    loadImpeachmentFilingWindow(memory as unknown as Db, target, "US", "governor", "NY", 250);
  beforeEach(async () => {
    memory = createInMemoryDb();
    for (const [id, turn] of [
      [older, 10],
      [latest, 200],
    ] as const)
      await memory.collection("elections").insertOne({
        _id: id,
        countryId: "US",
        state: "NY",
        electionType: "governor",
        status: "resolved",
        endTurn: turn,
      });
  });
  it("uses the most recent win, not the first term", async () => {
    expect(await load()).toMatchObject({ lastElectionTurn: 200, remainingTurns: 22 });
  });
  it("prefers actual resolution over a scheduled close", async () => {
    await memory
      .collection("electionVoteTallies")
      .insertOne({ _id: new ObjectId(), electionId: latest, resolvedAtTurn: 210 });
    expect(await load()).toMatchObject({ eligibleOnTurn: 282, remainingTurns: 32 });
  });
  it.each(["foreign", "otherState", "otherOffice", "unresolved"])(
    "does not use %s election records",
    async (reason) => {
      const changes =
        reason === "foreign"
          ? { countryId: "BR" }
          : reason === "otherState"
            ? { state: "CA" }
            : reason === "otherOffice"
              ? { electionType: "stateSenate" }
              : { status: "active" };
      await memory.collection("elections").updateOne({ _id: latest }, { $set: changes });
      expect(await load()).toMatchObject({ lastElectionTurn: 10, remainingTurns: 0 });
    }
  );
});
