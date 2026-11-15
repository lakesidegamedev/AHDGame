/** Pure rules for militaryCore; the tables they read live in militaryCoreTables. */
import type { MilitaryUnit, Posture, UnitDomain, UnitEquipment } from "@/lib/db/types/militaryUnit";
import {
  POSTURES,
  TECH_TIERS,
  TECH_UPKEEP_MULT,
  UNIT_TYPES,
  VETM,
  type MilitaryEraDef,
  type PostureDef,
  type UnitArchetype,
} from "@/lib/constants/militaryCoreTables";

/**
 * Why a country cannot raise this archetype on research grounds, or null when it can.
 * `arsenalGrade` is the national arsenal's grade for the archetype's domain.
 */
export function archetypeResearchBlock(
  archetype: Pick<UnitArchetype, "type" | "requiredArsenalGrade">,
  arsenalGrade: number | null | undefined
): string | null {
  const need = archetype.requiredArsenalGrade;
  if (need == null || need <= 0) return null;
  if ((arsenalGrade ?? 0) >= need) return null;
  return (
    `${archetype.type} needs ${TECH_TIERS[need] ?? "advanced"} materiel in the national ` +
    `arsenal. Domestic defence industry must research and deliver it first.`
  );
}

/** effective tech multiplier = 0.8 + tier*0.08 (tier 0..3 → 0.8..1.04) */
export function techPowerMult(tier: number): number {
  return 0.8 + tier * 0.08;
}

/** Upkeep multiplier for a tier, defaulting a malformed tier to Standard (never free). */
export function techUpkeepMult(tier: number): number {
  return TECH_UPKEEP_MULT[tier] ?? 1;
}

/**
 * Average of a unit's three equipment tracks.
 *
 * Tolerates a missing or partial `equipment` (legacy/unmigrated units) so one
 * malformed unit degrades to zero rather than throwing, a data anomaly must not
 * take down the whole force-aggregation path (and with it the SecDef office).
 */
export function eqAvg(e?: Partial<UnitEquipment> | null): number {
  if (!e) return 0;
  return ((e.firepower ?? 0) + (e.protection ?? 0) + (e.support ?? 0)) / 3;
}

export function isMilitaryEraActive(
  def: MilitaryEraDef,
  liveYear: number | null | undefined
): boolean {
  if (liveYear == null) return true;
  if (def.establishedYear != null && liveYear < def.establishedYear) return false;
  if (def.dissolvedYear != null && liveYear >= def.dissolvedYear) return false;
  return true;
}

/** Unit archetypes for a domain, optionally filtered to those active in `liveYear`. */
export function getUnitTypesForYear(domain: UnitDomain, liveYear?: number | null): UnitArchetype[] {
  const all = UNIT_TYPES[domain] ?? [];
  if (liveYear == null) return all;
  return all.filter((t) => isMilitaryEraActive(t, liveYear));
}

export function getUnitArchetype(domain: UnitDomain, type: string): UnitArchetype | undefined {
  return UNIT_TYPES[domain]?.find((u) => u.type === type);
}

export function postureDef(p: Posture): PostureDef {
  return POSTURES.find((x) => x.id === p) ?? POSTURES[1];
}

/**
 * Strength (personnel ÷ archetype establishment), clamped 0..1. A unit at half
 * strength fights at half power.
 *
 * Optional by design: `personnel`/`domain`/`type` absent, or an unknown archetype -
 * means "assume full strength" (×1), never zero. Unmigrated or malformed units must
 * degrade gracefully rather than silently losing all combat power. An explicit
 * `personnel: 0` is a real zero.
 */
function strengthRatio(unit: Partial<Pick<MilitaryUnit, "personnel" | "domain" | "type">>): number {
  if (unit.personnel == null || !unit.domain || !unit.type) return 1;
  const establishment = getUnitArchetype(unit.domain, unit.type)?.personnel;
  if (!establishment || establishment <= 0) return 1;
  return Math.max(0, Math.min(1, unit.personnel / establishment));
}

export function computeEffectivePower(
  unit: Pick<MilitaryUnit, "basePower" | "posture" | "techTier" | "vet" | "equipment"> &
    Partial<Pick<MilitaryUnit, "personnel" | "domain" | "type">>
): number {
  return Math.round(
    unit.basePower *
      postureDef(unit.posture).powerMult *
      techPowerMult(unit.techTier) *
      VETM[unit.vet] *
      (1 + eqAvg(unit.equipment) * 0.03) *
      strengthRatio(unit)
  );
}
