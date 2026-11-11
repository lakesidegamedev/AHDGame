import type { Db } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import type { Document } from "mongodb";

/**
 * Drop the retired `foreignPolicy` / `culture` party axes. Both were written
 * by party seeds, charter ratification, and the position-shift proposal, but
 * read by nothing, so the shift proposal could burn a committee vote and a
 * 336-turn cooldown on a number that affected nothing.
 *
 * Unsets the fields from `politicalParties`, its
 * `positionShiftCooldowns`, and `partyCharters.platform`.
 *
 * Deliberately does NOT touch `committeeProposals`: historical proposals on a
 * retired axis are a true record, they still render as "(retired)", and
 * `applyPositionShiftEffect` no-ops on them.
 *
 * Idempotent: `$unset` on an absent field is a no-op.
 */
async function run(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
  const notes: string[] = [];

  const partyFilter = {
    $or: [
      { foreignPolicy: { $exists: true } },
      { culture: { $exists: true } },
      { "positionShiftCooldowns.foreignPolicy": { $exists: true } },
      { "positionShiftCooldowns.culture": { $exists: true } },
    ],
  };
  const charterFilter = {
    $or: [
      { "platform.foreignPolicy": { $exists: true } },
      { "platform.culture": { $exists: true } },
    ],
  };

  const partiesToClean = await politicalPartiesCollection<Document>(db).countDocuments(partyFilter);
  const chartersToClean = await db.collection("partyCharters").countDocuments(charterFilter);
  const scanned = partiesToClean + chartersToClean;

  if (ctx.dryRun) {
    notes.push(
      `DRY RUN — would unset the retired axes on ${partiesToClean} parties and ${chartersToClean} charters`
    );
    return { documentsScanned: scanned, documentsUpdated: 0, notes };
  }

  const parties = await politicalPartiesCollection<Document>(db).updateMany(partyFilter, {
    $unset: {
      foreignPolicy: "",
      culture: "",
      "positionShiftCooldowns.foreignPolicy": "",
      "positionShiftCooldowns.culture": "",
    },
  });
  const charters = await db.collection("partyCharters").updateMany(charterFilter, {
    $unset: { "platform.foreignPolicy": "", "platform.culture": "" },
  });

  notes.push(`parties cleaned: ${parties.modifiedCount}`);
  notes.push(`charters cleaned: ${charters.modifiedCount}`);
  notes.push("committeeProposals left untouched — historical rows stay readable");

  return {
    documentsScanned: scanned,
    documentsUpdated: parties.modifiedCount + charters.modifiedCount,
    notes,
  };
}

export const migration: Migration = {
  id: "2026-08-11-drop-dead-party-axes",
  description:
    "Unset the retired foreignPolicy / culture axes from parties and charters (ticket #1032).",
  idempotent: true,
  execute: run,
};
