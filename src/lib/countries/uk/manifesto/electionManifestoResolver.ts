import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ObjectId } from "mongodb";
import { listManifestosForElection } from "@/lib/db/collections/manifestos";
import { getPledgeCatalogEntry } from "@/lib/countries/uk/manifesto/pledgeCatalog";
import {
  buildManifestoMultipliers,
  type GroupLeanWithId,
} from "@/lib/countries/uk/manifesto/manifestoPopularity";
import { runtimeConfig } from "@/lib/config/runtime";

/**
 * Election-time bridge from locked manifestos to the vote engine's
 * `manifestoMultipliers` option.
 * Gated off by default: only produces multipliers when env
 * `UK_MANIFESTO_VOTE_EFFECT=1`; otherwise returns undefined and the engine uses 1.0.
 * The flag keeps the balance-sensitive coefficient off in prod until calibrated.
 * When off, the env check short-circuits BEFORE any DB read, so it is a no-op on
 * the hot vote-tally path.
 */
export function isManifestoVoteEffectEnabled(): boolean {
  return runtimeConfig.ukManifestoVoteEffect();
}

/** Minimal shape so this stays decoupled from the engine's concrete types. */
interface ElectorateUnitsLike {
  groups: Record<string, { economicLean: number; socialLean: number }>;
}

/** The per-unit lean list the multiplier builder needs, from the census electorate units. */
export function deriveGroupLeans(electorate: ElectorateUnitsLike): GroupLeanWithId[] {
  return Object.entries(electorate.groups).map(([id, unit]) => {
    if (!Number.isFinite(unit.economicLean) || !Number.isFinite(unit.socialLean)) {
      throw new Error(`Electorate unit ${id} has no lean`);
    }
    return { id, economicLean: unit.economicLean, socialLean: unit.socialLean };
  });
}

/**
 * Build the `manifestoMultipliers` map for an election, or `undefined` when the
 * feature is off / not applicable / no locked manifestos exist.
 */
export async function resolveElectionManifestoMultipliers(
  db: Db,
  args: {
    countryId: CountryId;
    electionId: ObjectId;
    isGeneralElection: boolean;
    groups: GroupLeanWithId[];
  }
): Promise<Record<string, Record<string, number>> | undefined> {
  if (!isManifestoVoteEffectEnabled()) return undefined;
  if (args.countryId !== "UK" || !args.isGeneralElection) return undefined;

  const manifestos = await listManifestosForElection(db, args.countryId, args.electionId);
  const pledgesByParty: Record<string, ReturnType<typeof getPledgeCatalogEntry>[]> = {};
  for (const m of manifestos) {
    if (!m.lockedAt) continue; // only locked manifestos count
    const entries = m.pledges
      .map((p) => getPledgeCatalogEntry(p.catalogEntryId))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    if (entries.length > 0) pledgesByParty[m.party] = entries;
  }
  if (Object.keys(pledgesByParty).length === 0) return undefined;

  return buildManifestoMultipliers(
    pledgesByParty as Record<string, NonNullable<ReturnType<typeof getPledgeCatalogEntry>>[]>,
    args.groups
  );
}
