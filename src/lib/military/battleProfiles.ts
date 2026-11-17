import type { NatMods } from "@/lib/military/doctrineTree";

import { type ProfileGeneral, generalMods } from "@/lib/military/generalsTree";
import {
  type ConflictAssignment,
  generalLeadingUnit,
  theaterCommanderOf,
} from "@/lib/military/assignments";
import { THEATER_COMMAND, OCCUPATION, FRONT_SUPPLY } from "@/lib/military/config";

import {
  type CombatUnit,
  type StatObj,
  type Front,
  combatValue,
  statObj,
  computeCard,
  terrainFactor,
  navalReach,
  getRole,
  roleDef,
  effUpkeep,
  frontById,
} from "@/lib/military/combat";

/**
 * The general↔units↔front binding used by battle math.
 *
 * `assignments` says where each general is and which units they lead there;
 * `generalsById` carries the authoritative profiles, resolved server-side from
 * characterGenerals. Client input never reaches this. Full profiles, not bare
 * `General`s: a general's modifiers come from the tree nodes they trained (`gtraits`).
 */
export interface GeneralBinding {
  assignments: ConflictAssignment[];
  generalsById: Record<string, ProfileGeneral>;
}

export interface BattleContext extends GeneralBinding {
  units: CombatUnit[];
  positions: Record<string, string>;
  natMods: NatMods;
  countryScale: number;
  /**
   * Which side of the conflict these forces fight on. Only naming reads it (see
   * `enemyFaction`); absent means the country could not be placed, and the enemy is
   * named generically. Replaced a `bloc` field, which asked a global question the
   * conflict already answers locally — and answered it wrong for most of the roster.
   */
  side?: "A" | "B";
  /**
   * The fronts in play, keyed by theaterId — built from the live conflicts a unit
   * can sit at (conflictToFront). The battle math resolves a unit's front from here
   * instead of a static table. Absent → homeland reserve is the only known front.
   */
  fronts?: Record<string, Front>;
  /**
   * This side's supply at the conflict being fought (ConflictDoc.supplyA/supplyB),
   * which occupation derives from how far the front has moved. Scales throughput in
   * supplyState. Absent = neutral, so every caller that predates occupation — and any
   * that cannot resolve which side a country is on — is unaffected.
   */
  conflictSupply?: number;
  /**
   * Logistics-command coverage keyed by strategic region, as effectiveness 0..1. What
   * it is worth depends on the demand it covers (see `supplyState`).
   */
  logisticsCoverageByRegion?: Record<string, number>;
}

export /**
 * The general commanding a unit, or null. Resolves through the unit's assigned
 * general, who commands only at the front they are posted to (and to which the
 * unit's reconciled theater follows them).
 */
function genForUnit(b: GeneralBinding, u: CombatUnit): ProfileGeneral | null {
  const gid = generalLeadingUnit(b.assignments, u.assignedGeneralId, u.theaterId);
  return gid ? (b.generalsById[gid] ?? null) : null;
}

export function generalOf(ctx: BattleContext, u: CombatUnit): ProfileGeneral | null {
  return genForUnit(ctx, u);
}

export function cv(ctx: BattleContext, u: CombatUnit): number {
  return combatValue(u, ctx.natMods, generalMods(generalOf(ctx, u)));
}

export interface AggItem {
  cv: number;
  s: StatObj;
  domain: string;
}

export interface SupplyState {
  level: number;
  state: { l: string; c: string };
  effMult: number;
  attrMult: number;
  demand: number;
  throughput: number;
}

/**
 * One side's supply at a front.
 *
 * Takes every contingent on the side: demand is per unit and must be costed under
 * its OWN nation's doctrine and scale, while throughput is a single pool the whole
 * coalition draws on. `natMods.supply` is a per-nation logistics doctrine added once
 * per side, so it is mass-weighted across contingents — summing it would hand a
 * five-ally coalition five times the bonus, and taking the first contingent's would
 * make the result depend on roster order.
 */
