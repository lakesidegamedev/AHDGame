import { describe, it, expect } from "vitest";
import { makeDefinition } from "./testFixtures";
import { createCrisisInstance } from "./instance";
import { acceptLeverUses } from "./severity";
import { recordLeverUses, freezeAccountabilityAttributions } from "./accountability";
import { judgeHolders, MAX_APPROVAL_POINTS } from "./blame";
import type { AccountabilityEntry } from "./types";

describe("Frozen crisis responsibility", () => {
  it("retains the submitted party after a queued responder changes party", () => {
    const def = makeDefinition();
    const start = { ...createCrisisInstance(def, 0), stage: "peak" as const, severity: 60 };
    const attribution = { countryId: "US", partyId: "old" };
    const accepted = acceptLeverUses(
      start,
      def,
      [{ leverId: "stimulus", holderId: "person", intensity: 0.5, attribution }],
      4
    );
    const recorded = recordLeverUses(start, accepted, 4);
    const frozen = freezeAccountabilityAttributions(
      recorded.ledger,
      new Map([["person", { countryId: "US", partyId: "new" }]])
    );
    expect(frozen[0].attribution).toEqual(attribution);
  });
  it("keeps country, office and party allocations bounded across transfers", () => {
    const ledger: AccountabilityEntry[] = Array.from({ length: 16 }, (_, turn) => ({
      turn,
      stage: "peak",
      role: "stateGovernor",
      holderId: "person",
      leverId: null,
      cost: {},
      mitigation: 0,
      severity: 90,
      attribution: {
        countryId: "US",
        stateId: turn < 8 ? "TX" : "CT",
        partyId: turn < 8 ? "old" : "new",
      },
    }));
    const judged = judgeHolders(ledger);
    expect(judged).toHaveLength(2);
    expect(judged.reduce((sum, v) => sum + Math.abs(v.approvalDelta), 0)).toBeCloseTo(
      MAX_APPROVAL_POINTS
    );
    expect(judged.map((v) => v.attribution?.stateId)).toEqual(["TX", "CT"]);
  });
});
