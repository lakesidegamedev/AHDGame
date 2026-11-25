import { WAR_EMERGENCY_CRISIS_TEMPLATES } from "@/lib/crises/warEmergencyCrises";
import { crisesCollection } from "@/lib/db/repositories/crises";
import type { Migration } from "../types";

export const migration: Migration = {
  id: "wartime-crisis-description",
  description: "Correct the fade duration in saved wartime crisis descriptions.",
  idempotent: true,
  async execute(db, ctx) {
    const crises = crisesCollection(db);
    const corrections = Object.entries(WAR_EMERGENCY_CRISIS_TEMPLATES).map(
      ([templateKey, template]) => ({
        filter: {
          templateKey,
          durationTurns: 24,
          description: template.description.replace("24 turns", "about 12 turns"),
        },
        update: { $set: { description: template.description } },
      })
    );
    if (ctx.dryRun) {
      const counts = await Promise.all(
        corrections.map(({ filter }) => crises.countDocuments(filter))
      );
      return {
        documentsScanned: counts.reduce((total, count) => total + count, 0),
        documentsUpdated: 0,
      };
    }

    const result = await crises.bulkWrite(corrections.map((updateMany) => ({ updateMany })));
    return { documentsScanned: result.matchedCount, documentsUpdated: result.modifiedCount };
  },
};
