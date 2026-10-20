/**
 * nppCorporateAttacks — autonomous NPP corporate aggression (NPP-autonomy V2.2).
 *
 * NPP-run corporations (spawned NPP corps and player-appointed caretaker CEOs)
 * don't just expand into unowned markets — they go on the offensive, launching
 * the same economic **sector attacks** a player corp can, capturing market share
 * from rival owned sectors. Targets are chosen **by rule** (best capture
 * opportunity in a market the attacker operates in) and may be NPP-owned or
 * player-owned alike — the attack is indifferent to who owns the defender, so a
 * player corp is a legitimate target exactly as another NPP corp is.
 *
 * Everything routes through the **same** cost/capture helpers as the player
 * attack path (`calculateAttackCostAnchor`, `calculateSplitMsCost`,
 * `fetchAttackerDefenderShares`, the dominance/underdog multipliers,
 * `ATTACK_OWNED_CONTESTED_FRACTION`) so an autonomous attack and a player attack
 * resolve identically — no bespoke "NPP damage" and no way to exceed the normal
 * mechanic. Aggression is bounded: only `aggressive`-archetype corps attack,
 * only with surplus cash + MS, and only once per `ATTACK_COOLDOWN_TURNS`.
 *
 * Gating: `nppAutonomyAtLeast(attacker.countryId, "v2")` — economic aggression is
 * the comingle-tier capability. A no-op below v2 / where autonomy is off.
 */

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Corporation, CorporateSector, State } from "@/lib/db/types";
import type { CorporationType } from "@/lib/constants/corporations";
import {
  ATTACK_OWNED_CONTESTED_FRACTION,
  DEFAULT_PROFIT_MARGIN,
  DEFAULT_SECTOR_STARTING_WORKERS,
  OPERATING_SECTOR_TYPE_LABELS,
  getDominanceAttackEaseMultiplier,
  getUnderdogAttackAmplifier,
} from "@/lib/constants/corporations";
import {
  calculateAttackCostAnchor,
  calculateSplitMsCost,
} from "@/lib/corporations/marketActionCosts";
import { fetchAttackerDefenderShares } from "@/lib/corporations/marketShare";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  fxRateForCorpFromMap,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { isCorporateSectorDuplicateKey } from "@/lib/corporations/sectorLocation";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { deriveCeoArchetype } from "./ceoArchetype";
import { logWireEvent, wireHeadlineSectorAttack } from "@/lib/wireEvent";
import { createNotification } from "@/lib/notifications";
import { nppAutonomyAtLeast } from "@/lib/nppAutonomy/featureFlag";
import {
  canAttackDefender,
  canNotifyPlayer,
  countRecentNppNotifications,
  NPP_NOTIFICATION_WINDOW_TURNS,
} from "@/lib/nppAutonomy/playerImpactBudget";
import type { NPP, NPPPersonality } from "@/lib/db/types/npp";
import { recordAuditBulk } from "@/lib/audit/recordAudit";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import { randomInt } from "node:crypto";
import { emitTx } from "@/lib/financialTxLog/emit";
import type { CountryId } from "@/lib/constants/countries";
import { calculatePlantSectorSplit } from "@/lib/corporations/plantSectorSplit";
import { attemptPlantSectorSplit } from "@/lib/corporations/commands/plantSectorSplitAttempt";

/** Turns between autonomous attacks by the same corp (telegraphed, not a barrage). */
export const ATTACK_COOLDOWN_TURNS = 24;
/** An attacker keeps at least this much MS in reserve after paying the MS cost. */
const ATTACK_MS_RESERVE = 5;
/** Skip targets whose capturable revenue is below this (anchor) — not worth it. */
const MIN_TARGET_REVENUE_ANCHOR = 50_000;

