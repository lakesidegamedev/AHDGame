import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { getCurrentTurn } from "@/lib/currentTurn";
import {
  hasProtectedConstructionClaim,
  unclaimedConstructionFilter,
  unprotectedConstructionPropertyFilter,
} from "./rules/constructionProperty";
import {
  constructionBorrowerTransferKey,
  constructionBorrowerTransferRefusal,
  transferableConstructionClaimFilter,
} from "./rules/constructionBorrowerTransfer";
import { acquireConstructionLoanLock } from "./constructionLoanLock";

type TransferSector = Pick<
  CorporateSector,
  "_id" | "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
>;

export interface ConstructionBorrowerTransfer {
  sectorId: ObjectId;
  claimId: string;
  loanId: ObjectId;
  fromId: ObjectId;
  toId: ObjectId;
  key: string;
}

export interface ConstructionBorrowerTransferPlan {
  transfers: ConstructionBorrowerTransfer[];
  /**
   * Claim predicate for the sector write that changes the site's owner: the
   * stable-claim match for a financed site, and the ordinary "no secured
   * claim" match for every other site. Neither covers the ownership marker,
   * which the caller already guards in its own way.
   */
  claimFilterFor(sector: TransferSector): Record<string, unknown>;
  /** The same predicate plus "no other ownership change is running". */
  filterFor(sector: TransferSector): Record<string, unknown>;
  /** Fields to `$set` in that same write so the claim names the new owner. */
  setFor(sectorId: ObjectId): Record<string, unknown>;
  hasTransfer(sectorId: ObjectId): boolean;
}

type PrepareResult =
  { ok: true; plan: ConstructionBorrowerTransferPlan } | { ok: false; error: string };

function planFor(transfers: ConstructionBorrowerTransfer[]): ConstructionBorrowerTransferPlan {
  const bySector = new Map(transfers.map((t) => [t.sectorId.toHexString(), t]));
  const claimFilterFor = (sector: TransferSector) => {
    const transfer = bySector.get(sector._id.toHexString());
    return transfer
      ? transferableConstructionClaimFilter({
          claimId: transfer.claimId,
          borrowerId: transfer.fromId.toHexString(),
        })
      : unclaimedConstructionFilter();
  };
  return {
    transfers,
    claimFilterFor,
    filterFor: (sector) =>
      bySector.has(sector._id.toHexString())
        ? {
            $and: [{ constructionPropertyTransition: { $exists: false } }, claimFilterFor(sector)],
          }
        : unprotectedConstructionPropertyFilter(),
    setFor: (sectorId) => {
      const transfer = bySector.get(sectorId.toHexString());
      return transfer ? { "constructionFinancing.borrowerId": transfer.toId.toHexString() } : {};
    },
    hasTransfer: (sectorId) => bySector.has(sectorId.toHexString()),
  };
}

/** One plan for an ownership change whose sites go to more than one new owner. */
export function combineConstructionBorrowerTransferPlans(
  plans: readonly ConstructionBorrowerTransferPlan[]
): ConstructionBorrowerTransferPlan {
  return planFor(plans.flatMap((plan) => plan.transfers));
}

/** A plan that moves no loans, for callers whose sites carry no secured claim. */
export function emptyConstructionBorrowerTransferPlan(): ConstructionBorrowerTransferPlan {
  return planFor([]);
}

/**
 * Check every financed site in an ownership change and take each loan's lock
 * before any title moves. Holding the lock keeps servicing, sales and refunds
 * off the loan while its borrower changes. Either every financed site is
 * transferable and locked, or nothing is locked and the caller gets the first
 * reason a player can act on.
 */
