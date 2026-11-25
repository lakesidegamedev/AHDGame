import { crisesCollection } from "@/lib/db/repositories/crises";
import type { Migration } from "../types";

const corrections = [
  {
    templateKey: "recession",
    before: "slip each turn, easing off over about 12 turns",
    after: "slip each turn, with the effects easing as the recession runs its course",
  },
  {
    templateKey: "tech_bubble_burst",
    before: "then unemployment rises while investor and consumer confidence fall for about 8 turns",
    after:
      "then unemployment rises while investor and consumer confidence fall, with those effects tapering over the crisis",
  },
  {
    templateKey: "heat_dome_emergency",
    before:
      "For about 4 turns growth falls from lost working hours, grid reliability drops and approval falls as people judge the response.",
    after:
      "Growth falls from lost working hours, grid reliability drops and approval falls as people judge the response. These effects taper over the emergency.",
  },
];

export const migration: Migration = {
  id: "crisis-fade-descriptions",
  description: "Remove stale effect durations from saved crisis descriptions.",
  idempotent: true,
  async execute(db, ctx) {
    const crises = crisesCollection(db);
    const repairs = corrections.map(({ templateKey, before, after }) => ({
      filter: { templateKey, description: { $regex: before.replace(/[.]/g, "\\.") } },
      update: [
        {
          $set: {
            description: {
              $replaceOne: { input: "$description", find: before, replacement: after },
            },
          },
        },
      ],
    }));
    if (ctx.dryRun) {
      const counts = await Promise.all(repairs.map(({ filter }) => crises.countDocuments(filter)));
      return {
        documentsScanned: counts.reduce((total, count) => total + count, 0),
        documentsUpdated: 0,
      };
    }
    const result = await crises.bulkWrite(repairs.map((updateMany) => ({ updateMany })));
    return { documentsScanned: result.matchedCount, documentsUpdated: result.modifiedCount };
  },
};
