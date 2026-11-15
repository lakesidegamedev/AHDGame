import { describe, expect, it } from "vitest";
import { projectCanadianRidings } from "./ridingResults";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { CA_GEOGRAPHY_REGIONS } from "./localGeography";

describe("Canadian riding placement", () => {
  const subdivisions = ["10001", "10002"].map((code) => ({
    id: `CA-FED-2023-${code}`,
    name: code,
    path: "M0,0Z",
    electorate: 100,
    partyShares: { LIB: 0.5, CON: 0.5 },
  }));
  const input = {
    subdivisions,
    votes: { a: 100, b: 100 },
    candidateParties: { a: "1", b: "2" },
    partyAbbreviations: { "1": "LIB", "2": "CON" },
    seats: { a: 1, b: 1 },
  };

  it("changes placement with a campaign while preserving ballots and actual seat quotas", () => {
    const initial = projectCanadianRidings(input);
    const boosted = projectCanadianRidings({ ...input, boosts: { "10001": { "2": 2.5 } } });
    expect(initial[0].winner).toBe("a");
    expect(boosted[0].winner).toBe("b");
    expect(boosted.map((r) => r.votes)).toEqual(initial.map((r) => r.votes));
    expect(boosted.filter((r) => r.winner === "a")).toHaveLength(1);
    expect(boosted.filter((r) => r.winner === "b")).toHaveLength(1);
  });

  it("sweeps party rosters, provinces, vacancies and capped campaigns without changing allocations", async () => {
    for (const state of CA_GEOGRAPHY_REGIONS) {
      const file = (await loadSubdivisionFile("subdivisions/ca/federal-ridings", state, {
        preset: "2027-default",
      }))!;
      for (const parties of [2, 3, 5])
        for (const vacant of [0, 1]) {
          const votes: Record<string, number> = {},
            candidateParties: Record<string, string> = {},
            abbreviations: Record<string, string> = {},
            seats: Record<string, number> = {};
          for (let p = 0; p < parties; p++) {
            const id = `candidate-${p}`;
            votes[id] = 10000 - p * 1000;
            candidateParties[id] = String(p);
            abbreviations[p] = ["LIB", "CON", "NDP", "BQ", "GRN"][p];
            seats[id] = 0;
          }
          for (let seat = 0; seat < file.subdivisions.length - vacant; seat++)
            seats[`candidate-${seat % parties}`]++;
          const result = projectCanadianRidings({
            subdivisions: file.subdivisions,
            votes,
            candidateParties,
            partyAbbreviations: abbreviations,
            seats,
            boosts: { [file.subdivisions[0].id.slice(-5)]: { "0": 7.5 } },
          });
          expect(result).toHaveLength(file.subdivisions.length);
          expect(result.filter((r) => !r.winner)).toHaveLength(vacant);
          for (const [id, count] of Object.entries(seats)) {
            expect(result.filter((r) => r.winner === id)).toHaveLength(count);
            expect(result.reduce((n, r) => n + r.votes[id], 0)).toBe(votes[id]);
          }
        }
    }
  });

  it("refuses impossible quotas and invalid stored boosts", () => {
    expect(() => projectCanadianRidings({ ...input, seats: { a: 3 } })).toThrow(/quotas/);
    expect(() => projectCanadianRidings({ ...input, seats: { missing: 1 } })).toThrow(/quotas/);
    expect(() => projectCanadianRidings({ ...input, boosts: { "10001": { "2": NaN } } })).toThrow(
      /boost/
    );
  });
});
