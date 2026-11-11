import type { Db } from "mongodb";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { ObjectId } from "mongodb";
import type { AnyBulkWriteOperation } from "mongodb";
import type { Character, CorporateSector, State, Union, User } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { UnionOrganizer } from "@/lib/db/types/union";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { UNION_STRENGTH_DECAY_PER_TURN } from "@/lib/unions/unionEconomy";
import {
  approvalTarget,
  averageAnnualWage,
  duesIncomePerTurn,
  maxDuesForWage,
  servicesCostPerTurn,
  trendApproval,
  unionApproval,
  unionMembers,
} from "@/lib/unions/unionDues";
import { fundedUnionServices, paidUnionServices, purchaseUnionServices } from "@/lib/unions/rules";
import { normalizeServiceIds } from "@/lib/unions/unionServices";
import {
  clampPoliticalContributionPct,
  distributePoliticalContributions,
  freeCashFlowPerTurn,
  politicalContributionPerTurn,
} from "@/lib/unions/unionPoliticalContributions";
import { isLabourFullMode } from "@/lib/labour/featureFlag";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { seedUnions } from "@/lib/admin/seed/seedUnions";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { INACTIVE_CEO_TURN_THRESHOLD } from "@/lib/turn/corporation/inactiveCeoSectorShed";
import { MS_PER_TURN } from "@/lib/constants/turnTime";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { processUndergroundTurn } from "./undergroundTurn";
import { processCrackdownLabourApprovalTurn } from "@/lib/unions/crackdownLabourApproval";
import { getBannedUnionCountryIds } from "@/lib/labour/unionLaws";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { processLabourRelationsTurn } from "./labourRelationsTurn";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";

export interface UnionsTurnResult {
  unionsProcessed: number;
  vacatedForInactivity: number;
  /** Sectors handed to their industry's seeded union this turn (see `adoptUnrepresentedSectors`). */
  sectorsAdopted: number;
  campaignsMovedToDispute: number;
  agreementsExpired: number;
  mediationsExpired: number;
}

/**
 * Adopt every unrepresented sector into the seeded union for its
 * (countryId, sectorType) and return how many were adopted.
 *
 * Runs in the turn rather than as a one-shot migration because sectors are
 * created in several places that know nothing about unions.
 *
 * Only NPC seeded unions adopt (foundedByCharacterId null and not
 * player-led); a player-claimed union must organize new shops itself. A
 * sector already pointing at a union is never touched.
 */
export async function adoptUnrepresentedSectors(db: Db): Promise<number> {
  const unrepresented = await db
    .collection<CorporateSector>("corporateSectors")
    .find({ representingUnionId: null }, { projection: { _id: 1, countryId: 1, sectorType: 1 } })
    .toArray();
  if (unrepresented.length === 0) return 0;

  const seededUnions = await db
    .collection<Union>("unions")
    .find(
      // Seeded roster only. Vacant (`ownerId: null`) and NPP-led still adopt;
      // a player-claimed seeded union must organize new shops itself.
      {
        foundedByCharacterId: null,
        $or: [{ ownerId: null }, { ownerType: "npp" }],
      },
      { projection: { _id: 1, countryId: 1, sectorType: 1 } }
    )
    .toArray();
  const seededByKey = new Map(seededUnions.map((u) => [`${u.countryId}|${u.sectorType}`, u._id]));

  const now = new Date();
  const ops = [];
  for (const sector of unrepresented) {
    const unionId = seededByKey.get(`${sector.countryId}|${sector.sectorType}`);
    // No seeded union for this industry (a country the roster never covered)
    // leaves the sector unrepresented rather than inventing a union for it.
    if (!unionId) continue;
    ops.push({
      updateOne: {
        filter: { _id: sector._id, representingUnionId: null },
        update: { $set: { representingUnionId: unionId, updatedAt: now } },
      },
    });
  }
  if (ops.length === 0) return 0;
  const result = await db.collection<CorporateSector>("corporateSectors").bulkWrite(ops);
  return result.modifiedCount ?? 0;
}

