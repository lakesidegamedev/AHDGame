import {
  operatingSectorFilter,
  operatingSectorIdentity,
  corporationTypeOfLane,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import type { Db } from "mongodb";
import { recordCorporationExit } from "@/lib/corporations/exits/recordCorporationExit";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";

import {
  buildNationalCorporationDoc,
  ensurePrimaryNationalCorporation,
} from "./nationalCorporation";
import { makeAdoptedSoeState } from "@/lib/economy/soe";
import {
  prepareConstructionBorrowerTransfers,
  settleConstructionBorrowerTransfers,
} from "@/lib/banking/constructionBorrowerTransfer";
import {
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
} from "@/lib/corporations/securedConstructionProperty";

/**
 * Split-off & merge-back of National Corporation sector types (spec §24.2).
 * Both are **state-internal reorganizations** — money-neutral (no compensation;
 * a National Corporation has no private shareholders). Authorization is the
 * caller's responsibility (route uses `assertTreasuryAuthority`).
 */

export interface SplitOffParams {
  countryId: CountryId;
  sectorType: OperatingSectorType;
  /** Name for the new secondary National Corporation (validated by the caller). */
  newCorpName: string;
}

export interface SplitOffResult {
  newNationalCorporationId: ObjectId;
  sectorsMoved: number;
}

/** All National Corporation ids for a country (primary + any split-offs). */
async function nationalCorporationIds(db: Db, countryId: CountryId): Promise<ObjectId[]> {
  const corps = await db
    .collection<Corporation>("corporations")
    .find({ countryOwnerId: countryId })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  return corps.map((c) => c._id);
}

/**
 * Carve a sector type into a new secondary National Corporation. Moves every
 * sector of that type currently held by ANY of the country's National
 * Corporations into the new corp (full type only — no partial %). Pre-claim is
 * allowed: with zero current sectors the corp is still created and now owns
 * routing for that type. Rejects if a split-off already claims the type.
 */
export async function splitOffSectorType(db: Db, params: SplitOffParams): Promise<SplitOffResult> {
  const now = new Date();
  const corps = db.collection<Corporation>("corporations");
  const name = params.newCorpName.trim();
  if (name.length < 2) throw new Error("New National Corporation name is too short");

  // One National Corporation per sector type per country.
  const existingClaim = await corps.findOne({
    countryOwnerId: params.countryId,
    assignedSectorTypes: params.sectorType,
  });
  if (existingClaim) {
    throw new Error(`A National Corporation already owns the ${params.sectorType} sector type`);
  }

  // Ensure the primary exists (so the country has a coherent NatCorp set first).
  const primary = await ensurePrimaryNationalCorporation(db, params.countryId);
  const natCorpIds = await nationalCorporationIds(db, params.countryId);
  const fromIds = natCorpIds;
  const sectors =
    fromIds.length > 0
      ? await db
          .collection<CorporateSector>("corporateSectors")
          .find({ corporationId: { $in: fromIds }, ...operatingSectorFilter(params.sectorType) })
          .toArray()
      : [];
  // Financed sites move with their construction loans; the split-off becomes
  // the borrower. It inherits the primary's currency, so the loan's does not change.
  const newId = new ObjectId();
  const preparedTransfers = await prepareConstructionBorrowerTransfers(db, {
    sectors,
    toId: newId,
    toCurrency: primary.liquidCurrencyCode,
    operationKey: `split-off:${newId.toHexString()}`,
  });
  if (!preparedTransfers.ok) throw new Error(preparedTransfers.error);
  const constructionTransfers = preparedTransfers.plan;
  const transitionKeys = await reserveSectorsForTransition(
    db,
    sectors,
    "nationalization_restructure",
    `split-off:${new ObjectId().toHexString()}`,
    false,
    constructionTransfers
  );
  if (!transitionKeys) {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    throw new Error("A sector of this type is in another ownership change. Try again shortly.");
  }
  let sectorsMoved = 0;
  try {
    const doc = buildNationalCorporationDoc(params.countryId, {
      name,
      // Inherit the primary's home currency so a split-off on a 2027 euro
      // member stamps EUR, not the era-blind map code. No extra read: the
      // ensure above already returned the document.
      liquidCurrencyCode: primary.liquidCurrencyCode,
      // buildNationalCorporationDoc defaults `type` to "financial", right for the
      // PRIMARY NatCorp (a sovereign issuer) but wrong for a producing split-off:
      // `corporation.type` drives expandSector/buildCapacity defaults and is read
      // by applyPriceMultipliers, so the default mislabels every split-off.
      type: corporationTypeOfLane(params.sectorType),
      ...(operatingSectorIdentity(params.sectorType).industryModel
        ? { industryModel: operatingSectorIdentity(params.sectorType).industryModel }
        : {}),
      ...(operatingSectorIdentity(params.sectorType).mediaDiscriminator
        ? { mediaDiscriminator: operatingSectorIdentity(params.sectorType).mediaDiscriminator }
        : {}),
      isPrimaryNationalCorporation: false,
      assignedSectorTypes: [params.sectorType],
    });
    await corps.insertOne({ ...doc, _id: newId } as Corporation);

    // Move all sectors of this type held by any of the country's NatCorps.
    for (const [index, sector] of sectors.entries()) {
      const moved = await db.collection<CorporateSector>("corporateSectors").updateOne(
        {
          _id: sector._id,
          corporationId: sector.corporationId,
          "constructionPropertyTransition.key": transitionKeys[index],
          ...constructionTransfers.claimFilterFor(sector),
        },
        {
          $set: {
            corporationId: newId,
            ...constructionTransfers.setFor(sector._id),
            updatedAt: now,
          },
        }
      );
      if (moved.matchedCount !== 1)
        throw new Error("A sector changed during the National Corporation split-off");
      sectorsMoved += 1;
    }
  } finally {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
  }
  await Promise.all(
    sectors.map((sector, index) =>
      releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
    )
  );

  // Under a command economy the split-off is an ENTERPRISE, not just a holding
  // shell, so it needs the `soe` overlay to exist as one. Without it
  // `loadCommandEconomyDashboard` (which selects on `soe: {$exists: true}`)
  // cannot see it, the enterprise appears in no table, and there is no director
  // seat to claim. The split-off silently removes a sector type from the plan.
  // Derived from the sectors we just moved so the enterprise starts on-plan
  // against what it actually produces.
  await attachSoeOverlayIfPlanned(db, params.countryId, newId, params.sectorType);

  return { newNationalCorporationId: newId, sectorsMoved };
}

/**
 * Attach the `soe` overlay to a National Corporation when the world is running
 * a command economy, deriving it from the sectors the corp now holds. No-op
 * when the plan is off (a market NatCorp has no plan target to meet) or when an
 * overlay is already present (never clobber a live plan or a seated director).
 *
 * Exported so the DD/RU repair migrations can adopt split-offs that were
 * created before `splitOffSectorType` did this.
 */
async function attachSoeOverlayIfPlanned(
  db: Db,
  countryId: CountryId,
  corpId: ObjectId,
  sectorType: OperatingSectorType
): Promise<boolean> {
  const config = await db
    .collection("gameConfig")
    .findOne<{ commandEconomyEnabled?: boolean }>(
      { commandEconomyEnabled: { $exists: true } },
      { projection: { commandEconomyEnabled: 1 } }
    );
  if (!config?.commandEconomyEnabled) return false;

  const existing = await db
    .collection<Corporation>("corporations")
    .findOne({ _id: corpId, soe: { $exists: true } }, { projection: { _id: 1 } });
  if (existing) return false;

  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      { corporationId: corpId },
      { projection: { revenue: 1, realizedRevenue: 1, capitalStock: 1 } }
    )
    .toArray();

  await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: corpId },
      { $set: { soe: makeAdoptedSoeState(sectorType, sectors), updatedAt: new Date() } }
    );
  return true;
}