/** A rival sector the attacker could strike, with the defender it belongs to. */
export interface AttackCandidate {
  sector: Pick<
    CorporateSector,
    | "_id"
    | "stateId"
    | "sectorType"
    | "mediaDiscriminator"
    | "industryModel"
    | "countryId"
    | "revenue"
    | "capitalStock"
    | "capacityBookAnchor"
    | "plantCount"
    | "strategyId"
  >;
  defender: Pick<
    Corporation,
    | "_id"
    | "name"
    | "marketingStrength"
    | "rdScore"
    | "countryOwnerId"
    | "suspended"
    | "userId"
    | "ceoVacant"
  > &
    Parameters<typeof getCorpFxRate>[1];
  /**
   * What the target is worth taking, in ₳. Below plants this is the defender's
   * revenue normalised for cross-currency comparison; under plants it is the
   * capacity nameplate (see `attackCapacityBasisAnchor`), which is already ₳.
   */
  revenueAnchor: number;
}

/**
 * Pure target selection: pick the rival sector with the best expected capture
 * for `attackerMS`, skipping illegitimate targets (own corp, state-owned,
 * suspended, sub-threshold revenue). Score ≈ attacker MS share × capturable
 * revenue — a fast heuristic for ranking; the precise capture is computed at
 * execution. Owner-agnostic: a player-owned defender is ranked like any other.
 * Returns the chosen candidate, or null when none is worth attacking.
 */
