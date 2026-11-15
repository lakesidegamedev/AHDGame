import { expect, it } from "vitest";
import { buildRaceIndex, pollingSeries } from "./index";
import { election } from "./__fixtures__/election";

it.each([
  ["US", "OH", "senate"],
  ["CA", "CA_ON", "caCommons"],
])("keeps %s primary history separate from the general count", (countryId, state, type) => {
  const full = election({
    countryId,
    state,
    electionType: type,
    cands: [
      { id: "a", name: "A", party: "1", share: 40 },
      { id: "c", name: "C", party: "2", share: 60 },
    ],
    primaryResults: {
      "1": [
        { candidateId: "a", characterName: "A", sharePct: 70, won: true },
        { candidateId: "b", characterName: "B", sharePct: 30, won: false },
      ],
    },
    snapshotHistory: [
      {
        recordedAt: new Date(0),
        byParty: {
          "1": [
            { candidateId: "a", sharePct: 70 },
            { candidateId: "b", sharePct: 30 },
          ],
        },
      },
    ] as never,
    generalVotes: { turnSnapshots: [{ turn: 25, sharesPct: { a: 40, c: 60 } }] } as never,
  });
  for (const ended of [false, true]) {
    const race = { ...full, isEnded: ended, inGeneral: !ended };
    const rows = buildRaceIndex([race], {
      currentTurn: 26,
      nationalChamberKeys: [type],
      includeFinal: true,
    });
    const primary = rows.find((r) => r.primaryPartyId === "1")!;
    expect(pollingSeries(full, primary)).toEqual([{ turn: 1, shares: { a: 70, b: 30 } }]);
    const general = rows.find((r) => r.primaryPartyId === null)!;
    expect(pollingSeries(full, general)).toEqual([{ turn: 25, shares: { a: 40, c: 60 } }]);
  }
});
