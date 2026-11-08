import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { ALL_CRISIS_TEMPLATES } from "./templates";
import type { CrisisTemplate } from "@/lib/db/types/crisis";
import { createCrisisFromTemplate } from "./createCrisisFromTemplate";
import { forceSpawnCrisis } from "./autoCrisisSpawn";
import { legacyDefinitionId } from "./v2/legacyConvert";

function inserted(db: ReturnType<typeof createMockDb>) {
  return db.collectionMocks.crises.insertOne.mock.calls[0][0];
}

describe("spawn paths create Crisis v2 instances", () => {
  it("attaches an instance for a keyed template, firing its first step on the start turn", async () => {
    const db = createMockDb();
    await createCrisisFromTemplate(db as unknown as Db, {
      template: ALL_CRISIS_TEMPLATES.banking_crisis as CrisisTemplate,
      templateKey: "banking_crisis",
      scope: "country",
      countryIds: ["US"],
      regionIds: [],
      currentTurn: 48,
    });
    const crisis = inserted(db);
    expect(crisis.v2.definitionId).toBe(legacyDefinitionId("banking_crisis"));
    expect(crisis.v2.scope).toBe("national");
    expect(crisis.v2.stage).toBe("signal");
    expect(crisis.v2.startTurn).toBe(48);
    // the step on the start turn must not be skipped as already sampled
    expect(crisis.v2.severityHistory.at(-1).turn).toBeLessThan(48);
    // authored effects stay on the document for the legacy writers and readers
    expect(crisis.effects.length).toBeGreaterThan(0);
  });

  it("finds the template key by identity when a spawner omits it", async () => {
    const db = createMockDb();
    await createCrisisFromTemplate(db as unknown as Db, {
      template: ALL_CRISIS_TEMPLATES.recession as CrisisTemplate,
      scope: "country",
      countryIds: ["US"],
      regionIds: [],
      currentTurn: 10,
    });
    expect(inserted(db).v2.definitionId).toBe(legacyDefinitionId("recession"));
  });

  it("runs templates built at runtime on the generic definition, at their actual scope", async () => {
    const db = createMockDb();
    await createCrisisFromTemplate(db as unknown as Db, {
      template: {
        name: "Campaign event",
        description: "d",
        scope: "country",
        countryIds: [],
        regionIds: [],
        durationTurns: 6,
        effects: [],
        wireMessageOnStart: "s",
        wireMessageOnEnd: "e",
      },
      scope: "global",
      countryIds: [],
      regionIds: [],
      currentTurn: 5,
    });
    const crisis = inserted(db);
    expect(crisis.v2.definitionId).toBe(legacyDefinitionId("adhoc"));
    expect(crisis.v2.scope).toBe("global");
  });

  it("force-spawn passes the key so the crisis gets its own definition", async () => {
    const db = createMockDb();
    db.collection("crisisAutoCooldowns").find.mockReturnValue({
      toArray: async () => [],
    });
    const result = await forceSpawnCrisis(db as unknown as Db, "recession", 77, "US" as never);
    expect(result.ok).toBe(true);
    const crisis = inserted(db);
    expect(crisis.templateKey).toBe("recession");
    expect(crisis.v2.definitionId).toBe(legacyDefinitionId("recession"));
  });
});