export function selectAttackTarget(
  attackerId: ObjectId,
  attackerMS: number,
  candidates: AttackCandidate[]
): AttackCandidate | null {
  let best: AttackCandidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (c.defender._id.equals(attackerId)) continue; // never own sectors
    if (c.defender.countryOwnerId) continue; // never state-owned corps
    if (c.defender.suspended) continue; // never corps pending auction
    if (c.revenueAnchor < MIN_TARGET_REVENUE_ANCHOR) continue;
    const defenderMS = c.defender.marketingStrength ?? 0;
    const msSum = attackerMS + defenderMS;
    const attackerShare = msSum > 0 ? attackerMS / msSum : 1;
    const score = attackerShare * c.revenueAnchor;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface NppAttackResult {
  capturedAnchor: number;
  defenderName: string;
  sectorType: string;
}

/**
 * Defender-facing message for an autonomous revenue attack below plants
 * (suggestion #324). Names the attacking corp, the sector, and the state, and
 * says what the $ figure is. Pure, so notification copy can be pinned by unit
 * test. Plants-economy splits write their own copy in `executeNppPlantSplit`.
 */
export function formatNppSectorAttackDefenderMessage(args: {
  attackerName: string;
  capturedAnchor: number;
  sectorLabel: string;
  stateLabel: string;
}): string {
  const { attackerName, capturedAnchor, sectorLabel, stateLabel } = args;
  return (
    `${attackerName} captured $${capturedAnchor.toLocaleString()} of revenue from your ${sectorLabel} sector in ${stateLabel}.` +
    ` This is revenue moved to the attacker's sector, not profit or your sector's total value.`
  );
}

/**
 * Execute one autonomous sector attack, applying the identical cost/capture math
 * as the player route. Returns the captured amount (₳) or null when the attack
 * could not meaningfully proceed (too little capture). Assumes the caller has
 * already verified affordability + cooldown + gate.
 */
export async function executeNppSectorAttack(
  db: Db,
  args: {
    attacker: Corporation;
    targetSector: Pick<
      CorporateSector,
      | "_id"
      | "stateId"
      | "sectorType"
      | "countryId"
      | "revenue"
      | "capitalStock"
      | "capacityBookAnchor"
      | "strategyId"
      | "industryModel"
      | "mediaDiscriminator"
    >;
    defender: AttackCandidate["defender"];
    currentTurn: number;
    now: Date;
  }
): Promise<NppAttackResult | null> {
  const { attacker, targetSector, defender, currentTurn, now } = args;
  const attackerMS = attacker.marketingStrength ?? 0;
  const defenderMS = defender.marketingStrength ?? 0;
  const attackerFxRate = await getCorpFxRate(db, attacker);
  const defenderFxRate = await getCorpFxRate(db, defender);
  const attackerCurrencyCode = resolveCorpLiquidCurrencyCode(attacker);
  const defenderCurrencyCode = resolveCorpLiquidCurrencyCode(defender);

  // PLANTS-GATED: this revenue capture runs only below plants; under plants
  // `runNppCorporateAttacks` calls `executeNppPlantSplit` instead.
  const targetRevenueAnchor = readCorpEconomicAnchor(
    targetSector.revenue,
    defenderCurrencyCode,
    defenderFxRate
  );

  // Capture math — identical to the player attack-sector path.
  const { defenderSharePercent, attackerSharePercent } = await fetchAttackerDefenderShares(
    db,
    targetSector,
    defender,
    attacker._id
  );
  const dominanceMult = getDominanceAttackEaseMultiplier(defenderSharePercent);
  const underdogMult = getUnderdogAttackAmplifier(attackerSharePercent, defenderSharePercent);
  const contestedAmount =
    targetRevenueAnchor * ATTACK_OWNED_CONTESTED_FRACTION * dominanceMult * underdogMult;
  const msSum = attackerMS + defenderMS;
  const attackerShare = msSum > 0 ? attackerMS / msSum : 1;
  const actualCapture = Math.min(
    Math.round(contestedAmount * attackerShare),
    Math.max(0, Math.floor(targetRevenueAnchor) - 1)
  );
  if (actualCapture <= 0) return null;

  const attackCostAnchor = calculateAttackCostAnchor(targetRevenueAnchor);
  const msCost = calculateSplitMsCost(attacker.splitEscalation ?? 0);

  const captureInDefenderLocal = Math.round(
    writeCorpEconomicLocal(actualCapture, defenderCurrencyCode, defenderFxRate)
  );
  const captureInAttackerLocal = Math.round(
    writeCorpEconomicLocal(actualCapture, attackerCurrencyCode, attackerFxRate)
  );

  // Credit the attacker's matching sector (existing or new). Read BEFORE the
  // defender is written so the P5 basis transfer sees both sides' pre-attack state.
  const stateId = targetSector.stateId;
  const existing = await db.collection<CorporateSector>("corporateSectors").findOne({
    stateId,
    sectorType: targetSector.sectorType,
    industryModel: targetSector.industryModel ?? null,
    mediaDiscriminator: targetSector.mediaDiscriminator ?? null,
    corporationId: attacker._id,
  });

  // Reduce the defender's revenue.
  await db
    .collection<CorporateSector>("corporateSectors")
    .updateOne(
      { _id: targetSector._id },
      { $inc: { revenue: -captureInDefenderLocal }, $set: { updatedAt: now } }
    );

  if (existing) {
    await db
      .collection<CorporateSector>("corporateSectors")
      .updateOne(
        { _id: existing._id },
        { $inc: { revenue: captureInAttackerLocal }, $set: { updatedAt: now } }
      );
  } else {
    const newSector: Omit<CorporateSector, "_id"> = {
      corporationId: attacker._id,
      countryId: targetSector.countryId,
      stateId,
      sectorType: targetSector.sectorType as CorporationType,
      ...(targetSector.industryModel ? { industryModel: targetSector.industryModel } : {}),
      ...(targetSector.mediaDiscriminator
        ? { mediaDiscriminator: targetSector.mediaDiscriminator }
        : {}),
      targetGrowthRate: 0,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      revenue: captureInAttackerLocal,
      profitMargin: DEFAULT_PROFIT_MARGIN,
      workers: DEFAULT_SECTOR_STARTING_WORKERS,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db
        .collection<CorporateSector>("corporateSectors")
        .insertOne(newSector as CorporateSector);
    } catch (error) {
      if (isCorporateSectorDuplicateKey(error)) {
        await db.collection<CorporateSector>("corporateSectors").updateOne(
          {
            corporationId: attacker._id,
            stateId,
            sectorType: targetSector.sectorType,
            industryModel: targetSector.industryModel ?? null,
            mediaDiscriminator: targetSector.mediaDiscriminator ?? null,
          },
          { $inc: { revenue: captureInAttackerLocal }, $set: { updatedAt: now } }
        );
      } else {
        throw error;
      }
    }
  }

  // Deduct cost + MS, escalate, and stamp the attack cooldown on the attacker.
  const attackCostLocal = anchorToCorpLiquidCapital(attackCostAnchor, attacker, attackerFxRate);
  await db.collection<Corporation>("corporations").updateOne(
    { _id: attacker._id },
    {
      $inc: { liquidCapital: -attackCostLocal, marketingStrength: -msCost, splitEscalation: 1 },
      $set: { lastAutoAttackTurn: currentTurn, updatedAt: now },
    }
  );

  // Stamp the DEFENDER's cooldown too. The attacker-side stamp above bounds how
  // often one NPP corp attacks; it says nothing about how often a given corp is
  // attacked, so any number of NPP corps could converge on one player in the same
  // turn. This is the field that makes the shared defender cooldown possible.
  await db
    .collection<Corporation>("corporations")
    .updateOne({ _id: defender._id }, { $set: { lastAutoAttackedTurn: currentTurn } });

  const sectorLabel =
    OPERATING_SECTOR_TYPE_LABELS[targetSector.sectorType as CorporationType] ??
    targetSector.sectorType;

  // Wire headline (same surface as a player attack) so the action is visible.
  const stateName = await db
    .collection<State>("states")
    .findOne({ _id: stateId }, { projection: { name: 1 } });
  logWireEvent(
    "sector_attack",
    wireHeadlineSectorAttack(
      attacker.name,
      actualCapture,
      sectorLabel,
      defender.name,
      stateName?.name ?? stateId
    ),
    {}
  );

  // Notify a player defender — economic aggression should never be silent.
  // Budgeted, though: past a few in a window the notifications stop carrying
  // information the earlier ones didn't, and the wire headline above still
  // records every attack for anyone who goes looking.
  const notificationsSent = defender.userId
    ? await countRecentNppNotifications(
        db,
        defender.userId,
        ["corp_sector_attacked"],
        new Date(now.getTime() - NPP_NOTIFICATION_WINDOW_TURNS * 60 * 60 * 1000)
      )
    : 0;
  if (defender.userId && !defender.ceoVacant && canNotifyPlayer(notificationsSent)) {
    // Suggestion #324: name the sector AND the state, and say what the $ is.
    const captureMessage = formatNppSectorAttackDefenderMessage({
      attackerName: attacker.name,
      capturedAnchor: actualCapture,
      sectorLabel,
      stateLabel: stateName?.name ?? stateId,
    });
    await createNotification({
      userId: defender.userId,
      type: "corp_sector_attacked",
      title: "Sector Attacked",
      message: captureMessage,
      metadata: {
        attackerCorporationName: attacker.name,
        attackerCorporationId: attacker._id.toString(),
        sectorType: targetSector.sectorType,
        sectorLabel,
        stateId,
        stateName: stateName?.name ?? null,
        countryId: targetSector.countryId,
        revenueLost: actualCapture,
        captureKind: "revenue",
      },
    });
  }

  return { capturedAnchor: actualCapture, defenderName: defender.name, sectorType: sectorLabel };
}

/**
 * Plants-economy NPP attack: the same whole-plant split a player runs
 * (`attemptPlantSectorSplit`). MS sets the share, R&D the odds, plants move
 * intact on success, and the cash and MS are spent either way. Stamps both
 * cooldowns whenever the attempt resolves, won or lost.
 */
export async function executeNppPlantSplit(
  db: Db,
  args: {
    attacker: Corporation;
    targetSector: Pick<CorporateSector, "_id" | "stateId" | "sectorType" | "countryId">;
    defender: AttackCandidate["defender"];
    currentTurn: number;
    now: Date;
  }
): Promise<NppAttackResult | null> {
  const { attacker, targetSector, defender, currentTurn, now } = args;
  const attempt = await attemptPlantSectorSplit(db, {
    attacker,
    defender,
    targetSector,
    targetSectorId: targetSector._id,
    stateId: targetSector.stateId,
    countryId: targetSector.countryId as CountryId,
    currentTurn,
    attackerFxRate: await getCorpFxRate(db, attacker),
    attackerCurrencyCode: resolveCorpLiquidCurrencyCode(attacker),
    randomRoll: randomInt(0, 1_000_000_000) / 1_000_000_000,
  });
  if (!attempt.ok) return null;
  const result = attempt.resolution;

  // Same ledger row the player route books: the attacker's cash left with no
  // other counterparty.
  await emitTx(db, {
    type: "corp_sector_split_cost",
    turn: currentTurn,
    createdAt: now,
    subjectType: "corporation",
    subjectId: attacker._id,
    subjectName: attacker.name,
    countryId: targetSector.countryId,
    amount: -Math.abs(result.attackCostLocal),
    anchorAmount: -Math.abs(result.quote.cashCostAnchor),
    currencyCode: resolveCorpLiquidCurrencyCode(attacker) ?? "USD",
    counterpartyType: "system",
    counterpartyName: "Sector split campaign",
    meta: {
      targetSectorId: targetSector._id.toString(),
      defenderCorporationId: defender._id.toString(),
      plantsAtRisk: result.quote.plantsAtRisk,
      plantsTransferred: result.plantsTransferred,
      successProbability: result.quote.successProbability,
      randomRoll: result.randomRoll,
      succeeded: result.succeeded,
      autonomous: true,
    },
  }).catch(() => {});

  await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: attacker._id },
      { $set: { lastAutoAttackTurn: currentTurn, updatedAt: now } }
    );
  await db
    .collection<Corporation>("corporations")
    .updateOne({ _id: defender._id }, { $set: { lastAutoAttackedTurn: currentTurn } });

  const sectorLabel =
    OPERATING_SECTOR_TYPE_LABELS[targetSector.sectorType as CorporationType] ??
    targetSector.sectorType;
  const stateName =
    (
      await db
        .collection<State>("states")
        .findOne({ _id: targetSector.stateId }, { projection: { name: 1 } })
    )?.name ?? targetSector.stateId;
  const plantsWord = result.plantsTransferred === 1 ? "plant" : "plants";
  const outcomeText = result.succeeded
    ? `${attacker.name} seized ${result.plantsTransferred.toLocaleString("en-US")} whole ${plantsWord} (~$${Math.round(result.bookValueTransferredAnchor).toLocaleString("en-US")} book value) from ${defender.name}'s ${sectorLabel} sector in ${stateName}.`
    : `${attacker.name} failed to split ${defender.name}'s ${sectorLabel} sector in ${stateName}.`;
  logWireEvent("sector_attack", outcomeText, {});

  const notificationsSent = defender.userId
    ? await countRecentNppNotifications(
        db,
        defender.userId,
        ["corp_sector_attacked"],
        new Date(now.getTime() - NPP_NOTIFICATION_WINDOW_TURNS * 60 * 60 * 1000)
      )
    : 0;
  if (defender.userId && !defender.ceoVacant && canNotifyPlayer(notificationsSent)) {
    await createNotification({
      userId: defender.userId,
      type: "corp_sector_attacked",
      title: result.succeeded ? "Plants Seized" : "Sector Split Repelled",
      message: outcomeText,
      metadata: {
        attackerCorporationName: attacker.name,
        attackerCorporationId: attacker._id.toString(),
        sectorType: targetSector.sectorType,
        sectorLabel,
        stateId: targetSector.stateId,
        stateName,
        countryId: targetSector.countryId,
        plantsLost: result.plantsTransferred,
        bookValueTransferredAnchor: result.bookValueTransferredAnchor,
        captureKind: "capacity",
        splitSucceeded: result.succeeded,
      },
    });
  }

  return {
    capturedAnchor: Math.round(result.bookValueTransferredAnchor),
    defenderName: defender.name,
    sectorType: sectorLabel,
  };
}

