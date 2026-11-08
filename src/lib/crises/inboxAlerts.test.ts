import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { alertAudience, alertKindForChange, crisisAlertSignature } from "./rules/alertRules";

const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const interactions = vi.hoisted(() => ({ map: new Map<string, unknown>() }));

vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn(async (items: unknown[]) => {
    sent.calls.push(items);
  }),
}));
vi.mock("@/lib/crises/interactionEngine", () => ({
  getCrisisInteractionsByCrisisId: vi.fn(async () => interactions.map),
}));

import { notifyCrisisChanges } from "./inboxAlerts";

describe("alert rules", () => {
  it("signs the tree position and detects a move", () => {
    const a = crisisAlertSignature({ currentNodeId: "n1", resolvedAt: null, resolutionPath: [] });
    const b = crisisAlertSignature({
      currentNodeId: "n2",
      resolvedAt: null,
      resolutionPath: ["o"],
    });
    expect(a).not.toBe(b);
    expect(alertKindForChange(undefined, a, true)).toBeNull();
    expect(alertKindForChange(a, a, true)).toBeNull();
    expect(alertKindForChange(a, b, true)).toBe("decision");
    expect(alertKindForChange(a, b, false)).toBe("stage");
  });

  it("addresses each player once, by country or home state", () => {
    const regional = {
      scope: "region",
      countryIds: ["US"],
      regionIds: ["US_OH"],
      status: "active",
    } as const;
    const people = [
      { userId: "u1", countryId: "US", homeState: "US_OH" },
      { userId: "u1", countryId: "US", homeState: "US_OH" },
      { userId: "u2", countryId: "US", homeState: "US_TX" },
    ];
    expect(alertAudience(regional, people)).toEqual(["u1"]);
    const national = { ...regional, scope: "country" } as const;
    expect(alertAudience(national, people).sort()).toEqual(["u1", "u2"]);
  });
});

describe("notifyCrisisChanges", () => {
  const crisisId = new ObjectId();
  const userId = new ObjectId();
  const crisis = {
    _id: crisisId,
    name: "Port strike",
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    status: "active",
  };
  const interaction = (nodeId: string) => ({
    crisisId,
    currentNodeId: nodeId,
    resolvedAt: null,
    resolutionPath: [],
    decisionTree: [{ nodeId, type: "choice" }],
  });

  function setup(previousSignature: string | undefined, modified: number) {
    sent.calls = [];
    const db = createMockDb();
    db.collection("crises").find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([crisis]) });
    const states = db.collection("crisisAlertState");
    states.find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue(
          previousSignature ? [{ _id: crisisId.toString(), signature: previousSignature }] : []
        ),
    });
    states.updateOne.mockResolvedValue({ modifiedCount: modified });
    db.collection("characters").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ userId, countryId: "US" }]),
    });
    return { db: db as unknown as Db, states };
  }

  it("alerts a player once when the node changes", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n2")]]);
    const { db } = setup("n1|open|0", 1);
    expect(await notifyCrisisChanges(db, 40)).toBe(1);
    const [note] = sent.calls[0] as Array<{ metadata: Record<string, unknown>; type: string }>;
    expect(note.type).toBe("crisis");
    expect(note.metadata).toMatchObject({
      crisisId: crisisId.toString(),
      alertTurn: 40,
      alertKind: "decision",
    });
  });

  it("stays quiet when the position is unchanged or another run already claimed it", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n1")]]);
    const same = setup("n1|open|0", 1);
    expect(await notifyCrisisChanges(same.db, 40)).toBe(0);

    interactions.map = new Map([[crisisId.toString(), interaction("n2")]]);
    const raced = setup("n1|open|0", 0);
    expect(await notifyCrisisChanges(raced.db, 40)).toBe(0);
  });

  it("records a first sighting without alerting", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n1")]]);
    const { db, states } = setup(undefined, 0);
    expect(await notifyCrisisChanges(db, 40)).toBe(0);
    expect(states.bulkWrite).toHaveBeenCalledTimes(1);
  });
});