export async function prepareConstructionBorrowerTransfers(
  db: Db,
  input: {
    sectors: readonly TransferSector[];
    toId: ObjectId;
    toCurrency: string | undefined;
    operationKey: string;
    turn?: number;
    /** Ownership markers the caller itself holds on these sites. */
    ownsTransition?: (sector: TransferSector) => boolean;
  }
): Promise<PrepareResult> {
  const { sectors, toId, toCurrency, operationKey } = input;
  for (const sector of sectors) {
    if (sector.constructionPropertyTransition && !input.ownsTransition?.(sector))
      return {
        ok: false,
        error:
          "A site in this transfer is in the middle of another ownership change. Try again shortly.",
      };
  }
  const claimed = sectors.filter(
    (sector) => hasProtectedConstructionClaim(sector) && !sector.corporationId.equals(toId)
  );
  if (claimed.length === 0) return { ok: true, plan: planFor([]) };

  const loanIds = claimed.flatMap((sector) => {
    const loanId = sector.constructionFinancing?.loanId;
    return loanId && ObjectId.isValid(loanId) ? [new ObjectId(loanId)] : [];
  });
  const [turn, loans] = await Promise.all([
    input.turn ?? getCurrentTurn(db),
    db
      .collection<BankLoan>("bankLoans")
      .find({ _id: { $in: loanIds } })
      .toArray(),
  ]);
  const loanById = new Map(loans.map((loan) => [String(loan._id), loan]));
  const transfers: ConstructionBorrowerTransfer[] = [];
  const unlock = () =>
    transfers.length === 0
      ? Promise.resolve()
      : db.collection<BankLoan>("bankLoans").bulkWrite(
          transfers.map((transfer) => ({
            updateOne: {
              filter: { _id: transfer.loanId, constructionSettlementOwner: transfer.key },
              update: { $unset: { constructionSettlementOwner: "" } },
            },
          }))
        );
  const refuse = async (error: string): Promise<PrepareResult> => {
    await unlock();
    return { ok: false, error };
  };
  for (const sector of claimed) {
    const claim = sector.constructionFinancing!;
    const check = (loan: BankLoan | null) =>
      constructionBorrowerTransferRefusal({
        claim,
        loan,
        sectorId: sector._id.toHexString(),
        fromId: sector.corporationId.toHexString(),
        toId: toId.toHexString(),
        toCurrency,
      });
    const loan = loanById.get(claim.loanId) ?? null;
    const refusal = check(loan);
    if (refusal) return refuse(refusal);
    const key = constructionBorrowerTransferKey(claim.claimId, turn, operationKey);
    const owned = await acquireConstructionLoanLock(db, loan!, key);
    if (!owned)
      return refuse(
        "A construction loan in this transfer is being serviced or settled. Try again shortly."
      );
    transfers.push({
      sectorId: sector._id,
      claimId: claim.claimId,
      loanId: owned._id,
      fromId: sector.corporationId,
      toId,
      key,
    });
    const lockedRefusal = check(owned);
    if (lockedRefusal) return refuse(lockedRefusal);
  }
  return { ok: true, plan: planFor(transfers) };
}

/**
 * Finish a transfer after the caller's sector writes. Each loan follows its
 * site only where the site actually moved: a sector write that missed leaves
 * the loan with its original borrower. Either way the lock is released. Safe
 * to call more than once, and safe after a partial run of the caller.
 */
export async function settleConstructionBorrowerTransfers(
  db: Db,
  plan: Pick<ConstructionBorrowerTransferPlan, "transfers">
): Promise<{ moved: number }> {
  const { transfers } = plan;
  if (transfers.length === 0) return { moved: 0 };
  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      { _id: { $in: transfers.map((transfer) => transfer.sectorId) } },
      { projection: { corporationId: 1, constructionFinancing: 1 } }
    )
    .toArray();
  const sectorById = new Map(sectors.map((sector) => [sector._id.toHexString(), sector]));
  const ops: AnyBulkWriteOperation<BankLoan>[] = [];
  let moved = 0;
  for (const transfer of transfers) {
    const sector = sectorById.get(transfer.sectorId.toHexString());
    const claim = sector?.constructionFinancing;
    if (
      sector?.corporationId.equals(transfer.toId) &&
      claim?.claimId === transfer.claimId &&
      claim.borrowerId === transfer.toId.toHexString()
    ) {
      moved++;
      ops.push({
        updateOne: {
          filter: {
            _id: transfer.loanId,
            borrowerId: transfer.fromId,
            "constructionCollateral.claimId": transfer.claimId,
            "constructionCollateral.sectorId": transfer.sectorId,
          },
          update: { $set: { borrowerId: transfer.toId } },
        },
      });
    }
    ops.push({
      updateOne: {
        filter: { _id: transfer.loanId, constructionSettlementOwner: transfer.key },
        update: { $unset: { constructionSettlementOwner: "" } },
      },
    });
  }
  await db.collection<BankLoan>("bankLoans").bulkWrite(ops, { ordered: true });
  return { moved };
}