export function supplyState(
  ctxs: BattleContext[],
  frontId: string,
  plan?: EngagementPlan,
  /**
   * 0..1 of this side's throughput cut by ENEMY interdiction: bombers striking behind the
   * line, and a blockade closing the sea lane that feeds the front. Optional, so a caller
   * that predates the naval and air layer is unaffected.
   */
  interdiction = 0
): SupplyState {
  const front = frontById(frontId, ctxs[0]?.fronts);
  let demand = 0;
  let throughput = front.infra != null ? front.infra : 60;
  let depthCount = 0;
  let supportCount = 0;
  let formations = 0;
  const seenForm: Record<string, number> = {};
  let supplyMass = 0;
  let supplyWeighted = 0;
  let commandSupplyWeighted = 0;
  for (const ctx of ctxs) {
    const units = ctx.units.filter((u) => u.theaterId === frontId);
    // This contingent's own draw on the pool, which is what its Logistics command
    // covers. Per contingent, so one command per flag feeds its own formations and a
    // coalition cannot stack several into unlimited throughput.
    let contingentDemand = 0;
    for (const u of units) {
      const id = String(u._id);
      const role = plan?.roleOf.get(id) ?? getRole(ctx.positions, u);
      const tk = computeCard(u).traitKeys || [];
      // The PLAN is the authority on who is actually behind the line. Reading the
      // player's label instead let a side collect depot throughput for formations that
      // were standing in the line, which made perfect supply a matter of typing "rear"
      // enough times -- depth still engages at 0.10, so the label cost nothing.
      const inDepth = plan ? !plan.inContact.has(id) : role === "rear";
      // What this formation draws. Upkeep is a treasury figure, so an air wing or a
      // missile brigade costs like three divisions without eating like them at a land
      // front; and depth engages at 0.10, so it is not burning ammunition like the
      // line. Both shares are FRONT_SUPPLY, with the measurements that set them.
      let draw = effUpkeep(u, ctx.natMods, generalMods(generalOf(ctx, u)), ctx.countryScale) / 12;
      if (u.domain !== "ground" && u.domain !== "marine") draw *= FRONT_SUPPLY.offFrontDemand;
      // Plan-only. Without a plan `inDepth` is the player's own label, and a discount
      // read off the label is exactly the exploit the plan closed for the tail bonus.
      if (plan && inDepth) draw *= FRONT_SUPPLY.depthDemand;
      demand += draw;
      contingentDemand += draw;
      formations++;
      if (inDepth) depthCount++;
      else if (role === "support") supportCount++;
      if (tk.indexOf("logistics") >= 0) throughput += 22;
      if (u.domain === "air" && tk.indexOf("rapid") >= 0) throughput += 6;
      // A general's supply contribution counts once, not once per unit they lead.
      const gid = generalLeadingUnit(ctx.assignments, u.assignedGeneralId, u.theaterId);
      if (gid && !seenForm[gid]) {
        seenForm[gid] = 1;
        throughput += generalMods(generalOf(ctx, u)).supply;
      }
      supplyMass += 1;
      supplyWeighted += ctx.natMods.supply;
    }
    // A Logistics command over this region delivers a share of what its own contingent
    // draws, times its effectiveness. Sized by the force it feeds rather than a flat
    // figure, which was +20 against a coalition front's deficit of ~1,160. Entered
    // once per formation so the unit-weighted average below treats it exactly like the
    // national doctrine term.
    const coverage = ctx.logisticsCoverageByRegion?.[front.region] ?? 0;
    commandSupplyWeighted +=
      units.length * FRONT_SUPPLY.logisticsCommandShare * contingentDemand * coverage;
  }
  // Tooth to tail. Depth exists to feed the line, so it is counted only up to the size
  // of the line it feeds: a tail longer than its teeth is not logistics, it is parking.
  // Self-scaling, so it needs no constant of its own and grows with the war.
  const teeth = formations - depthCount;
  throughput += 34 * Math.min(depthCount, teeth) + 14 * supportCount;
  // Unit-weighted so allies cannot stack the bonus. With no units present there is
  // nothing to weight by, so fall back to the first contingent's own figure — which
  // is exactly what a single-country side did before contingents existed.
  throughput += supplyMass ? supplyWeighted / supplyMass : (ctxs[0]?.natMods.supply ?? 0);
  // A coalition cannot stack one Logistics command per flag into unlimited throughput.
  // Weight each contingent's regional coverage by the formations drawing on the pool,
  // exactly like the national doctrine contribution above.
  throughput += supplyMass ? commandSupplyWeighted / supplyMass : 0;
  // Territorial position: a side squeezed by a losing front hauls less through a
  // degraded theatre. Multiplicative rather than additive so a floored supply at a
  // low-infrastructure front cannot drive throughput negative. The figure is per
  // SIDE, so any contingent carries it; take the first that has one.
  const conflictSupply = ctxs.find((c) => c.conflictSupply != null)?.conflictSupply;
  if (conflictSupply != null) {
    throughput = Math.max(0, throughput) * (conflictSupply / OCCUPATION.supplyNeutral);
  }
  // Fighting at home: interior lines, depots and rail. The front carries which side
  // that is (`conflictToFront`); the contingent's own `side` says whether it is them.
  // Multiplicative, before interdiction, so a blockade still takes its share of a
  // larger haul rather than being the one thing the home advantage cancels.
  const hostSide = front.hostSide;
  if (hostSide && ctxs.some((c) => c.side === hostSide)) {
    throughput = Math.max(0, throughput) * FRONT_SUPPLY.hostSideThroughput;
  }
  demand = Math.max(1, Math.round(demand));
  throughput = Math.round(throughput);
  // Interdiction cuts what actually arrives, not what the front asks for. Applied here,
  // after every source of throughput is summed and before anything derives from it, so a
  // strangled front reads as short of supply through the SAME path as a front with poor
  // infrastructure, rather than through a second mechanism nobody would think to check.
  throughput *= 1 - Math.max(0, Math.min(1, interdiction));

  const level = Math.max(0, Math.min(100, Math.round((throughput / demand) * 100)));
  const state =
    level >= 85
      ? { l: "SUPPLIED", c: "#86d978" }
      : level >= 55
        ? { l: "STRAINED", c: "#d4af37" }
        : level >= 30
          ? { l: "SHORTAGE", c: "#f59e0b" }
          : { l: "CUT OFF", c: "#ef8a8a" };
  const effMult = 0.55 + 0.45 * (level / 100);
  const attrMult = 1 + (1 - level / 100) * 1.6;
  return { level, state, effMult, attrMult, demand, throughput };
}

