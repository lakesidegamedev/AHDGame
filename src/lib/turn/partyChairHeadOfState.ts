/*
 * Ceremonial head-of-state sync for countries whose head of state is held by
 * the ruling party's chair by political convention.
 *
 * Selection is driven by `headOfStateSelection === "partyChairSync"`; the
 * office is whichever type carries `isHeadOfState`. Wiring a country is a
 * config change, not a code change.
 *
 * Does NOT touch `character.currentOffice`: the role is ceremonial and stacks
 * on the chair's primary office; the character page surfaces it via
 * `electedOfficials`.
 *
 * Idempotent: a no-op turn performs reads and zero writes.
 */
import { ObjectId, type Db } from "mongodb";
import type { ElectedOfficial, PoliticalParty } from "@/lib/db/types";
import {
  getCountryConfig,
  getHeadOfStateOfficeType,
  ALL_COUNTRY_IDS,
  type CountryId,
} from "@/lib/constants/countries";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";

export type ChairSyncAction =
  "noop" | "seated" | "replaced" | "vacated" | "skipped_no_ruling_party" | "skipped_no_office";

export interface ChairHeadOfStateResult {
  countryId: string;
  action: ChairSyncAction;
  seatedCharacterId?: ObjectId;
  vacatedCharacterId?: ObjectId;
}

/** Every country whose ceremonial head of state follows the ruling-party chair. */
export function partyChairSyncCountries(preset?: string): CountryId[] {
  return ALL_COUNTRY_IDS.filter(
    (id) => getCountryConfig(id, preset).headOfStateSelection === "partyChairSync"
  );
}

/**
 * The country's ruling party. Prefers the live `regimeStatus: "ruling"` label and
 * falls back to the seeded `rulingPartyId`, so a world whose parties predate the
 * label still resolves.
 */
async function findRulingParty(
  db: Db,
  countryId: CountryId,
  preset?: string
): Promise<PoliticalParty | null> {
  const coll = await getPoliticalPartiesCollection(db);
  const ruling = await coll.findOne({ countryId, regimeStatus: "ruling" });
  if (ruling) return ruling;
  const seeded = getCountryConfig(countryId, preset).rulingPartyId;
  if (seeded == null) return null;
  return coll.findOne({ countryId, sequentialId: seeded });
}

/**
 * Reconcile one country's head-of-state row against its ruling party's `chairId`.
 *
 *  - no head-of-state office in config → skipped (nothing to seat them in)
 *  - no ruling party → skipped (degenerate state)
 *  - chair null, nobody seated → no-op
 *  - chair null, someone seated → vacate
 *  - chair already seated → no-op
 *  - chair differs → replace
 */
export async function syncPartyChairHeadOfState(
  db: Db,
  countryId: CountryId,
  now: Date = new Date(),
  preset?: string
): Promise<ChairHeadOfStateResult> {
  const config = getCountryConfig(countryId, preset);
  if (config.headOfStateSelection !== "partyChairSync") {
    return { countryId, action: "skipped_no_office" };
  }
  const officeType = getHeadOfStateOfficeType(config);
  if (!officeType) return { countryId, action: "skipped_no_office" };

  const rulingParty = await findRulingParty(db, countryId, preset);
  if (!rulingParty) return { countryId, action: "skipped_no_ruling_party" };

  const officials = await getElectedOfficialsCollection(db);
  const currentRow = await officials.findOne({ countryId, officeType });
  const chairId = rulingParty.chairId ?? null;

  if (!chairId) {
    if (!currentRow) return { countryId, action: "noop" };
    await officials.deleteOne({ _id: currentRow._id });
    return {
      countryId,
      action: "vacated",
      vacatedCharacterId: currentRow.characterId ?? undefined,
    };
  }

  if (currentRow?.characterId && currentRow.characterId.equals(chairId)) {
    return { countryId, action: "noop" };
  }

  const insertDoc: ElectedOfficial = {
    _id: new ObjectId(),
    countryId,
    officeType,
    characterId: chairId,
    party: String(rulingParty.sequentialId),
    electedAt: now,
    seatsHeld: 1,
    createdAt: now,
    updatedAt: now,
  };

  if (currentRow) await officials.deleteOne({ _id: currentRow._id });
  await officials.insertOne(insertDoc);

  return {
    countryId,
    action: currentRow ? "replaced" : "seated",
    seatedCharacterId: chairId,
    vacatedCharacterId: currentRow?.characterId ?? undefined,
  };
}

/** Reconcile every chair-synced country. Called from the turn phase and bootstrap. */
export async function syncAllPartyChairHeadsOfState(
  db: Db,
  now: Date = new Date(),
  preset?: string
): Promise<ChairHeadOfStateResult[]> {
  const out: ChairHeadOfStateResult[] = [];
  for (const countryId of partyChairSyncCountries(preset)) {
    out.push(await syncPartyChairHeadOfState(db, countryId, now, preset));
  }
  return out;
}
