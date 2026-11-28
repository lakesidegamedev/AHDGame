import { withSessionDb } from "@/lib/db/sessionDb";
import { hasRetainedFinancialEstate } from "@/lib/corporations/rules/retainedFinancialEstate";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { supplyAgreementsCollection } from "@/lib/db/repositories/supplyAgreements";
import { recordCorporationExit } from "@/lib/corporations/exits/recordCorporationExit";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";

import { ensurePrimaryNationalCorporation } from "@/lib/nationalization/nationalCorporation";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";
import { cleanupShareMarketActivityForCorporations } from "@/lib/corporations/cleanupShareMarketActivity";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
} from "@/lib/corporations/securedConstructionProperty";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export interface MergeNationalCorporationsArgs {
  fromCountryId: CountryId;
  toCountryId: CountryId;
}

export interface MergeNationalCorporationsResult {
  /** Absorbed NatCorp shells folded and deleted (the ghost primary included). */
  corpsDissolved: number;
  /** Producing sectors re-parented onto the survivor's NatCorp tree. */
  sectorsMoved: number;
  /** Sovereign bond issues re-stamped onto the survivor's primary. */
  bondsRestamped: number;
}

async function mergeNationalCorporationsAtomic(
  db: Db,
  args: MergeNationalCorporationsArgs
): Promise<MergeNationalCorporationsResult> {
  return withSessionDb(db, (tx) => mergeNationalCorporations(tx, args));
}
async function mergeNationalCorporations(
  db: Db,
  args: MergeNationalCorporationsArgs
): Promise<MergeNationalCorporationsResult> {
  const { fromCountryId, toCountryId } = args;
  const now = new Date();
  const corps = corporationsCollection(db);
  const sectors = corporateSectorsCollection(db);
  const bonds = bondsCollection(db);

  // The survivor's primary exists (or is created) FIRST, so there is always a
  // fold target even when the survivor had no NatCorp tree at all.
  const survivorPrimary = await ensurePrimaryNationalCorporation(db, toCountryId);

  const candidates = await corps.find({ countryOwnerId: fromCountryId }).toArray();
  const candidateIds = candidates.map((corp) => corp._id);
  const [loans, heldBonds, assessments] = await Promise.all([
    bankLoansCollection(db)
      .find(
        {
          borrowerType: "corporation",
          borrowerId: { $in: candidateIds },
          status: { $nin: ["repaid", "rejected"] },
        },
        { projection: { borrowerId: 1 } }
      )
      .toArray(),
    bonds
      .find(
        { "holders.corporationId": { $in: candidateIds }, matured: false },
        { projection: { holders: 1 } }
      )
      .toArray(),
    supplyAgreementsCollection(db)
      .find(
        { "transferPricingPendingAssessment.liableCorpId": { $in: candidateIds.map(String) } },
        { projection: { transferPricingPendingAssessment: 1 } }
      )
      .toArray(),
  ]);
  const retainedIds = new Set([
    ...loans.map((loan) => String(loan.borrowerId)),
    ...heldBonds.flatMap((bond) =>
      (bond.holders ?? []).map((holder) => String(holder.corporationId))
    ),
    ...assessments.map((agreement) => agreement.transferPricingPendingAssessment!.liableCorpId),
    ...candidates
      .filter((corp) => hasRetainedFinancialEstate(corp, true))
      .map((corp) => String(corp._id)),
  ]);
  const retained = candidates.filter((corp) => retainedIds.has(String(corp._id)));
  if (retained.length)
    await corps.updateMany(
      { _id: { $in: retained.map((corp) => corp._id) } },
      {
        $set: { countryOwnerId: toCountryId, isPrimaryNationalCorporation: false, updatedAt: now },
      }
    );
  const absorbedCorps = candidates.filter((corp) => !retainedIds.has(String(corp._id)));
  if (absorbedCorps.length === 0) {
    return { corpsDissolved: 0, sectorsMoved: 0, bondsRestamped: 0 };
  }
  const absorbedCorpIds = absorbedCorps.map((corp) => corp._id);
  const absorbedSectors = await sectors.find({ corporationId: { $in: absorbedCorpIds } }).toArray();
  const allTransitionKeys = await reserveSectorsForTransition(
    db,
    absorbedSectors,
    "country_national_corporation_merge",
    `country-merge:${fromCountryId}:${toCountryId}:${new ObjectId().toHexString()}`
  );
  if (!allTransitionKeys) {
    throw new Error(
      "A National Corporation site carries a construction loan. Merge the holdings after it is repaid."
    );
  }
  const transitionKeyBySectorId = new Map(
    absorbedSectors.map((sector, index) => [sector._id.toHexString(), allTransitionKeys[index]])
  );

  // The survivor split-off claiming each sector type, if any. A type both
  // sides split off folds into the SURVIVOR's enterprise of that type, so the
  // one-NatCorp-per-type invariant survives the merge (a sector joining a
  // split-off that already claims the type also merges into an existing
  // (corp, state, type) holding — the nationalization-absorb rule).
  const survivorSplitOffs = await corps
    .find({
      countryOwnerId: toCountryId,
      _id: { $ne: survivorPrimary._id },
      assignedSectorTypes: { $exists: true, $ne: [] },
    })
    .toArray();
  const claimedByType = new Map<string, ObjectId>();
  for (const corp of survivorSplitOffs) {
    for (const type of corp.assignedSectorTypes ?? []) {
      claimedByType.set(type, corp._id);
    }
  }

  let sectorsMoved = 0;
  const movedSectorIds = new Set<string>();

  // Sectors first (they read the still-alive shells), then the shells.
  for (const corp of absorbedCorps) {
    const corpSectors = absorbedSectors.filter(
      (sector) => sector.corporationId.toString() === corp._id.toString()
    );
    if (corpSectors.length === 0) continue;

    const transferOps = corpSectors.map((sector) => {
      const key = transitionKeyBySectorId.get(sector._id.toHexString());
      if (!key) throw new Error("A secured sector reservation was lost");
      return {
        updateOne: {
          filter: {
            _id: sector._id,
            corporationId: corp._id,
            "constructionPropertyTransition.key": key,
          },
          update: {
            $set: {
              corporationId: claimedByType.get(sector.sectorType) ?? survivorPrimary._id,
              updatedAt: now,
            },
          },
        },
      };
    });
    await applySecuredSectorTransfers(sectors, transferOps);
    for (const sector of corpSectors) movedSectorIds.add(String(sector._id));
    sectorsMoved += transferOps.length;
  }

  // Sovereign bonds the absorbed state issued: the survivor primary assumes
  // them. `mergeNationalFisc` rescopes the same bonds' COUNTRY fields; this is
  // the corp half of the same assumption, without which coupons keep flowing
  // to a corp of a country that no longer exists. `originalIssuerName` keeps
  // the absorbed side's name as provenance (only when not already stamped, so
  // a re-run never overwrites the real provenance with the survivor's name).
  const absorbedBonds = await bonds
    .find({ issuerType: "sovereign", corporationId: { $in: absorbedCorpIds }, matured: false })
    .toArray();
  if (absorbedBonds.length > 0) {
    await bonds.bulkWrite(
      absorbedBonds.map((bond) => ({
        updateOne: {
          filter: { _id: bond._id },
          update: {
            $set: {
              corporationId: survivorPrimary._id,
              issuerName: survivorPrimary.name,
              ...(bond.originalIssuerName ? {} : { originalIssuerName: bond.issuerName }),
              updatedAt: now,
            },
          },
        },
      }))
    );
  }

  // Corp-held stakes in other corporations (privatization golden shares, any
  // cross-holding) re-stamp to the survivor primary — the same assumption
  // `transferOwnedSharesToNatCorp` performs on a single-corp nationalization.
  // One pass per held stake, not per corp, is fine at merge scale.
  for (const corpId of absorbedCorpIds) {
    await corps.updateMany(
      { "shareholders.corporationId": corpId },
      {
        $set: { "shareholders.$[elem].corporationId": survivorPrimary._id, updatedAt: now },
      },
      { arrayFilters: [{ "elem.corporationId": corpId }] }
    );
  }

  // Dissolve the absorbed shells LAST. The ghost primary loses its flag here —
  // deleting a document whose only readers filtered on `countryOwnerId` makes
  // every future lookup (primary, split-off, per-type routing) land on the
  // survivor's tree by construction. The two bookkeeping stamps mirror the
  // single-corp nationalization path: share-market activity is unwound first
  // (NatCorps never float, so this is belt-and-braces for any stray order), and
  // the tx log keeps its forensic trail with the deletion time pinned.
  const forexEnabled = await isForexEnabled();
  for (const corp of absorbedCorps) {
    await cleanupShareMarketActivityForCorporations(db, [corp._id], now, forexEnabled);
    await stampSubjectDeleted(db, corp._id, {
      sequentialId: corp.sequentialId,
      deletedAt: now,
    });
    await corps.deleteOne({ _id: corp._id });
    await recordCorporationExit(db, corp, {
      reason: "national_corporation_merged",
      successorId: survivorPrimary._id,
      now,
    });
  }

  // Hold the property lock through bond/share/title settlement and shell
  // deletion. Merged-into sectors keep their marker until the final corporate
  // owner and assumed liabilities are established.
  await Promise.all(
    absorbedSectors
      .filter((sector) => movedSectorIds.has(sector._id.toHexString()))
      .map((sector) =>
        releaseConstructionPropertyTransition(
          db,
          sector._id,
          transitionKeyBySectorId.get(sector._id.toHexString())!
        )
      )
  );

  return {
    corpsDissolved: absorbedCorps.length,
    sectorsMoved,
    bondsRestamped: absorbedBonds.length,
  };
}

export { mergeNationalCorporationsAtomic as mergeNationalCorporations };

async function applySecuredSectorTransfers(
  sectors: import("mongodb").Collection<import("@/lib/db/types").CorporateSector>,
  operations: import("mongodb").AnyBulkWriteOperation<import("@/lib/db/types").CorporateSector>[]
) {
  if (!operations.length) return;
  const moved = await sectors.bulkWrite(operations);
  if (moved.matchedCount !== operations.length)
    throw new Error("A sector changed during National Corporation consolidation");
}