export interface MergeBackParams {
  countryId: CountryId;
  sectorType: OperatingSectorType;
  /** Target NatCorp to fold into; defaults to the primary. */
  intoCorpId?: ObjectId;
}

export interface MergeBackResult {
  targetNationalCorporationId: ObjectId;
  dissolvedNationalCorporationId: ObjectId;
  sectorsMoved: number;
}

/**
 * Fold a split-off's sector type back into another National Corporation
 * (default: the primary) and dissolve the now-empty split-off shell. No
 * shareholder payout (a NatCorp has none) and no sector-restore-to-unowned
 * (sectors are moved, not abandoned).
 */
export async function mergeBackSectorType(
  db: Db,
  params: MergeBackParams
): Promise<MergeBackResult> {
  const now = new Date();
  const corps = db.collection<Corporation>("corporations");

  // The split-off owning this type (never the primary — primary has empty
  // assignedSectorTypes, so this query can only match a secondary).
  const splitOff = await corps.findOne({
    countryOwnerId: params.countryId,
    assignedSectorTypes: params.sectorType,
    isPrimaryNationalCorporation: { $ne: true },
  });
  if (!splitOff) {
    throw new Error(`No split-off National Corporation owns the ${params.sectorType} sector type`);
  }
  const splitOffSectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find({ corporationId: splitOff._id })
    .toArray();
  // Resolve the target: explicit corp (must be a NatCorp of this country) or primary.
  let target: Corporation;
  if (params.intoCorpId) {
    if (params.intoCorpId.equals(splitOff._id)) {
      throw new Error("Cannot merge a National Corporation into itself");
    }
    const into = await corps.findOne({
      _id: params.intoCorpId,
      countryOwnerId: params.countryId,
    });
    if (!into) throw new Error("Target National Corporation not found for this country");
    target = into;
  } else {
    target = await ensurePrimaryNationalCorporation(db, params.countryId);
  }

  // Financed sites move with their construction loans; the target becomes the
  // borrower.
  const preparedTransfers = await prepareConstructionBorrowerTransfers(db, {
    sectors: splitOffSectors,
    toId: target._id,
    toCurrency: target.liquidCurrencyCode,
    operationKey: `merge-back:${splitOff._id.toHexString()}`,
  });
  if (!preparedTransfers.ok) throw new Error(preparedTransfers.error);
  const constructionTransfers = preparedTransfers.plan;
  const transitionKeys = await reserveSectorsForTransition(
    db,
    splitOffSectors,
    "nationalization_restructure",
    `merge-back:${new ObjectId().toHexString()}`,
    false,
    constructionTransfers
  );
  if (!transitionKeys) {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    throw new Error("A sector of this type is in another ownership change. Try again shortly.");
  }

  // Move the split-off's sectors into the target.
  let sectorsMoved = 0;
  for (const [index, sector] of splitOffSectors.entries()) {
    const moved = await db.collection<CorporateSector>("corporateSectors").updateOne(
      {
        _id: sector._id,
        corporationId: splitOff._id,
        "constructionPropertyTransition.key": transitionKeys[index],
        ...constructionTransfers.claimFilterFor(sector),
      },
      {
        $set: {
          corporationId: target._id,
          ...constructionTransfers.setFor(sector._id),
          updatedAt: now,
        },
      }
    );
    if (moved.matchedCount !== 1) {
      await settleConstructionBorrowerTransfers(db, constructionTransfers);
      throw new Error("A sector changed during the National Corporation merge-back");
    }
    sectorsMoved += 1;
  }
  await settleConstructionBorrowerTransfers(db, constructionTransfers);

  // If the target is a split-off, it now also owns this type; if it's the
  // primary, the type reverts to the remainder (primary keeps assignedSectorTypes empty).
  if (!target.isPrimaryNationalCorporation) {
    await corps.updateOne(
      { _id: target._id },
      { $addToSet: { assignedSectorTypes: params.sectorType }, $set: { updatedAt: now } }
    );
  }

  // Dissolve the emptied split-off shell (no payout, no restore).
  await corps.deleteOne({ _id: splitOff._id });
  await recordCorporationExit(db, splitOff, {
    reason: "national_corporation_merged",
    successorId: target._id,
    now,
  });
  await Promise.all(
    splitOffSectors.map((sector, index) =>
      releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
    )
  );

  return {
    targetNationalCorporationId: target._id,
    dissolvedNationalCorporationId: splitOff._id,
    sectorsMoved,
  };
}