/**
 * Whether an NPP-run corp is willing + able to attack this turn: aggressive
 * archetype, off cooldown, and holding surplus cash + MS above the attack cost.
 * Pure. `cost`/`ms` are the attack's ₳ cost and MS cost for the chosen target.
 */
export function canAttack(args: {
  personality: NPPPersonality | undefined;
  lastAutoAttackTurn: number | undefined;
  currentTurn: number;
  capitalAnchor: number;
  attackCostAnchor: number;
  marketingStrength: number;
  msCost: number;
}): boolean {
  const { personality, lastAutoAttackTurn, currentTurn, capitalAnchor, attackCostAnchor } = args;
  if (!personality) return false;
  if (deriveCeoArchetype(personality) !== "aggressive") return false;
  if (lastAutoAttackTurn != null && currentTurn - lastAutoAttackTurn < ATTACK_COOLDOWN_TURNS) {
    return false;
  }
  if (capitalAnchor < attackCostAnchor) return false;
  if (args.marketingStrength < args.msCost + ATTACK_MS_RESERVE) return false;
  return true;
}

/**
 * Turn phase: run autonomous NPP corporate attacks. For each NPP-run corp whose
 * country is at the comingle tier (v2), find the best rival sector in a market
 * it operates in and — if its archetype is aggressive, it is off cooldown, and
 * it can afford the strike — capture share from it. Returns the attack count.
 */
