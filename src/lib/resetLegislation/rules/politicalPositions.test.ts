import { describe, expect, it } from "vitest";
import { v2VotePosition } from "./politicalPositions";
import { resetLawFamilies } from "../catalog";
import { v2EnactmentApproval } from "./voterReactions";

describe("authored legislative leans", () => {
  it.each(["L12", "L36", "L39", "L40", "L41", "L44", "L45"])(
    "routes %s delivery choices economically",
    (familyId) => {
      expect(v2VotePosition({ familyId, choice: "far_left" })).toMatchObject({
        economic: expect.any(Number),
      });
      expect(v2VotePosition({ familyId, choice: "far_left" })).not.toHaveProperty("social");
    }
  );
  it.each(["L46", "L47"])(
    "keeps %s open rights options liberal while showing delivery economics",
    (familyId) => {
      expect(v2VotePosition({ familyId, choice: "far_right" })).toMatchObject({
        economic: expect.any(Number),
        social: expect.any(Number),
      });
      expect(v2VotePosition({ familyId, choice: "far_right" })!.social).toBeLessThan(0);
    }
  );
  it("simulates every option pair across all six countries without approval farming", () => {
    for (const country of ["US", "UK", "JP", "IE", "SCO", "WAL"])
      for (const family of resetLawFamilies) {
        for (const from of family.levels)
          for (const to of family.levels) {
            const row = {
              familyId: family.id,
              choice: to.position,
              currentChoiceSnapshot: from.position,
            };
            const forward = v2EnactmentApproval([row], country);
            const reverse = v2EnactmentApproval(
              [{ ...row, choice: from.position, currentChoiceSnapshot: to.position }],
              country
            );
            for (const [bucket, value] of Object.entries(forward)) {
              expect(value).toBeCloseTo(-(reverse[bucket] ?? 0), 8);
              expect(Math.abs(value)).toBeLessThanOrEqual(4);
            }
          }
      }
  });
});
