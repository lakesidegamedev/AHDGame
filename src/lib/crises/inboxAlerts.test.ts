import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import {
  alertAudience,
  alertKindForChange,
  crisisAlertSignature,
  type AlertCrisis,
} from "./rules/alertRules";

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
    } as AlertCrisis;
    const people = [
      { userId: "u1", countryId: "US", homeState: "US_OH" },
      { userId: "u1", countryId: "US", homeState: "US_OH" },
      { userId: "u2", countryId: "US", homeState: "US_TX", holdsOffice: true },
      { userId: "u3", countryId: "US", homeState: "US_TX" },
    ];
    expect(alertAudience(regional, people)).toEqual(["u1"]);
    // Country-wide moves reach officeholders only, not every resident.
    const national: AlertCrisis = { ...regional, scope: "country" };
    expect(alertAudience(national, people)).toEqual(["u2"]);
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

  function setup(previousSignature: string | undefined, previousTurn = 39) {
    sent.calls = [];
    const db = createMockDb();
    db.collection("crises").find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([crisis]) });
    const states = db.collection("crisisAlertState");
    states.find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue(
          previousSignature
            ? [{ _id: crisisId.toString(), signature: previousSignature, turn: previousTurn }]
            : []
        ),
    });
    db.collection("characters").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ userId, countryId: "US", currentOffice: "governor" }]),
    });
    return { db: db as unknown as Db, states };
  }

  it("alerts a player once when the node changes", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n2")]]);
    const { db } = setup("n1|open|0");
    expect(await notifyCrisisChanges(db, 40)).toBe(1);
    const [note] = sent.calls[0] as Array<{ metadata: Record<string, unknown>; type: string }>;
    expect(note.type).toBe("crisis");
    expect(note.metadata).toMatchObject({
      crisisId: crisisId.toString(),
      alertTurn: 40,
      alertKind: "decision",
    });
  });

  it("stays quiet when the position is unchanged", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n1")]]);
    expect(await notifyCrisisChanges(setup("n1|open|0").db, 40)).toBe(0);
  });

  it("sends one alert per crisis per turn", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n2")]]);
    const { db, states } = setup("n1|open|0", 40);
    expect(await notifyCrisisChanges(db, 40)).toBe(0);
    expect(states.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("records a first sighting without alerting", async () => {
    interactions.map = new Map([[crisisId.toString(), interaction("n1")]]);
    const { db, states } = setup(undefined);
    expect(await notifyCrisisChanges(db, 40)).toBe(0);
    expect(states.bulkWrite).toHaveBeenCalledTimes(1);
  });
});