export async function runNppCorporateAttacks(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<number> {
  // Economic aggression is DECOUPLED from the political autonomy tier: raising
  // political autonomy (e.g. to v3 for government formation) must NOT also make
  // NPP corps launch sector attacks against owned player/NPP sectors. At the
  // current stage NPPs should only expand into UNOWNED market, so corporate
  // attacks require an explicit opt-in and are OFF by default. The per-attacker
  // nppAutonomyAtLeast(v2) gate still applies on top when enabled.
  const cfg = await db
    .collection("gameConfig")
    .findOne({ _id: "default" } as Record<string, unknown>, {
      projection: { nppCorporateAttacksEnabled: 1 },
    });
  if (
    (cfg as { nppCorporateAttacksEnabled?: boolean } | null)?.nppCorporateAttacksEnabled !== true
  ) {
    return 0;
  }

  const nppCorps = await db
    .collection<Corporation>("corporations")
    .find({ ceoType: "npp", suspended: { $ne: true } })
    .toArray();
  if (nppCorps.length === 0) return 0;

  // Hydrate CEO NPP personalities (archetype → aggression).
  const ceoIds = nppCorps.map((c) => c.ceoId).filter(Boolean);
  const npps = ceoIds.length
    ? await db
        .collection<NPP>("npps")
        .find({ _id: { $in: ceoIds } }, { projection: { personality: 1 } })
        .toArray()
    : [];
  const personalityByNpp = new Map(npps.map((n) => [n._id.toString(), n.personality]));

  // Batched candidate discovery — this used to do 3-4 sequential round-trips
  // PER attacking corp (own sectors, rival sectors, defenders, one FX lookup
  // per rival sector) plus a `nppAutonomyAtLeast` DB round-trip per attacker
  // regardless of country repetition. Fine at 8-country scale, but the exact
  // sequential-round-trip pattern that made indexFunds take 108s+ at ~10,700
  // NPPs (found and fixed earlier this session) — found while auditing
  // scalability toward a 30-50-country sim. Fixed by loading the shared,
  // globally-bounded data ONCE (FX rates, autonomy-per-country, all sectors,
  // all corps) instead of per-attacker.
  const fxByCurrency = await loadFxRatesByCurrency(db);

  // Market tier, read once for the whole pass: under plants every attack is a
  // whole-plant split.
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");

  const distinctCountries = [...new Set(nppCorps.map((c) => c.countryId))];
  const autonomyByCountry = new Map<string, boolean>();
  for (const countryId of distinctCountries) {
    autonomyByCountry.set(countryId, await nppAutonomyAtLeast(db, countryId, "v2"));
  }

  // Cheap in-memory filters first — only corps that pass ALL of them need
  // the expensive sector/defender lookups below.
  const eligibleAttackers = nppCorps.filter((attacker) => {
    if (!autonomyByCountry.get(attacker.countryId)) return false;
    const personality = personalityByNpp.get(attacker.ceoId?.toString() ?? "");
    if (!personality || deriveCeoArchetype(personality) !== "aggressive") return false;
    if (
      attacker.lastAutoAttackTurn != null &&
      currentTurn - attacker.lastAutoAttackTurn < ATTACK_COOLDOWN_TURNS
    ) {
      return false;
    }
    return true;
  });
  if (eligibleAttackers.length === 0) return 0;

  // All corporateSectors, once — grouped by owning corp (own-market lookup)
  // and by (stateId, sectorType) bucket (rival lookup), replacing the two
  // per-attacker queries above.
  // Attack targeting and execution use only the Pick<CorporateSector, ...>
  // contract below: owner/market identity plus the capacity and revenue basis.
  // Avoid decoding every plant and labor telemetry field while building the
  // two in-memory indexes.
  const allSectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      {},
      {
        projection: {
          _id: 1,
          corporationId: 1,
          countryId: 1,
          stateId: 1,
          sectorType: 1,
          revenue: 1,
          capitalStock: 1,
          capacityBookAnchor: 1,
          plantCount: 1,
          strategyId: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
        },
      }
    )
    .toArray();
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  const sectorsByMarket = new Map<string, CorporateSector[]>();
  for (const s of allSectors) {
    const corpKey = s.corporationId.toString();
    if (!sectorsByCorp.has(corpKey)) sectorsByCorp.set(corpKey, []);
    sectorsByCorp.get(corpKey)!.push(s);
    const marketKey = `${s.stateId}::${s.sectorType}::${s.industryModel ?? ""}::${s.mediaDiscriminator ?? ""}`;
    if (!sectorsByMarket.has(marketKey)) sectorsByMarket.set(marketKey, []);
    sectorsByMarket.get(marketKey)!.push(s);
  }

  // All corporations, once — defenders may be player-owned (not in nppCorps).
  const allCorps = await db.collection<Corporation>("corporations").find({}).toArray();
  const corpById = new Map(allCorps.map((c) => [c._id.toString(), c]));

  let attacks = 0;
  // Forensics/alt-detection audit spine (plan §3.1, T2.7): one entry per
  // executed attack (a defender corp's revenue is captured with nobody
  // having acted — the same "silent state change" concern as the
  // auto-restructure path). Bounded by `eligibleAttackers`, flushed with
  // ONE `recordAuditBulk` call after the loop — never per-attack DB writes.
  const actionAuditEntries: ActionAuditInput[] = [];
  // Defenders already hit in this pass — the persisted `lastAutoAttackedTurn`
  // cooldown can't see strikes that happen within the same run.
  const struckDefendersThisPass = new Set<string>();
  for (const attacker of eligibleAttackers) {
    const personality = personalityByNpp.get(attacker.ceoId!.toString())!;

    // Markets the attacker operates in (its own sectors' state+type).
    const ownSectors = sectorsByCorp.get(attacker._id.toString()) ?? [];
    if (ownSectors.length === 0) continue;
    const markets = ownSectors.map((s) => ({
      stateId: s.stateId,
      sectorType: s.sectorType,
      industryModel: s.industryModel ?? null,
      mediaDiscriminator: s.mediaDiscriminator ?? null,
    }));

    // Rival sectors in those markets.
    const rivalSectors: CorporateSector[] = [];
    for (const m of markets) {
      const bucket =
        sectorsByMarket.get(
          `${m.stateId}::${m.sectorType}::${m.industryModel ?? ""}::${m.mediaDiscriminator ?? ""}`
        ) ?? [];
      for (const s of bucket) {
        if (!s.corporationId.equals(attacker._id)) rivalSectors.push(s);
      }
    }
    if (rivalSectors.length === 0) continue;

    // Resolve each rival's defender corp + revenue (₳) into candidates.
    const candidates: AttackCandidate[] = [];
    for (const sector of rivalSectors) {
      const defender = corpById.get(sector.corporationId.toString());
      if (!defender) continue;
      // Plants: a split needs a whole-plant ledger with a plant to take and one
      // left for the defender.
      if (
        plantsEnabled &&
        (!Number.isInteger(sector.plantCount) ||
          (sector.plantCount ?? 0) < 2 ||
          typeof sector.capacityBookAnchor !== "number" ||
          !Number.isFinite(sector.capacityBookAnchor))
      ) {
        continue;
      }

      // Player-defender protection. A player-run corp is a legitimate target —
      // that principle is unchanged — but only on a shared cooldown, and never
      // twice in one pass. Being attacked is a threat to respond to; being
      // attacked from five directions before you can log in is just attrition.
      const defenderIsPlayerOwned = Boolean(defender.userId) && !defender.ceoVacant;
      if (struckDefendersThisPass.has(defender._id.toString())) continue;
      if (
        !canAttackDefender({
          defenderIsPlayerOwned,
          lastPlayerAttackedTurn: defender.lastAutoAttackedTurn,
          currentTurn,
        })
      ) {
        continue;
      }
      const fx = fxRateForCorpFromMap(defender, fxByCurrency);
      // Under plants, rank by the paid book value of the plants there to take
      // rather than by last turn's market fill; below plants, by revenue.
      const revenueAnchor = plantsEnabled
        ? (sector.capacityBookAnchor as number)
        : readCorpEconomicAnchor(sector.revenue, resolveCorpLiquidCurrencyCode(defender), fx);
      candidates.push({ sector, defender, revenueAnchor });
    }

    const target = selectAttackTarget(attacker._id, attacker.marketingStrength ?? 0, candidates);
    if (!target) continue;

    // Affordability against the chosen target's actual cost.
    const attackerFx = fxRateForCorpFromMap(attacker, fxByCurrency);
    const capitalAnchor = corpLiquidCapitalToAnchor(attacker.liquidCapital, attacker, attackerFx);
    const splitQuote = plantsEnabled
      ? calculatePlantSectorSplit({
          defenderPlantCount: target.sector.plantCount ?? 0,
          defenderBookValueAnchor: target.sector.capacityBookAnchor ?? 0,
          attackerMarketingStrength: attacker.marketingStrength ?? 0,
          defenderMarketingStrength: target.defender.marketingStrength ?? 0,
          attackerRdScore: attacker.rdScore ?? 0,
          defenderRdScore: target.defender.rdScore ?? 0,
        })
      : null;
    const attackCostAnchor =
      splitQuote?.cashCostAnchor ?? calculateAttackCostAnchor(target.revenueAnchor);
    const msCost =
      splitQuote?.marketingStrengthCost ?? calculateSplitMsCost(attacker.splitEscalation ?? 0);
    if (
      !canAttack({
        personality,
        lastAutoAttackTurn: attacker.lastAutoAttackTurn,
        currentTurn,
        capitalAnchor,
        attackCostAnchor,
        marketingStrength: attacker.marketingStrength ?? 0,
        msCost,
      })
    ) {
      continue;
    }

    const result = plantsEnabled
      ? await executeNppPlantSplit(db, {
          attacker,
          targetSector: target.sector,
          defender: target.defender,
          currentTurn,
          now,
        })
      : await executeNppSectorAttack(db, {
          attacker,
          targetSector: target.sector,
          defender: target.defender,
          currentTurn,
          now,
        });
    if (result) {
      attacks++;
      struckDefendersThisPass.add(target.defender._id.toString());
      console.log(
        `[nppAutonomy] ${attacker.name} attacked ${result.defenderName}'s ${result.sectorType} sector (captured ${result.capturedAnchor})`
      );
      actionAuditEntries.push({
        source: "turn",
        category: "corp",
        action: "npp.attack",
        phase: "nppCorporateAttacks",
        actor: { kind: "npp", name: attacker.name },
        subject: {
          type: "corporation",
          id: target.defender._id.toString(),
          name: result.defenderName,
        },
        counterparty: { type: "corporation", id: attacker._id.toString(), name: attacker.name },
        amount: result.capturedAnchor,
        outcome: "ok",
        turn: currentTurn,
        meta: { sectorType: result.sectorType },
      });
    }
  }

  if (actionAuditEntries.length > 0) {
    recordAuditBulk(actionAuditEntries);
  }

  return attacks;
}

/**
 * Turn-phase entry: fetch the db and run autonomous NPP corporate attacks. Thin
 * wrapper so the turn registry can call it like the other self-contained phases.
 */
export async function runNppCorporateAttacksPhase(now: Date, currentTurn: number): Promise<number> {
  const db = await getDb();
  return runNppCorporateAttacks(db, currentTurn, now);
}
