/**
 * Client-safe military model: unit archetypes, postures, tech and veterancy
 * multipliers, the power formula and the era gates.
 *
 * `military.ts` also carries every country's branch roster, cabinet seat and
 * force scale, which imports all of the country institution modules. Client
 * surfaces that only render a unit (strength, effective power, posture) import
 * this module instead, and `military.ts` re-exports it so server callers keep
 * their existing imports.
 */
import type { CountryId } from "@/lib/constants/countriesCore";
import type { MilitaryUnit, Posture, UnitDomain, UnitEquipment } from "@/lib/db/types/militaryUnit";

/** Fields an era gate reads; Branch and UnitArchetype both satisfy it. */
export interface MilitaryEraDef {
  establishedYear?: number;
  dissolvedYear?: number;
}

export interface UnitArchetype {
  type: string;
  icon: string;
  cost: number;
  upkeep: number;
  personnel: number;
  power: number;
  /** Optional era gate; same semantics as Branch.establishedYear. */
  establishedYear?: number;
  /** Optional era gate; same semantics as Branch.dissolvedYear. */
  dissolvedYear?: number;
}
export interface PostureDef {
  id: Posture;
  label: string;
  upkeepMult: number;
  powerMult: number;
}

export const POSTURES: PostureDef[] = [
  { id: "garrison", label: "Garrison", upkeepMult: 0.85, powerMult: 0.9 },
  { id: "standard", label: "Standard", upkeepMult: 1.0, powerMult: 1.0 },
  { id: "forward", label: "Forward-Deployed", upkeepMult: 1.25, powerMult: 1.12 },
  { id: "alert", label: "High Alert", upkeepMult: 1.5, powerMult: 1.22 },
];

export const TECH_TIERS = ["Legacy", "Standard", "Modernized", "Cutting-Edge"];
/** effective tech multiplier = 0.8 + tier*0.08 (tier 0..3 → 0.8..1.04) */
export function techPowerMult(tier: number): number {
  return 0.8 + tier * 0.08;
}

/**
 * What a tech tier does to a unit's running cost, index = techTier 0..3.
 *
 * Modernisation used to be pure upside: a tier bought +8% power and a political
 * `defenseIndustry` bump, cost nothing to buy, and cost nothing to keep, so the only
 * question was how fast a nation could click through it.
 *
 * Deliberately steeper than `techPowerMult`: Legacy → Cutting-Edge is ×1.30 power for
 * ×1.71 upkeep. A modern division is better than an old one and worse value than two of
 * them, which is the choice this is meant to create. Cheap legacy kit is a real option
 * for a nation that needs mass.
 */
export const TECH_UPKEEP_MULT = [0.85, 1.0, 1.2, 1.45];

/** Upkeep multiplier for a tier, defaulting a malformed tier to Standard (never free). */
export function techUpkeepMult(tier: number): number {
  return TECH_UPKEEP_MULT[tier] ?? 1;
}

/** Veterancy power multiplier, index = vet 0..4 (Green..Elite). Canonical home; combat.ts re-exports. */
export const VETM = [0.9, 1.0, 1.08, 1.16, 1.25];

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