/**
 * A financed site carries one claim bound to its own sector row, so it cannot
 * be folded into another row of the same market. A financed survivor can take
 * an unfinanced donor in, because its own claim and borrower do not change,
 * but only while that claim is stable. Checked before any money moves.
 */
export async function securedSiteMergeRefusal(
  db: Db,
  sectors: readonly Pick<
    CorporateSector,
    | "_id"
    | "corporationId"
    | "stateId"
    | "sectorType"
    | "industryModel"
    | "mediaDiscriminator"
    | "constructionFinancing"
    | "constructionPropertyTransition"
  >[],
  toId: ObjectId,
  /** How the caller pairs a moving site with the survivor it merges into. */
  mergeKey: (
    sector: Pick<CorporateSector, "stateId" | "sectorType" | "industryModel" | "mediaDiscriminator">
  ) => string = (sector) =>
    [
      sector.stateId,
      sector.sectorType,
      sector.industryModel ?? "",
      sector.mediaDiscriminator ?? "",
    ].join("|")
): Promise<string | null> {
  const moving = sectors.filter((sector) => !sector.corporationId.equals(toId));
  if (moving.length === 0) return null;
  const survivors = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      {
        corporationId: toId,
        stateId: { $in: [...new Set(moving.map((sector) => sector.stateId))] },
        sectorType: { $in: [...new Set(moving.map((sector) => sector.sectorType))] },
      },
      {
        projection: {
          corporationId: 1,
          stateId: 1,
          countryId: 1,
          sectorType: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          constructionFinancing: 1,
          constructionPropertyTransition: 1,
        },
      }
    )
    .toArray();
  const lane = mergeKey;
  const survivorByLane = new Map(survivors.map((sector) => [lane(sector), sector]));
  for (const donor of moving) {
    const survivor = survivorByLane.get(lane(donor));
    if (!survivor || survivor._id.equals(donor._id)) continue;
    if (hasProtectedConstructionClaim(donor))
      return "A site in this transfer carries a construction loan, and the new owner already runs that market there. The two sites cannot be merged until the loan is repaid or the site is sold.";
    if (survivor.constructionPropertyTransition)
      return "The new owner's site in that market is in the middle of another ownership change. Try again shortly.";
    if (hasProtectedConstructionClaim(survivor)) {
      const refusal = constructionBorrowerTransferRefusal({
        claim: survivor.constructionFinancing!,
        loan: null,
        sectorId: survivor._id.toHexString(),
        fromId: survivor.corporationId.toHexString(),
        toId: survivor.corporationId.toHexString(),
        toCurrency: undefined,
      });
      if (refusal)
        return `The new owner's site in that market cannot take this one in yet. ${refusal}`;
    }
  }
  return null;
}

/**
 * Claim predicate for a merge survivor: a stable financed site keeps its own
 * claim and borrower while the donor's capacity folds in, and an unfinanced
 * survivor must stay unfinanced.
 */
export function mergeSurvivorConstructionFilter(
  survivor: Pick<
    CorporateSector,
    "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
  >
): Record<string, unknown> {
  if (!hasProtectedConstructionClaim(survivor)) return unprotectedConstructionPropertyFilter();
  return {
    $and: [
      { constructionPropertyTransition: { $exists: false } },
      transferableConstructionClaimFilter({
        claimId: survivor.constructionFinancing!.claimId,
        borrowerId: survivor.corporationId.toHexString(),
      }),
    ],
  };
}