/**
 * Union dues v1 turn-processing pass, for every OWNED, non-suspended union:
 * resolve represented sectors (`CorporateSector.representingUnionId`), derive `members`
 * and member-weighted `averageAnnualWage`, credit `duesIncomePerTurn`, debit
 * `servicesCostPerTurn`, debit political contributions (share of free cash flow to
 * organizers by influence), and trend `approval` toward `approvalTarget`.
 * Unowned unions are skipped entirely so Phase 5's NPC drift stays untouched.
 *
 * The service bill NEVER pushes the treasury negative: if this turn's dues cannot cover it,
 * next turn's services lapse without charge. Approval and other service effects use this
 * turn's prepaid receipt, not the next purchase.
 *
 * Also auto-vacates leadership for leaders inactive beyond `INACTIVE_CEO_TURN_THRESHOLD`,
 * mirroring `inactiveCeoSectorShed.ts` (uses `User.lastActivity`/`createdAt`). A vacated
 * union is excluded from this turn's processing.
 *
 * Gated on `labourSystemMode >= "full"`; when disabled, union state is frozen.
 *
 * Registered immediately after `"corporationTurn"` and reads sector state that phase
 * writes this same turn.
 */

export async function processUnionsTurn(db: Db, turn?: number): Promise<UnionsTurnResult> {
  if (!(await isLabourFullMode())) {
    return {
      unionsProcessed: 0,
      vacatedForInactivity: 0,
      sectorsAdopted: 0,
      campaignsMovedToDispute: 0,
      agreementsExpired: 0,
      mediationsExpired: 0,
    };
  }

  const currentTurn = turn ?? (await getCurrentTurn(db));
  await processCrackdownLabourApprovalTurn(db, currentTurn);
  const labourRelations = await processLabourRelationsTurn(db, currentTurn);

  // Safety net: at "full" the roster must be COMPLETE, one union per
  // (country, sectorType) for every seeded country (unions are only ever
  // created by seedUnions: bootstrap, the admin seed target, or the
  // labour-config flip into "full"). A count below that expected total means
  // the roster was never seeded OR was only partially seeded, e.g. a swallowed
  // error in the labour-flip's auto-seed, or a lone stray doc from an early
  // partial seed (the exact state the 1953 sandbox was stuck in: 1 of 391).
  // Backfill with the idempotent reset:false upsert; `$setOnInsert` fills the
  // missing slots and preserves every existing (possibly claimed) union.
  // Comparing against the expected total, not just 0, is what heals a partial
  // roster, a single stray doc must never permanently block the backfill.
  const unionCount = await db.collection<Union>("unions").countDocuments({});
  const preset = await getGameStatePresetOrDefault(db);
  // Same country set seedUnions writes: background countries (#5702) have none.
  const seededCountryIds = (
    await statesCollection(db).distinct("countryId", { _id: { $not: /^NATIONAL_/ } })
  ).filter((countryId) => !isBackgroundInPreset(preset, countryId));
  const expectedUnionCount = seededCountryIds.length * OPERATING_SECTOR_TYPES.length;
  if (unionCount < expectedUnionCount) {
    console.warn(
      `[unionsTurn] labourSystemMode is 'full' but union roster is incomplete (${unionCount}/${expectedUnionCount}), backfilling via seedUnions(reset:false)`
    );
    await seedUnions(db, (msg) => console.warn(`[unionsTurn] ${msg}`), preset, false);
  }

  // Union strength decay. Unlike dues and pressure this runs for EVERY union,
  // led or not, and for every organizer's banked total alongside it, because
  // strength is built by the rank and file rather than by a president: an
  // unowned union that nobody organizes must bleed power too, and the vote
  // weights have to decay in step with the pool they came from or the two
  // numbers drift apart. Suspended unions stay frozen, same as dues.
  const bannedUnionCountryIds = await getBannedUnionCountryIds(db);
  const enforcementBudgets = await federalBudgetCollection(db)
    .find({ unionsBanned: true }, { projection: { countryId: 1, unionEnforcementPosture: 1 } })
    .toArray();
  const enforcementPostures = new Map(
    enforcementBudgets.map(
      (budget) =>
        [budget.countryId as CountryId, budget.unionEnforcementPosture ?? "normal"] as const
    )
  );
  const bannedCountryList = Array.from(bannedUnionCountryIds);
  const suspendedUnionFilter =
    bannedCountryList.length > 0 ? { countryId: { $in: bannedCountryList } } : { suspended: true };
  const suspendedUnionIds = await db
    .collection<Union>("unions")
    .distinct("_id", suspendedUnionFilter);
  const strengthDecayMultiplier = 1 - UNION_STRENGTH_DECAY_PER_TURN;
  const decayStamp = new Date();
  await Promise.all([
    db
      .collection<Union>("unions")
      .updateMany(
        { _id: { $nin: suspendedUnionIds }, strength: { $gt: 0 } },
        { $mul: { strength: strengthDecayMultiplier }, $set: { updatedAt: decayStamp } }
      ),
    db
      .collection<UnionOrganizer>("unionOrganizers")
      .updateMany(
        { unionId: { $nin: suspendedUnionIds }, strength: { $gt: 0 } },
        { $mul: { strength: strengthDecayMultiplier }, $set: { updatedAt: decayStamp } }
      ),
  ]);

  // Illicit unions under ban: heat decay, detection rolls, and exposure
  // windows for suspended cells. Suspended unions never reach the owned
  // pass below, so this runs unconditionally (even with zero owned unions).
  const underground = await processUndergroundTurn(
    db,
    currentTurn,
    bannedUnionCountryIds,
    enforcementPostures
  );
  if (underground.newlyExposed > 0) {
    console.warn(`[unionsTurn] exposed ${underground.newlyExposed} underground union(s)`);
  }

  const sectorsAdopted = await adoptUnrepresentedSectors(db);
  if (sectorsAdopted > 0) {
    console.warn(
      `[unionsTurn] adopted ${sectorsAdopted} unrepresented sector(s) into their industry's seeded union`
    );
  }

  const owned = await db
    .collection<Union>("unions")
    .find(
      // Union ban (player suggestion #93): suspended unions (country under an
      // enacted ban) are frozen, no dues, no services, no approval trend, no
      // inactivity vacancy, so a repeal restores them exactly as the ban found them.
      {
        ownerId: { $ne: null },
        suspended: { $ne: true },
        countryId: { $nin: bannedCountryList },
      },
      {
        projection: {
          _id: 1,
          ownerId: 1,
          ownerType: 1,
          name: 1,
          countryId: 1,
          treasury: 1,
          duesPerWorkerAnnual: 1,
          activeServices: 1,
          serviceReceipts: 1,
          politicalContributionPct: 1,
          approval: 1,
        },
      }
    )
    .toArray();

  if (owned.length === 0) {
    return { unionsProcessed: 0, vacatedForInactivity: 0, sectorsAdopted, ...labourRelations };
  }

  const now = new Date();

  // Inactivity auto-vacancy, mirrors isInactiveCeoPenaltyCandidate's
  // lastActivity/createdAt lookup exactly.
  const ownerIds = owned.map((u) => u.ownerId).filter((id): id is ObjectId => id != null);
  const owners = ownerIds.length
    ? await charactersCollection(db)
        .find({ _id: { $in: ownerIds } }, { projection: { _id: 1, userId: 1 } })
        .toArray()
    : [];
  const userIdByCharacterId = new Map(owners.map((c) => [c._id.toString(), c.userId]));
  const userIds = Array.from(new Set(owners.map((c) => c.userId.toString()))).map(
    (s) => new ObjectId(s)
  );
  const users = userIds.length
    ? await db
        .collection<User>("users")
        .find({ _id: { $in: userIds } })
        .project<{ _id: ObjectId; lastActivity?: Date; createdAt?: Date }>({
          _id: 1,
          lastActivity: 1,
          createdAt: 1,
        })
        .toArray()
    : [];
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const cutoffMs = now.getTime() - INACTIVE_CEO_TURN_THRESHOLD * MS_PER_TURN;

  const vacatedUnionIds: ObjectId[] = [];
  const vacatedCharacterIds: ObjectId[] = [];
  const stillOwned: typeof owned = [];
  for (const union of owned) {
    // NPP leaders have no User behind them, so the lastActivity signal this
    // sweep is built on does not apply, they are never "inactive". Without
    // this they would survive only by accident (the characters lookup misses,
    // `reference` comes back undefined and the branch falls through), which is
    // too fragile to rely on.
    if (union.ownerType === "npp") {
      stillOwned.push(union);
      continue;
    }
    const characterId = union.ownerId?.toString();
    const userId = characterId ? userIdByCharacterId.get(characterId) : undefined;
    const user = userId ? userById.get(userId.toString()) : undefined;
    const reference = user?.lastActivity ?? user?.createdAt;
    if (reference && reference.getTime() < cutoffMs) {
      vacatedUnionIds.push(union._id);
      if (union.ownerId) vacatedCharacterIds.push(union.ownerId);
    } else {
      stillOwned.push(union);
    }
  }

  if (vacatedUnionIds.length > 0) {
    await db
      .collection<Union>("unions")
      .updateMany({ _id: { $in: vacatedUnionIds } }, { $set: { ownerId: null, updatedAt: now } });
    await charactersCollection(db).updateMany(
      { _id: { $in: vacatedCharacterIds } },
      { $set: { unionLeaderOf: null, updatedAt: now } }
    );
  }

  if (stillOwned.length > 0) {
    const stillOwnedIds = stillOwned.map((u) => u._id);
    const representedSectors = await db
      .collection<CorporateSector>("corporateSectors")
      .find(
        { representingUnionId: { $in: stillOwnedIds } },
        { projection: { representingUnionId: 1, workers: 1, unionization: 1, wagePerWorker: 1 } }
      )
      .toArray();
    const sectorsByUnionId = new Map<string, CorporateSector[]>();
    for (const sector of representedSectors) {
      const key = sector.representingUnionId!.toString();
      const list = sectorsByUnionId.get(key);
      if (list) list.push(sector);
      else sectorsByUnionId.set(key, [sector]);
    }

    const organizers = await db
      .collection<UnionOrganizer>("unionOrganizers")
      .find(
        { unionId: { $in: stillOwnedIds }, strength: { $gt: 0 } },
        { projection: { unionId: 1, characterId: 1, strength: 1 } }
      )
      .toArray();
    const organizersByUnionId = new Map<string, UnionOrganizer[]>();
    for (const organizer of organizers) {
      const key = organizer.unionId.toString();
      const list = organizersByUnionId.get(key);
      if (list) list.push(organizer);
      else organizersByUnionId.set(key, [organizer]);
    }

    const forexEnabled = await isForexEnabled();
    const campaignFundsField = forexEnabled ? "currencyBalances.campaign" : "funds";
    const characterOps: AnyBulkWriteOperation<Character>[] = [];
    const contributionTx: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = [];

    const ops = stillOwned.map((u) => {
      const sectors = sectorsByUnionId.get(u._id.toString()) ?? [];
      const members = unionMembers(sectors);
      const annualWage = averageAnnualWage(sectors);
      const activeServices = normalizeServiceIds(u.activeServices);
      // Re-clamp the stored rate against TODAY's wages: setUnionDues clamps at
      // write time, but wages can fall (or high-wage shops can be lost) after
      // the rate was set, and the engine must never charge above the 10%
      // ceiling the API and the display both enforce.
      const duesRate = Math.min(
        Math.max(0, u.duesPerWorkerAnnual ?? 0),
        maxDuesForWage(annualWage)
      );
      const duesIncome = duesIncomePerTurn(members, duesRate);
      const fullServicesCost = servicesCostPerTurn(members, annualWage, activeServices);
      // The service bill never pushes the treasury negative: if this turn's
      // dues income can't cover it, the whole slate lapses for the turn (no
      // partial charge) and buys no entitlement for the following turn.
      const affordableTreasury = u.treasury + duesIncome;
      const servicesLapsed = fullServicesCost > affordableTreasury;
      const servicesCost = servicesLapsed ? 0 : fullServicesCost;
      const contributionPct = clampPoliticalContributionPct(u.politicalContributionPct);
      const freeCashFlow = freeCashFlowPerTurn(duesIncome, servicesCost);
      const requestedContribution = politicalContributionPerTurn(freeCashFlow, contributionPct);
      const payouts = distributePoliticalContributions(
        requestedContribution,
        (organizersByUnionId.get(u._id.toString()) ?? []).map((organizer) => ({
          characterId: organizer.characterId.toString(),
          strength: organizer.strength ?? 0,
        }))
      );
      // Only debit what we can actually pay out. A union with a rate set but
      // no organizers of any strength keeps the surplus in the treasury.
      const contribution = payouts.reduce((sum, payout) => sum + payout.amount, 0);
      const currencyCode = (COUNTRY_CURRENCY_MAP[
        u.countryId as keyof typeof COUNTRY_CURRENCY_MAP
      ] ?? "USD") as CurrencyCode;
      for (const payout of payouts) {
        characterOps.push({
          updateOne: {
            filter: { _id: new ObjectId(payout.characterId) },
            update: {
              $inc: { [campaignFundsField]: payout.amount },
              $set: { updatedAt: now },
            },
          },
        });
        contributionTx.push({
          type: "union_contribution",
          turn: currentTurn,
          createdAt: now,
          subjectType: "character",
          subjectId: new ObjectId(payout.characterId),
          subjectName: "",
          amount: payout.amount,
          currencyCode,
          counterpartyType: "system",
          counterpartyName: u.name,
          meta: { unionId: u._id.toString(), unionName: u.name, source: "union_pac" },
        });
      }
      const target = approvalTarget({
        duesPerWorkerAnnual: duesRate,
        annualWage,
        activeServices: paidUnionServices(
          { ...u, ownerId: u.ownerId?.toString() ?? null },
          currentTurn
        ),
        servicesLapsed: false,
        politicalContributionPct: contributionPct,
      });
      const newApproval = trendApproval(unionApproval(u), target);
      return {
        updateOne: {
          filter: { _id: u._id },
          update: {
            $inc: { treasury: duesIncome - servicesCost - contribution },
            $set: {
              approval: newApproval,
              serviceReceipts: purchaseUnionServices(
                u.serviceReceipts,
                currentTurn,
                fundedUnionServices({ ...u, ownerId: u.ownerId?.toString() ?? null }, sectors)
              ),
              updatedAt: now,
            },
          },
        },
      };
    });
    await db.collection<Union>("unions").bulkWrite(ops);
    if (characterOps.length > 0) {
      await charactersCollection(db).bulkWrite(characterOps);
    }
    if (contributionTx.length > 0) {
      const payoutIds = [
        ...new Set(contributionTx.map((entry) => entry.subjectId!.toString())),
      ].map((id) => new ObjectId(id));
      const named = await charactersCollection(db)
        .find({ _id: { $in: payoutIds } }, { projection: { _id: 1, name: 1 } })
        .toArray();
      const nameById = new Map(
        named.map((character) => [character._id.toString(), character.name])
      );
      for (const entry of contributionTx) {
        entry.subjectName = nameById.get(entry.subjectId!.toString()) ?? "Unknown";
      }
      const thresholds = await loadTxThresholds(db);
      void emitTxBulk(db, contributionTx, thresholds);
    }
  }

  return {
    unionsProcessed: stillOwned.length,
    sectorsAdopted,
    vacatedForInactivity: vacatedUnionIds.length,
    ...labourRelations,
  };
}