export const UNIT_TYPES: Record<UnitDomain, UnitArchetype[]> = {
  ground: [
    {
      type: "Armored Division",
      icon: "tank",
      cost: 4200,
      upkeep: 180,
      personnel: 15000,
      power: 92,
    },
    {
      type: "Mechanized Brigade",
      icon: "tank",
      cost: 2100,
      upkeep: 95,
      personnel: 4500,
      power: 61,
    },
    {
      type: "Infantry Division",
      icon: "soldier",
      cost: 1600,
      upkeep: 70,
      personnel: 12000,
      power: 48,
    },
    {
      type: "Artillery Regiment",
      icon: "artillery",
      cost: 1300,
      upkeep: 55,
      personnel: 3000,
      power: 44,
    },
    {
      type: "Special Forces Group",
      icon: "soldier",
      cost: 2400,
      upkeep: 120,
      personnel: 1400,
      power: 78,
    },
    {
      type: "Air Defense Battalion",
      icon: "missile",
      cost: 1900,
      upkeep: 88,
      personnel: 900,
      power: 57,
    },
  ],
  naval: [
    {
      type: "Carrier Strike Group",
      icon: "carrier",
      cost: 13800,
      upkeep: 620,
      personnel: 7500,
      power: 99,
    },
    {
      type: "Guided-Missile Destroyer",
      icon: "ship",
      cost: 2200,
      upkeep: 110,
      personnel: 330,
      power: 64,
    },
    { type: "Attack Submarine", icon: "sub", cost: 3400, upkeep: 150, personnel: 130, power: 81 },
    { type: "Frigate Squadron", icon: "ship", cost: 1700, upkeep: 80, personnel: 600, power: 49 },
    {
      type: "Amphibious Group",
      icon: "carrier",
      cost: 4100,
      upkeep: 190,
      personnel: 2800,
      power: 70,
    },
  ],
  air: [
    { type: "Fighter Wing", icon: "jet", cost: 5600, upkeep: 250, personnel: 1800, power: 88 },
    { type: "Bomber Squadron", icon: "jet", cost: 4800, upkeep: 220, personnel: 900, power: 84 },
    {
      type: "Airlift Wing",
      icon: "transport",
      cost: 2300,
      upkeep: 100,
      personnel: 1500,
      power: 38,
    },
    {
      type: "Air Defense Wing",
      icon: "missile",
      cost: 2600,
      upkeep: 115,
      personnel: 1100,
      power: 66,
    },
    // MQ-1 Predator entered USAF service 1995 (USAF Historical Research Agency).
    {
      type: "Drone Command",
      icon: "drone",
      cost: 1900,
      upkeep: 70,
      personnel: 600,
      power: 59,
      establishedYear: 1995,
    },
  ],
  rocket: [
    {
      type: "Ballistic Missile Brigade",
      icon: "missile",
      cost: 6200,
      upkeep: 240,
      personnel: 1200,
      power: 95,
    },
    {
      type: "Cruise Missile Regiment",
      icon: "missile",
      cost: 3100,
      upkeep: 130,
      personnel: 800,
      power: 72,
    },
    {
      type: "Strategic Deterrent Force",
      icon: "missile",
      cost: 9800,
      upkeep: 410,
      personnel: 2000,
      power: 100,
    },
  ],
  // Space-domain archetypes only make sense alongside a space branch (USSF 2019 /
  // PLA SSF 2016). Gate at 2019 so a stray recruit path cannot invent them earlier.
  space: [
    {
      type: "Orbital Surveillance Delta",
      icon: "satellite",
      cost: 3800,
      upkeep: 160,
      personnel: 700,
      power: 74,
      establishedYear: 2019,
    },
    {
      type: "Launch Operations Delta",
      icon: "satellite",
      cost: 2900,
      upkeep: 120,
      personnel: 500,
      power: 52,
      establishedYear: 2019,
    },
    {
      type: "Space Defense Squadron",
      icon: "satellite",
      cost: 4400,
      upkeep: 190,
      personnel: 900,
      power: 80,
      establishedYear: 2019,
    },
  ],
  marine: [
    {
      type: "Marine Expeditionary Unit",
      icon: "soldier",
      cost: 3200,
      upkeep: 150,
      personnel: 2200,
      power: 76,
    },
    {
      type: "Marine Division",
      icon: "soldier",
      cost: 4600,
      upkeep: 210,
      personnel: 18000,
      power: 83,
    },
    {
      type: "Littoral Combat Team",
      icon: "ship",
      cost: 1800,
      upkeep: 85,
      personnel: 1100,
      power: 54,
    },
  ],
};

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

/**
 * Per-country force scale, shared with the defence budget and readiness math.
 * Authored literals rather than references to every country's institution
 * module, so client unit pricing does not import all of those documents. The
 * server-side `MILITARY_COUNTRY_SCALE` in `military.ts` is this same table.
 */
export const MILITARY_COUNTRY_SCALE: Record<CountryId, number> = {
  US: 2.6,
  CN: 2,
  JP: 1.4,
  UK: 1.7,
  DE: 1,
  IE: 1,
  BR: 1,
  NG: 0.85,
  HU: 0.9,
  PL: 1,
  RO: 0.9,
  YU: 0.95,
  BG: 0.85,
  // Union republics buy at all-Union prices, so no discount against RU's scale;
  // their force is small because the order of battle is small, not because
  // equipment is cheap.
  UKR: 1.1,
  BLR: 1,
  CS: 1,
  BAL: 1,
  RU: 2.4,
  FR: 1.5,
  IT: 1.2,
  ES: 1,
  SE: 1.1,
  TR: 1,
  GR: 0.9,
  AT: 0.85,
  FI: 0.9,
  DD: 1.2,
  SCO: 1,
  WAL: 1,
};

/** Defense cabinet position per country. */
