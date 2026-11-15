import type { Db } from "mongodb";
import { listCountryGenerals } from "@/lib/db/collections/characterGenerals";
import {
  getMilitaryCommands,
  getMilitaryCommandsCollection,
} from "@/lib/db/collections/militaryCommands";
import { reconcileCommandCommanders } from "@/lib/military/commands";
import type { Migration, MigrationResult } from "../types";

/**
 * Clear commanders who are no longer commissioned generals of their
 * command's country.
 *
 * A `commanderIds` entry is a CHARACTER id; a character can emigrate or be
 * dismissed without anything touching the saved command. The stale id cannot
 * draw a row (the count stands over an empty list), and the commands PUT
 * re-checks every id against the roster and 400s the WHOLE array, freezing
 * every later edit to any command in the country.
 *
 * Runtime heals this on load via `reconcileCommandCommanders`; this migration
 * just makes the fix immediate. Country-agnostic on purpose. Idempotent.
 */
async function dropOffRosterCommandCommanders(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const docs = await getMilitaryCommandsCollection(db)
    .find({}, { projection: { countryId: 1 } })
    .toArray();

  const notes: string[] = [];
  let updated = 0;

  for (const { countryId } of docs) {
    // Read through the getter, not the raw doc: it is what every reader and the
    // commands PUT already see, so the repair operates on the same commands the
    // route would validate rather than on a shape only storage knows about.
    const before = await getMilitaryCommands(db, countryId);
    if (before.length === 0) continue;

    // The single definition of "a valid commander", shared with the commands PUT,
    // the office's seed reconcile and requireCommandingGeneral.
    const roster = await listCountryGenerals(db, countryId);

    // Refuse to mass-strip on an empty roster. A country with no commissioned
    // generals is legitimate and every commanderId there IS invalid — but so is a
    // roster that came back empty for a reason this one-shot production write
    // cannot see, and the runtime reconcile heals the country on next load either
    // way. Skipping costs nothing; guessing wrong costs every commander in the
    // country.
    if (roster.length === 0) {
      const listed = before.reduce((n, c) => n + c.commanderIds.length, 0);
      if (listed > 0) {
        notes.push(`${countryId}: SKIPPED — roster empty but ${listed} commander(s) listed`);
      }
      continue;
    }

    const rosterIds = roster.map((general) => general.id);
    const after = reconcileCommandCommanders(before, rosterIds);
    // The helper returns the input array itself when nothing changed, so identity
    // is the check: no write for a country that was already clean.
    if (after.commands === before) continue;

    const changedNames = before
      .filter((command, i) => command !== after.commands[i])
      .map((command) => `${command.id} "${command.name}"`);
    notes.push(
      `${countryId}: ${dryRun ? "would drop" : "dropped"} ${after.removed} commander(s) across ${changedNames.join(", ")}`
    );

    if (!dryRun) {
      await getMilitaryCommandsCollection(db).updateOne(
        { countryId },
        { $set: { commands: after.commands } }
      );
    }
    updated += 1;
  }

  return {
    documentsScanned: docs.length,
    documentsUpdated: dryRun ? 0 : updated,
    notes: notes.length > 0 ? notes : ["no command listed an off-roster commander"],
  };
}

export const migration: Migration = {
  id: "2026-08-26-drop-off-roster-command-commanders",
  description:
    "Drop command commanders who are no longer commissioned generals of their country, which froze every command edit in RU and UK.",
  idempotent: true,
  execute: (db, ctx) => dropOffRosterCommandCommanders(db, ctx.dryRun),
};
