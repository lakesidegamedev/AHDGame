import type { Db, Document } from "mongodb";
import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { isPartyValidForPreset } from "@/lib/seeds/ensureDefaultParties";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { partyChartersCollection } from "@/lib/db/repositories/partyCharters";
import { partyResetUpdate } from "./rules/survivingParties";

/** The seed's values for the fields a surviving party takes from the seed. */
export function partySeedValues(seed: PartySeed, preset: string): Record<string, unknown> {
  return {
    name: seed.name,
    abbreviation: seed.abbreviation,
    color: seed.color,
    economicPosition: seed.economicPosition,
    socialPosition: seed.socialPosition,
    tier: resolveSeedPartyTier(seed, preset),
    regimeStatus: seed.regimeStatus,
    transactionApprovalMode: seed.transactionApprovalMode ?? "double",
    primaryCalendar: seed.primaryCalendar,
  };
}

/** The seed for a surviving party: the preset's own roster first, any era's roster by name second. */
export function findPartySeed(
  catalog: readonly PartySeed[],
  preset: string,
  countryId: string,
  name: string
): PartySeed | null {
  const named = catalog.filter((s) => s.countryId === countryId && s.name === name);
  return named.find((s) => isPartyValidForPreset(s, preset)) ?? named[0] ?? null;
}

/**
 * Returns every surviving default party to seed values and removes party charters.
 * Charters belong to the outgoing world's founders; a fresh world has none.
 */
export async function resetSurvivingPartiesToSeed(
  db: Db,
  preset: string,
  catalog: readonly PartySeed[]
): Promise<{ parties: number; unseeded: string[]; chartersRemoved: number }> {
  const parties = await politicalPartiesCollection<Document>(db)
    .find({ isDefault: true })
    .toArray();
  const unseeded: string[] = [];
  let changed = 0;
  for (const party of parties) {
    const seed = findPartySeed(catalog, preset, String(party.countryId), String(party.name));
    if (!seed) unseeded.push(`${party.countryId}:${party.name}`);
    const update = partyResetUpdate(party, seed ? partySeedValues(seed, preset) : party);
    if (Object.keys(update.set).length === 0 && update.unset.length === 0) continue;
    await politicalPartiesCollection<Document>(db).updateOne(
      { _id: party._id },
      {
        $set: { ...update.set, updatedAt: new Date() },
        ...(update.unset.length > 0
          ? { $unset: Object.fromEntries(update.unset.map((f) => [f, ""])) }
          : {}),
      }
    );
    changed++;
  }
  const charters = await partyChartersCollection<Document>(db).deleteMany({});
  return { parties: changed, unseeded, chartersRemoved: charters.deletedCount ?? 0 };
}
