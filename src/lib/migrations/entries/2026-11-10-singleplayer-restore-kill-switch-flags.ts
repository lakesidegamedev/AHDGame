import type { Collection, Db } from "mongodb";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import type { Migration, MigrationResult } from "../types";

const FLAGS = ["eraSystemEnabled", "autoDisastersEnabled", "livingConflictsEnabled"] as const;

/**
 * The era, automatic disaster and living conflict switches did nothing until
 * they were restored as real kill switches. A local world created with one
 * unticked never relied on it, so turning it on again keeps eras and
 * conflicts running instead of silently stopping them.
 *
 * Singleplayer only. Idempotent: only a stored false is rewritten.
 */
export const migration: Migration = {
  id: "2026-11-10-singleplayer-restore-kill-switch-flags",
  description: "Turn the era, auto disaster and living conflict switches back on in local worlds",
  idempotent: true,
  async execute(db: Db, ctx): Promise<MigrationResult> {
    const state = await (
      (await getGameStateCollection(db)) as unknown as Collection<Record<string, unknown>>
    ).findOne(
      { _id: "current" as never },
      {
        projection: Object.fromEntries(
          FLAGS.flatMap((f) => [
            [f, 1],
            [`singleplayerConfig.featureFlags.${f}`, 1],
          ])
        ),
      }
    );
    if (!state) return { documentsScanned: 0, documentsUpdated: 0, notes: ["no world"] };
    const stored = (
      state.singleplayerConfig as { featureFlags?: Record<string, unknown> } | undefined
    )?.featureFlags;
    const set: Record<string, boolean> = {};
    for (const flag of FLAGS) {
      if (state[flag] === false) set[flag] = true;
      if (stored && stored[flag] === false) set[`singleplayerConfig.featureFlags.${flag}`] = true;
    }
    const keys = Object.keys(set);
    if (keys.length === 0)
      return { documentsScanned: 1, documentsUpdated: 0, notes: ["nothing was off"] };
    const notes = [`${ctx.dryRun ? "would turn" : "turned"} on: ${keys.join(", ")}`];
    if (ctx.dryRun) return { documentsScanned: 1, documentsUpdated: 0, notes };
    await (
      (await getGameStateCollection(db)) as unknown as Collection<Record<string, unknown>>
    ).updateOne({ _id: "current" as never }, { $set: set });
    return { documentsScanned: 1, documentsUpdated: 1, notes };
  },
};
