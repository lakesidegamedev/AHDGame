import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { Crisis, CrisisDecisionNode, CrisisInteraction } from "@/lib/db/types/crisis";
import { createMockDb } from "@/lib/test-utils/mockDb";

const roles = vi.hoisted(() => ({ value: ["headOfState"] as string[] }));
const interactions = vi.hoisted(() => ({ map: new Map<string, unknown>() }));

vi.mock("@/lib/crises/interactionEngine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crises/interactionEngine")>()),
  resolveCharacterRoles: vi.fn(async () => roles.value),
  getCrisisInteractionsByCrisisId: vi.fn(async () => interactions.map),
}));

import { countViewerCrisisActions, viewerCanActOnCrisis, type BoardViewer } from "./crisisBoard";

const characterId = new ObjectId();
const viewer: BoardViewer = {
  characterId,
  countryId: "US",
  stateId: "US_OH",
  roles: ["headOfState"],
};

function node(overrides: Partial<CrisisDecisionNode> = {}): CrisisDecisionNode {
  return {
    nodeId: "n1",
    type: "choice",
    title: "t",
    description: "d",
    options: [],
    requiredRoles: ["headOfState"],
    timeLimitMinutes: null,
    ...overrides,
  };
}

function crisis(overrides: Partial<Crisis> = {}): Crisis {
  return {
    _id: new ObjectId(),
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    status: "active",
    ...overrides,
  } as Crisis;
}

function interaction(c: Crisis, n: CrisisDecisionNode, extra: Partial<CrisisInteraction> = {}) {
  return {
    crisisId: c._id,
    decisionTree: [n],
    currentNodeId: n.nodeId,
    contributors: [],
    leaderResponses: [],
    resolvedAt: null,
    resolutionPath: [],
    ...extra,
  } as unknown as CrisisInteraction;
}

describe("viewerCanActOnCrisis", () => {
  it("allows the head of state of the affected country", () => {
    const c = crisis();
    expect(viewerCanActOnCrisis(c, interaction(c, node()), viewer)).toBe(true);
  });

  it("refuses a wrong role, a foreign country, a resolved interaction and a guest", () => {
    const c = crisis();
    expect(
      viewerCanActOnCrisis(c, interaction(c, node({ requiredRoles: ["centralBankChair"] })), viewer)
    ).toBe(false);
    const foreign = crisis({ countryIds: ["FR"] });
    expect(viewerCanActOnCrisis(foreign, interaction(foreign, node()), viewer)).toBe(false);
    expect(
      viewerCanActOnCrisis(c, interaction(c, node(), { resolvedAt: new Date() }), viewer)
    ).toBe(false);
    expect(viewerCanActOnCrisis(c, interaction(c, node()), null)).toBe(false);
  });

  it("counts pooled aid only for reached crises the viewer has not given to", () => {
    const c = crisis();
    const aid = node({ type: "collective", requiredRoles: ["any"] });
    expect(viewerCanActOnCrisis(c, interaction(c, aid), viewer)).toBe(true);
    const gave = interaction(c, aid, {
      contributors: [{ characterId } as CrisisInteraction["contributors"][number]],
    });
    expect(viewerCanActOnCrisis(c, gave, viewer)).toBe(false);
    const far = crisis({ countryIds: ["FR"] });
    expect(viewerCanActOnCrisis(far, interaction(far, aid), viewer)).toBe(false);
  });

  it("refuses a country with no part in a global response", () => {
    const c = crisis({
      scope: "global",
      globalResponse: { roleByCountry: { FR: "belligerent" } } as Crisis["globalResponse"],
    });
    expect(viewerCanActOnCrisis(c, interaction(c, node()), viewer)).toBe(false);
  });
});

describe("countViewerCrisisActions", () => {
  it("is zero without a read of characters when no crisis has a decision", async () => {
    const db = createMockDb();
    db.collectionMocks.crises = undefined as never;
    const crises = db.collection("crises");
    crises.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    expect(await countViewerCrisisActions(db as unknown as Db, characterId)).toBe(0);
    expect(db.collection).not.toHaveBeenCalledWith("characters");
  });

  it("counts only the crises the viewer can answer", async () => {
    const mine = crisis();
    const theirs = crisis({ countryIds: ["FR"] });
    interactions.map = new Map([
      [mine._id.toString(), interaction(mine, node())],
      [theirs._id.toString(), interaction(theirs, node())],
    ]);
    const db = createMockDb();
    db.collection("crises").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([mine, theirs]),
    });
    db.collection("characters").findOne.mockResolvedValue({
      _id: characterId,
      countryId: "US",
      homeState: "US_OH",
    });
    expect(await countViewerCrisisActions(db as unknown as Db, characterId)).toBe(1);
  });
});
