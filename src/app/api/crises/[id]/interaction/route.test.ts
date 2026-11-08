/**
 * An `aid` node is interactable for the head of state of a responding country,
 * so the panel and this route agree that the decision prompt has controls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));

let db: MockDb;

const crisisId = new ObjectId();
const characterId = new ObjectId();

const AID_NODE = {
  nodeId: "aid",
  type: "aid" as const,
  title: "International aid",
  description: "Reconstruction aid is needed.",
  requiredRoles: ["headOfState"],
  timeLimitMinutes: null,
  aidMaxPctGdp: 0.02,
  aidDefaultPctGdp: 0.005,
  options: [
    { optionId: "aid_skip", label: "No Aid", description: "No contribution.", effects: [] },
    { optionId: "aid_contribute", label: "Send Aid", description: "Contribute.", effects: [] },
  ],
};

function makeCrisis() {
  return {
    _id: crisisId,
    name: "Great Flood",
    description: "Reconstruction is needed.",
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    status: "active",
    startTurn: 1,
    effects: [],
    interactionDefinition: { decisionTree: [AID_NODE] },
  };
}

function makeInteraction() {
  return {
    _id: new ObjectId(),
    crisisId,
    decisionTree: [AID_NODE],
    currentNodeId: "aid",
    resolutionPath: [],
    contributors: [],
    collectiveCurrent: 0,
    collectiveTarget: null,
    decisionDeadline: null,
    resolvedAt: null,
    leaderResponses: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function get() {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/crises/${crisisId.toString()}/interaction`), {
    params: Promise.resolve({ id: crisisId.toString() }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  ["crises", "crisisInteractions", "federalBudget", "crisisAidCommitments"].forEach((c) =>
    db.collection(c)
  );
  db.collectionMocks["crises"]!.findOne.mockResolvedValue(makeCrisis());
  db.collectionMocks["crisisInteractions"]!.findOne.mockResolvedValue(makeInteraction());

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: {
      userId: new ObjectId().toString(),
      username: "leader",
      email: "leader@example.com",
      role: "user",
      isAdmin: false,
      hasCharacter: true,
      character: {
        _id: characterId,
        name: "Test Leader",
        countryId: "US",
        homeState: "US-NY",
        currentOffice: { type: "president" },
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireAuthWithCharacter>>);
});

describe("GET /api/crises/[id]/interaction — aid nodes", () => {
  it("reports the node as interactable", async () => {
    const res = await get();
    const body = (await res.json()) as { canInteract: boolean };

    expect(body.canInteract).toBe(true);
  });
});