/** A side's engaged aggregate + role buffs + supply at a front (own-perspective).
 *  Shared by the synthetic forecast and the real-vs-real resolver. No rng. */
export interface OwnSideProfile {
  engaged: AggItem[];
  combatMass: number;
  supportBuff: number;
  flankBuff: number;
  /** Front-wide multiplier from the Theater Commander in charge here. 1 when none. */
  tcBuff: number;
  reserveRes: number;
  rearShare: number;
  deepShare: number;
  /**
   * Mass-weighted `1 + natMods.deep` across contingents, so a coalition's deep-strike
   * doctrine reflects whoever actually brought the deep-strike units. 1 when nobody did.
   */
  deepBuff: number;
  genEnemyMin: number;
  /**
   * Each unit id at this front mapped to the rear/reserve shares of ITS OWN contingent.
   *
   * `sustain` used to be a single side-wide number applied to every unit's casualties,
   * so a coalition partner's rear echelon sheltered your frontline divisions. On the
   * German front that handed side B a flat ~25% casualty reduction across its whole line
   * because the Soviet air force was parked behind it, while side A got ~2.5% for having
   * two airlift wings. A nation's tail now protects that nation's own troops.
   */
  contingentSustain: Map<string, { rearShare: number; reserveRes: number }>;
  sup: SupplyState;
  ownTf: number;
}

export /**
 * The Theater Commander's front-wide command multiplier.
 *
 * A share of the cv edge their own training gives, applied once to the whole front —
 * so it scales with the TC's quality, never with force size, and is strictly weaker
 * than putting that general on the units directly.
 *
 * Reads flat `cv` only, deliberately: `cvTrait` bonuses are unit-specific expertise
 * (an armor specialist's edge with armour) and do not generalise to a whole front.
 * A TC trained purely into `cvTrait` paths therefore confers no command bonus — they
 * are a specialist, not a theater commander. That is intended, not a gap.
 */
function theaterCommandBuff(ctxs: BattleContext[], frontId: string): number {
  // A conflict designates at most one Theater Commander, but in a coalition it can
  // belong to any ally, so search every contingent for the one holding the billet.
  for (const ctx of ctxs) {
    const tc = theaterCommanderOf(ctx.assignments, frontId);
    if (!tc) continue;
    const g = ctx.generalsById[tc];
    if (g) return 1 + (generalMods(g).cv - 1) * THEATER_COMMAND.bonusShare;
  }
  return 1;
}

/**
 * One side's combat profile at a front, pooled across every contingent on that side.
 *
 * Each unit is still evaluated under its OWN nation's context — doctrine, scale and
 * generals — because `cv()` applies those per unit. That is what lets a coalition
 * fight as one army without any nation's doctrine leaking onto another's troops.
 */
