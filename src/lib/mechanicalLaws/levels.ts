/**
 * Read the enacted level of the mechanical laws. Both legislation systems
 * enact into `statePolicies` at the country's national pseudo-state, so one
 * query reads any number of laws and countries. A missing row means no bill
 * has passed: the law sits at its starting level.
 */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { NATIONAL_POLICY_STATE_IDS } from "@/lib/policy/nationalStateId";
import { getLaw } from "@/lib/politicalLegislation/catalog";
import { MECHANICAL_LAW_BASELINE, mechanicalLawId } from "./registry";
import {
  MECHANICAL_LAW_KEYS,
  clampMechanicalLevel,
  type MechanicalLawKey,
  type MechanicalLawLevel,
} from "./rules";

export type MechanicalLawLevels = Record<MechanicalLawKey, MechanicalLawLevel>;

function baselineFor(lawId: string, key: MechanicalLawKey): MechanicalLawLevel {
  // A new-generation competition law carries its own authored baseline.
  const law = getLaw(lawId);
  return law ? clampMechanicalLevel(law.baselineLevel ?? 0) : MECHANICAL_LAW_BASELINE[key];
}

/** Every mechanical law level for the given countries, in one query. */
export async function getMechanicalLawLevelsByCountry(
  db: Db,
  countryIds: readonly CountryId[]
): Promise<Map<CountryId, MechanicalLawLevels>> {
  const out = new Map<CountryId, MechanicalLawLevels>();
  const wanted: { countryId: CountryId; key: MechanicalLawKey; lawId: string; stateId: string }[] =
    [];
  for (const countryId of new Set(countryIds)) {
    const stateId = NATIONAL_POLICY_STATE_IDS[countryId];
    const levels = {
      competition: 0,
      subsidiaryLimits: 0,
      foreignInvestment: 0,
    } as MechanicalLawLevels;
    for (const key of MECHANICAL_LAW_KEYS) {
      const lawId = mechanicalLawId(countryId, key);
      if (!lawId || !stateId) continue;
      levels[key] = baselineFor(lawId, key);
      wanted.push({ countryId, key, lawId, stateId });
    }
    out.set(countryId, levels);
  }
  if (wanted.length === 0) return out;
  const rows = await db
    .collection<{ stateId: string; legislationTypeId: string; policyOptionIndex?: number }>(
      "statePolicies"
    )
    .find(
      {
        stateId: { $in: [...new Set(wanted.map((w) => w.stateId))] },
        legislationTypeId: { $in: [...new Set(wanted.map((w) => w.lawId))] },
      },
      { projection: { stateId: 1, legislationTypeId: 1, policyOptionIndex: 1 } }
    )
    .toArray();
  const byKey = new Map(rows.map((r) => [`${r.stateId}|${r.legislationTypeId}`, r]));
  for (const w of wanted) {
    const row = byKey.get(`${w.stateId}|${w.lawId}`);
    if (row && row.policyOptionIndex != null) {
      out.get(w.countryId)![w.key] = clampMechanicalLevel(row.policyOptionIndex);
    }
  }
  return out;
}

/** All three levels for one country, in one query. */
export async function getMechanicalLawLevels(
  db: Db,
  countryId: CountryId
): Promise<MechanicalLawLevels> {
  return (await getMechanicalLawLevelsByCountry(db, [countryId])).get(countryId)!;
}

/** One law's level for one country, in one query. */
export async function getMechanicalLawLevel(
  db: Db,
  countryId: CountryId,
  key: MechanicalLawKey
): Promise<MechanicalLawLevel> {
  return (await getMechanicalLawLevels(db, countryId))[key];
}
