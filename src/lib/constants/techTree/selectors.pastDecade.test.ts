import { describe, it, expect } from "vitest";
import {
  autoGrantedNodeIds,
  canUnlock,
  getCommittedLane,
  isNodeOpenForResearch,
  type TechCorpView,
} from "./selectors";
import { corpNodeId, sectorNodeId } from "./nodes";

const TYPE = "logistics" as const;
// World year 1995 -> current decade 1989; 1940..1979 are completed (auto-granted).
const YEAR = 1995;
const FUNDS = { rdScore: 1e9, cashAvailable: 1e12, cashCost: 0 };

function playerCorp(): TechCorpView {
  return {
    type: TYPE,
    unlockedTechNodeIds: autoGrantedNodeIds(TYPE, YEAR),
    techDecadeLane: { "1989": "sector" },
  };
}

describe("completed-decade specializations (ticket 1606)", () => {
  it("auto-grants only the baseline, leaving the specialization tier closed", () => {
    const granted = playerCorp().unlockedTechNodeIds ?? [];
    expect(granted).toContain(sectorNodeId(TYPE, "1940", 1));
    expect(granted).not.toContain(sectorNodeId(TYPE, "1940", 10));
    expect(isNodeOpenForResearch({ slot: 9 }, true)).toBe(true);
    expect(isNodeOpenForResearch({ slot: 10 }, true)).toBe(false);
    expect(isNodeOpenForResearch({ slot: 10 }, false)).toBe(true);
  });

  it("infers a committed lane for a completed decade from its granted baseline", () => {
    // The inference fallback is why the explicit completed-decade guard is needed:
    // both lanes' baselines are owned, so getCommittedLane still returns a lane.
    expect(getCommittedLane(playerCorp(), "1940")).toBeDefined();
  });

  it("refuses a sector specialization in the completed 1940 decade", () => {
    const res = canUnlock(playerCorp(), sectorNodeId(TYPE, "1940", 10), YEAR, FUNDS);
    expect(res).toMatchObject({ ok: false, reason: "decade-complete" });
  });

  it("refuses a corporate specialization in the completed 1940 decade", () => {
    const res = canUnlock(playerCorp(), corpNodeId("1940", 10), YEAR, FUNDS);
    expect(res).toMatchObject({ ok: false, reason: "decade-complete" });
  });

  it("reports a completed decade's granted baseline as already owned, not lane-locked", () => {
    const res = canUnlock(playerCorp(), sectorNodeId(TYPE, "1940", 5), YEAR, FUNDS);
    expect(res).toMatchObject({ ok: false, reason: "already-owned" });
  });

  it("still lane-locks the non-committed lane in the current decade", () => {
    const corp: TechCorpView = {
      type: TYPE,
      unlockedTechNodeIds: [sectorNodeId(TYPE, "1989", 1)],
      techDecadeLane: { "1989": "sector" },
    };
    expect(canUnlock(corp, corpNodeId("1989", 1), YEAR, FUNDS)).toMatchObject({
      ok: false,
      reason: "lane-locked",
    });
  });
});
