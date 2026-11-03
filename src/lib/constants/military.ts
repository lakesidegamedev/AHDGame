import type { CountryId } from "./countries";
import type { UnitDomain, MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { JP_CABINET_SEAT_IDS, JP_MILITARY_BRANCHES } from "@/lib/countries/jp/institutionsFacts";
import { US_MILITARY_BRANCHES, US_CABINET_SEAT_IDS } from "@/lib/countries/us/institutionsFacts";
import { UK_MILITARY_BRANCHES, UK_CABINET_SEAT_IDS } from "@/lib/countries/uk/institutionsFacts";
import { DE_CABINET_SEAT_IDS, DE_MILITARY_BRANCHES } from "@/lib/countries/de/institutionsFacts";
import { CN_CABINET_SEAT_IDS, CN_MILITARY_BRANCHES } from "@/lib/countries/cn/institutionsFacts";
import { IE_CABINET_SEAT_IDS, IE_MILITARY_BRANCHES } from "@/lib/countries/ie/institutionsFacts";
import { RU_CABINET_SEAT_IDS, RU_MILITARY_BRANCHES } from "@/lib/countries/ru/institutionsFacts";
import { DD_CABINET_SEAT_IDS, DD_MILITARY_BRANCHES } from "@/lib/countries/dd/institutionsFacts";
import { NG_CABINET_SEAT_IDS, NG_MILITARY_BRANCHES } from "@/lib/countries/ng/institutionsFacts";
import { BR_CABINET_SEAT_IDS, BR_MILITARY_BRANCHES } from "@/lib/countries/br/institutionsFacts";
import { FR_CABINET_SEAT_IDS, FR_MILITARY_BRANCHES } from "@/lib/countries/fr/institutionsFacts";
import { IT_CABINET_SEAT_IDS, IT_MILITARY_BRANCHES } from "@/lib/countries/it/institutionsFacts";
import { ES_CABINET_SEAT_IDS, ES_MILITARY_BRANCHES } from "@/lib/countries/es/institutionsFacts";
import { SE_CABINET_SEAT_IDS, SE_MILITARY_BRANCHES } from "@/lib/countries/se/institutionsFacts";
import { TR_CABINET_SEAT_IDS, TR_MILITARY_BRANCHES } from "@/lib/countries/tr/institutionsFacts";
import { GR_CABINET_SEAT_IDS, GR_MILITARY_BRANCHES } from "@/lib/countries/gr/institutionsFacts";
import { AT_CABINET_SEAT_IDS, AT_MILITARY_BRANCHES } from "@/lib/countries/at/institutionsFacts";
import { FI_CABINET_SEAT_IDS, FI_MILITARY_BRANCHES } from "@/lib/countries/fi/institutionsFacts";
import { PL_CABINET_SEAT_IDS, PL_MILITARY_BRANCHES } from "@/lib/countries/pl/institutionsFacts";
import { HU_CABINET_SEAT_IDS, HU_MILITARY_BRANCHES } from "@/lib/countries/hu/institutionsFacts";
import { RO_CABINET_SEAT_IDS, RO_MILITARY_BRANCHES } from "@/lib/countries/ro/institutionsFacts";
import { YU_CABINET_SEAT_IDS, YU_MILITARY_BRANCHES } from "@/lib/countries/yu/institutionsFacts";
import { BG_CABINET_SEAT_IDS, BG_MILITARY_BRANCHES } from "@/lib/countries/bg/institutionsFacts";
import { CS_CABINET_SEAT_IDS, CS_MILITARY_BRANCHES } from "@/lib/countries/cs/institutionsFacts";
import { SCO_CABINET_SEAT_IDS, SCO_MILITARY_BRANCHES } from "@/lib/countries/sco/institutionsFacts";
import { WAL_CABINET_SEAT_IDS, WAL_MILITARY_BRANCHES } from "@/lib/countries/wal/institutionsFacts";
import { BLR_CABINET_SEAT_IDS, BLR_MILITARY_BRANCHES } from "@/lib/countries/blr/institutionsFacts";
import { UKR_CABINET_SEAT_IDS, UKR_MILITARY_BRANCHES } from "@/lib/countries/ukr/institutionsFacts";
import { BAL_CABINET_SEAT_IDS, BAL_MILITARY_BRANCHES } from "@/lib/countries/bal/institutionsFacts";

import {
  POSTURES,
  TECH_TIERS,
  TECH_UPKEEP_MULT,
  MILITARY_COUNTRY_SCALE,
  UNIT_TYPES,
  VETM,
  computeEffectivePower,
  eqAvg,
  getUnitArchetype,
  getUnitTypesForYear,
  isMilitaryEraActive,
  postureDef,
  techPowerMult,
  techUpkeepMult,
  type PostureDef,
  type UnitArchetype,
} from "./militaryCore";

export {
  MILITARY_COUNTRY_SCALE,
  POSTURES,
  TECH_TIERS,
  TECH_UPKEEP_MULT,
  UNIT_TYPES,
  VETM,
  computeEffectivePower,
  eqAvg,
  getUnitArchetype,
  getUnitTypesForYear,
  isMilitaryEraActive,
  postureDef,
  techPowerMult,
  techUpkeepMult,
};
export type { PostureDef, UnitArchetype };

export interface Branch {
  id: string;
  name: string;
  abbr: string;
  domain: UnitDomain;
  /**
   * Real-world year the branch stood up. A branch whose establishedYear is after
   * the game's starting year is not seeded (mirrors foundedYear on international
   * orgs). Optional so legacy callers and undated entries stay valid for every era.
   */
  establishedYear?: number;
  /**
   * First year the branch no longer exists (abolished / renamed into a successor).
   * When set, the branch is active only while liveYear < dissolvedYear.
   */
  dissolvedYear?: number;
}
export const MILITARY_BRANCHES_BY_COUNTRY: Record<CountryId, Branch[]> = {
  US: US_MILITARY_BRANCHES,
  CN: CN_MILITARY_BRANCHES,
  UK: UK_MILITARY_BRANCHES,
  // Bundeswehr: first volunteers sworn 12 Nov 1955 (bundeswehr.de). West Germany had
  // no armed forces in 1953 (demilitarized under occupation / Blank Office planning only),
  // so a 1953 world correctly seeds DE with zero branches — no invented predecessor.
  DE: DE_MILITARY_BRANCHES,
  JP: JP_MILITARY_BRANCHES,
  IE: IE_MILITARY_BRANCHES,
  BR: BR_MILITARY_BRANCHES,
  // Nigeria: Navy from the 1956 Nigerian Naval Force; Army on independence
  // (1 Oct 1960); Air Force established 1964.
  NG: NG_MILITARY_BRANCHES,
  HU: HU_MILITARY_BRANCHES,
  PL: PL_MILITARY_BRANCHES,
  RO: RO_MILITARY_BRANCHES,
  // Yugoslav People's Army — dissolved with the SFRY in 1992.
  YU: YU_MILITARY_BRANCHES,
  BG: BG_MILITARY_BRANCHES,
  // Union-republic forces. Constitutionally these existed: the February 1944
  // amendment gave each union republic its own People's Commissariat of Defence,
  // which is the legal fiction that put the Ukrainian and Byelorussian SSRs in
  // the UN as founding members. In practice the Soviet military districts did
  // the fighting, so the republican establishments here are deliberately small
  // relative to the satellites - these are garrison and territorial forces, not
  // national armies. Ukraine gets a navy (Odesa, Sevastopol, Mykolaiv) and
  // Byelorussia does not, because Byelorussia is landlocked.
  UKR: UKR_MILITARY_BRANCHES,
  BLR: BLR_MILITARY_BRANCHES,
  // Czechoslovakia dissolved 1 Jan 1993 — landlocked, no naval branch.
  CS: CS_MILITARY_BRANCHES,
  // The Baltic republics are one country here, so one set of branches. The naval
  // branch matters more than the ground branch: Tallinn, Riga and Liepaja were
  // the Baltic Fleet's home ports.
  BAL: BAL_MILITARY_BRANCHES,
  // ── Soviet Union / Russia ────────────────────────────────────────────────
  // Era-neutral service names: one row serves both a 1953 Soviet and a 2019
  // Russian game (Branch has no namesByYear). PVO Strany became a separate
  // service 1948; RVSN stood up 17 Dec 1959; Military Space Forces 1992.
  RU: RU_MILITARY_BRANCHES,
  FR: FR_MILITARY_BRANCHES,
  IT: IT_MILITARY_BRANCHES,
  ES: ES_MILITARY_BRANCHES,
  SE: SE_MILITARY_BRANCHES,
  TR: TR_MILITARY_BRANCHES,
  GR: GR_MILITARY_BRANCHES,
  // Bundesheer: re-established under the Austrian State Treaty, 1955. Landlocked.
  AT: AT_MILITARY_BRANCHES,
  FI: FI_MILITARY_BRANCHES,
  // Nationale Volksarmee: stood up 1 Mar 1956; dissolved with the GDR 3 Oct 1990.
  DD: DD_MILITARY_BRANCHES,
  SCO: SCO_MILITARY_BRANCHES,
  WAL: WAL_MILITARY_BRANCHES,
};

/**
 * Per-country COST scale — applied to both unit upkeep and acquisition price so
 * the two stay symmetric. NOT a force-SIZE knob: roster size comes from the
 * authored order of battle. (Ported from prototype: US 2.6, CN 2.0, JP 1.4.)
 */
export const DEFENSE_POSITION_BY_COUNTRY: Record<CountryId, string | null> = {
  US: US_CABINET_SEAT_IDS.defense,
  UK: UK_CABINET_SEAT_IDS.defense,
  CN: CN_CABINET_SEAT_IDS.defense,
  DE: DE_CABINET_SEAT_IDS.defense,
  JP: JP_CABINET_SEAT_IDS.defense,
  IE: IE_CABINET_SEAT_IDS.defense,
  BR: BR_CABINET_SEAT_IDS.defense,
  NG: NG_CABINET_SEAT_IDS.defense,
  HU: HU_CABINET_SEAT_IDS.defense,
  PL: PL_CABINET_SEAT_IDS.defense,
  RO: RO_CABINET_SEAT_IDS.defense,
  YU: YU_CABINET_SEAT_IDS.defense,
  BG: BG_CABINET_SEAT_IDS.defense,
  // Republican defence commissariats/ministries existed on paper from 1944 (see
  // MILITARY_BRANCHES_BY_COUNTRY), so the post is real even though the Soviet
  // General Staff held the actual command authority.
  UKR: UKR_CABINET_SEAT_IDS.defense,
  BLR: BLR_CABINET_SEAT_IDS.defense,
  CS: CS_CABINET_SEAT_IDS.defense,
  BAL: BAL_CABINET_SEAT_IDS.defense,
  RU: RU_CABINET_SEAT_IDS.defense,
  FR: FR_CABINET_SEAT_IDS.defense,
  IT: IT_CABINET_SEAT_IDS.defense,
  ES: ES_CABINET_SEAT_IDS.defense,
  SE: SE_CABINET_SEAT_IDS.defense,
  TR: TR_CABINET_SEAT_IDS.defense,
  GR: GR_CABINET_SEAT_IDS.defense,
  AT: AT_CABINET_SEAT_IDS.defense,
  FI: FI_CABINET_SEAT_IDS.defense,
  DD: DD_CABINET_SEAT_IDS.defense,
  SCO: SCO_CABINET_SEAT_IDS.defense,
  WAL: WAL_CABINET_SEAT_IDS.defense,
};

/** National readiness tier → global force modifier. */
export const TIER_FORCE_MODIFIER: Record<string, { readinessMult: number; upkeepMult: number }> = {
  reduced: { readinessMult: 0.9, upkeepMult: 0.85 },
  standard: { readinessMult: 1.0, upkeepMult: 1.0 },
  elevated: { readinessMult: 1.1, upkeepMult: 1.25 },
};

export const DEFENSE_ENVELOPE_FALLBACK_GDP_FRACTION = 0.03;

/**
 * Whether a branch (or unit archetype) exists at `liveYear`. Undated entries are
 * always active. Matches international-org founding: active iff
 * establishedYear <= liveYear < dissolvedYear (dissolvedYear exclusive).
 */
/**
 * Branches for a country. With `liveYear`, applies established/dissolved gates.
 * Without a year (UI / legacy callers), omits dissolved predecessors so the
 * default view matches the modern catalog (e.g. JSDF, not 1952–54 NSF).
 */
export function getBranches(countryId: string, liveYear?: number | null): Branch[] {
  const all = MILITARY_BRANCHES_BY_COUNTRY[countryId as CountryId] ?? [];
  if (liveYear == null) {
    return all.filter((b) => b.dissolvedYear == null);
  }
  return all.filter((b) => isMilitaryEraActive(b, liveYear));
}

/**
 * A unit's running cost.
 *
 * `tier` is the country's FORCE tier setting (standard/elevated/...), not the unit's
 * tech tier — they are different axes and both apply.
 */
export function computeEffectiveUpkeep(
  unit: Pick<MilitaryUnit, "upkeepBase" | "posture" | "techTier">,
  countryId: string,
  tier: string | null
): number {
  const scale = MILITARY_COUNTRY_SCALE[countryId as CountryId] ?? 1;
  const tierMult = TIER_FORCE_MODIFIER[tier ?? "standard"]?.upkeepMult ?? 1;
  return Math.round(
    unit.upkeepBase *
      postureDef(unit.posture).upkeepMult *
      scale *
      tierMult *
      techUpkeepMult(unit.techTier)
  );
}

export interface ForceAggregate {
  unitCount: number;
  totalPower: number;
  totalPersonnel: number;
  totalUpkeep: number;
  avgReadiness: number;
  forwardShare: number; // fraction of units in forward/alert
}

/**
 * Roll a country's units into the force totals the Defense seat and the appropriation
 * sweep both read.
 *
 * `tier` is the department-wide readiness setting and reaches ONLY upkeep here. It used to
 * also scale `avgReadiness` in this aggregate, which was the whole of what the setting did
 * (ticket #1140): the multiplier never touched a stored unit, so the player saw an unchanged
 * roster and a 25% larger bill. The tier now moves the readiness baseline units drift toward
 * (`readinessBaselineOf`), so re-scaling it here would count it a second time.
 */
export function aggregateForce(
  units: MilitaryUnit[],
  countryId: string,
  tier: string | null
): ForceAggregate {
  if (units.length === 0) {
    return {
      unitCount: 0,
      totalPower: 0,
      totalPersonnel: 0,
      totalUpkeep: 0,
      avgReadiness: 0,
      forwardShare: 0,
    };
  }
  let totalPower = 0;
  let totalPersonnel = 0;
  let totalUpkeep = 0;
  let readinessSum = 0;
  let forward = 0;
  for (const unit of units) {
    totalPower += computeEffectivePower(unit);
    totalPersonnel += unit.personnel;
    totalUpkeep += computeEffectiveUpkeep(unit, countryId, tier);
    readinessSum += unit.readiness;
    if (unit.posture === "forward" || unit.posture === "alert") forward++;
  }
  return {
    unitCount: units.length,
    totalPower,
    totalPersonnel,
    totalUpkeep,
    avgReadiness: Math.round(readinessSum / units.length),
    forwardShare: forward / units.length,
  };
}

/**
 * Force → metric effect coefficients. These are STANDING per-turn deltas applied
 * through the capped cabinet-effect pipeline (×CABINET_EFFECT_STRENGTH 1.25, then
 * clamped to ±MAX_PER_METRIC_MODIFIER_PER_TURN 0.08). Calibrated so a typical
 * seeded force (~1200–1800 combat power, ~70% readiness) contributes ~+0.035 to
 * publicSafetyConfidence and ±~0.05 to budgetBalance — in the same range as the
 * tier/regional standing effects — with only the strongest forces approaching the
 * cap. Re-confirm against live seeded budgets if magnitudes feel off.
 */
export const FORCE_EFFECT = {
  /** publicSafetyConfidence per "normalized power" point (power/POWER_NORM). */
  powerWeight: 0.02,
  // W1 (2026-07-14): after veterancy+equipment entered effPower, seeded-force totalPower rose
  // only ~5% (US) / ~9% (CN), shifting publicSafetyConfidence by ~+0.0006 (both ~0.037, mid-band).
  // POWER_NORM kept at 1500 by decision — vet/equipment now legitimately count as a small buff.
  //
  // RE-NORMALISED 1500 -> 2900 when the great powers got authored orders of battle. 1500 was
  // calibrated against a roster distribution that was largely an artifact: US/UK/DE/JP/IE/CN had
  // no authored composition and drew 3-5 random units per branch, so the US seeded 767 power
  // against RU's 3,025. Authoring them roughly quadrupled the US force and doubled China's, and
  // at 1500 that pinned four countries at MAX_PER_METRIC_MODIFIER_PER_TURN (0.08), where the
  // metric has no gradient at all and growing or cutting the army does nothing.
  //
  // 2900 is the largest-force fit: swept over every country x era, the strongest seeded force
  // (2023 US, 4,744 power) now lands at 0.0582 and nothing exceeds 0.06. The weak end is
  // unchanged, because a 4-unit force's contribution is carried by the readiness term either way
  // (1953 Finland: 0.0163 at 1500, 0.0142 at 2900). Locked by militaryForceEffects.test.ts.
  POWER_NORM: 2900,
  /** publicSafetyConfidence per readiness point above baseline. */
  readinessWeight: 0.0015,
  readinessBaseline: 60,
  /**
   * budgetBalance per unit of `1 - upkeepBurden` (clamped ±1) — the force measured against
   * the country's own seeded roster. At a seeded force the gap is +0.45, so this contributes
   * +0.0225. The dial to reach for if the metric moves too much or too little.
   */
  budgetWeight: 0.05,
  /** publicTrust / socialCohesion tilt at 100% forward/alert share. */
  forwardTrust: 0.02,
  forwardCohesion: -0.02,
};