/** Which formations stand in the line at a front, and which are held in depth. */
export interface EngagementPlan {
  inContact: Set<string>;
  /** unit id -> effective role, for the overflow only. Empty when the side fits. */
  roleOf: Map<string, string>;
}

export function ownSideProfile(
  ctxs: BattleContext[],
  frontId: string,
  plan?: EngagementPlan,
  /** Enemy interdiction against THIS side. See `supplyState`. */
  interdiction = 0
): OwnSideProfile {
  // Terrain is a property of the front, not of its id. Resolved once here off the
  // first context that knows this front — every contingent is fighting on the same
  // ground, so they must all be weighted by the same terrain.
  const front = frontById(frontId, ctxs.find((c) => c.fronts?.[frontId])?.fronts);
  let rawTot = 0,
    tfTot = 0,
    deepMass = 0,
    deepWeighted = 0;
  const roleMass: Record<string, number> = {
    frontline: 0,
    support: 0,
    reserve: 0,
    flank: 0,
    rear: 0,
    deepstrike: 0,
  };
  const engaged: AggItem[] = [];
  const seenG: Record<string, number> = {};
  let genEnemy = 1;

  // Per-contingent role mass, accumulated in the SAME pass and with the same terrain and
  // reach weighting as the side-wide totals, so a nation's own sustain is measured exactly
  // as the side's is rather than by a parallel formula that could drift.
  const perCtx: Array<{ roleMass: Record<string, number>; unitIds: string[] }> = [];

  for (const ctx of ctxs) {
    const own = {
      roleMass: {
        frontline: 0,
        support: 0,
        reserve: 0,
        flank: 0,
        rear: 0,
        deepstrike: 0,
      } as Record<string, number>,
      unitIds: [] as string[],
    };
    perCtx.push(own);
    for (const u of ctx.units.filter((x) => x.theaterId === frontId)) {
      const base = cv(ctx, u);
      const card = computeCard(u);
      const adj =
        base *
        terrainFactor(front, u.domain, card.traitKeys) *
        navalReach(front, u.domain, card.traitKeys);
      rawTot += base;
      tfTot += adj;
      const role = plan?.roleOf.get(String(u._id)) ?? getRole(ctx.positions, u);
      roleMass[role] += adj;
      own.roleMass[role] += adj;
      own.unitIds.push(String(u._id));
      engaged.push({ cv: adj * roleDef(role).engage, s: statObj(u), domain: u.domain });
      if (role === "deepstrike") {
        deepMass += adj;
        deepWeighted += adj * (1 + ctx.natMods.deep);
      }
      // Each general debuffs the enemy once for the whole coalition — not once per
      // unit, and not once per contingent they appear in.
      const gid = generalLeadingUnit(ctx.assignments, u.assignedGeneralId, u.theaterId);
      if (gid && !seenG[gid]) {
        seenG[gid] = 1;
        genEnemy = Math.min(genEnemy, generalMods(generalOf(ctx, u)).enemy);
      }
    }
  }

  const ownTf = rawTot ? tfTot / rawTot : 1;
  const totalMass = Object.keys(roleMass).reduce((a, k) => a + roleMass[k], 0);
  const share = (rl: string) => (totalMass ? Math.min(1, (roleMass[rl] / totalMass) * 2) : 0);

  const contingentSustain = new Map<string, { rearShare: number; reserveRes: number }>();
  for (const own of perCtx) {
    const tot = Object.keys(own.roleMass).reduce((a, k) => a + own.roleMass[k], 0);
    const ownShare = (rl: string) => (tot ? Math.min(1, (own.roleMass[rl] / tot) * 2) : 0);
    // One object per contingent, shared by reference across its units: the value is
    // identical for all of them and this keeps a large front's map cheap.
    const v = { rearShare: ownShare("rear"), reserveRes: ownShare("reserve") };
    for (const id of own.unitIds) contingentSustain.set(id, v);
  }

  return {
    engaged,
    combatMass: engaged.reduce((a, e) => a + e.cv, 0),
    supportBuff: 1 + 0.28 * share("support"),
    flankBuff: 1 + 0.16 * share("flank"),
    tcBuff: theaterCommandBuff(ctxs, frontId),
    reserveRes: share("reserve"),
    rearShare: share("rear"),
    deepShare: share("deepstrike"),
    deepBuff: deepMass ? deepWeighted / deepMass : 1,
    genEnemyMin: genEnemy,
    contingentSustain,
    sup: supplyState(ctxs, frontId, plan, interdiction),
    ownTf,
  };
}
