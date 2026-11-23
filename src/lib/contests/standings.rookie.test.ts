import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { computeRawStandings, type ContestWorld, type PlayerCharacter } from "./standings";

const now = new Date("2026-11-23T12:00:00Z");

function player(name: string, created: string, influence: number): PlayerCharacter {
  return {
    _id: new ObjectId(),
    name,
    nationalInfluence: influence,
    accountCreatedAt: new Date(created),
  } as unknown as PlayerCharacter;
}

describe("rookie standings", () => {
  it("drops stored entries whose account was already old when the round opened", async () => {
    const rookie = player("Rookie", "2026-11-18T00:00:00Z", 12);
    const veteran = player("Veteran", "2026-05-29T00:00:00Z", 320);
    const players = new Map([rookie, veteran].map((p) => [p._id.toString(), p]));
    const world = { now, players } as unknown as ContestWorld;
    const baselines = [rookie, veteran].map((p) => ({
      subjectId: p._id.toString(),
      characterId: p._id.toString(),
      value: 10,
    }));
    const round = {
      kind: "rookie_influence",
      startedAt: new Date("2026-11-22T03:00:00Z"),
      baselines,
    };
    const { standings } = await computeRawStandings({} as never, world, round as never);
    expect(standings.map((s) => s.characterName)).toEqual(["Rookie"]);
  });
});
