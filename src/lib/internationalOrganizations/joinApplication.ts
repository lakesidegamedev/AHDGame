import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { WorldEntityId } from "@/lib/world/worldEntityManifest";
import type { Bill } from "@/lib/db/types";
import type { BillStatus } from "@/lib/db/types/legislation";
import {
  getOrganizationLegislationCollection,
  getOrganizationMembershipsCollection,
  getOrganizationProposalsCollection,
} from "@/lib/db/collections";
import {
  isMember,
  loadOrganizationDef,
  recordOrgHistoryEvent,
} from "@/lib/internationalOrganizations/service";
import { removeOrganizationMembership } from "@/lib/internationalOrganizations/withdrawalBills";
import { clearOrganizationWithdrawal } from "@/lib/internationalOrganizations/withdrawalTombstone";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { rivalBlocOrgsFor } from "@/lib/world/blocMembership";
import { liftOrganizationSanctions } from "@/lib/internationalOrganizations/sanctions";
import { PRESET_YEAR, DEFAULT_PRESET } from "@/lib/constants/alignmentSeeds";
import { loadAlignmentTopology } from "@/lib/alignment/topology";
import { resolveAlignmentEra } from "@/lib/constants/alignmentEras";
import { INTERNATIONAL_ORGANIZATIONS } from "@/lib/constants/internationalOrganizations";
import { billsCollection } from "@/lib/db/repositories/bills";

/**
 * Parallel-join coordination. A country is admitted only when BOTH gates pass:
 * the org's unanimous member vote (`orgApproved`) AND the domestic Join bill
 * (`domesticApproved`, read live from the linked bill's status). If either side
 * finishes as a failure, the still-pending counterpart is cancelled with a
 * recorded reason. The arbiter is idempotent — safe to call from the membership
 * turn resolver (which polls it) and the Join bill's enactment effect.
 */

// BillStatus terminal states (legislation.ts): success = "signed" | "veto_override";
// failure = "failed" | "vetoed" | "override_failed" | "withdrawn" | "filibustered".
const BILL_PASSED_STATUSES = new Set<string>(["signed", "veto_override"]);
const BILL_FAILED_STATUS_LIST: BillStatus[] = [
  "failed",
  "vetoed",
  "override_failed",
  "withdrawn",
  "filibustered",
];
const BILL_FAILED_STATUSES = new Set<string>(BILL_FAILED_STATUS_LIST);

/**
 * Admit a country to an org (idempotent upsert of a membership).
 *
 * `WorldEntityId`, not `CountryId`: a proxy war's hosts are world entities — North
 * and South Vietnam are the countries the war is fought over and neither is a
 * playable `CountryId` — and resolving one takes them into the winner's bloc. Every
 * real country id remains a valid value.
 */
export async function admitMember(
  db: Db,
  organizationId: string,
  countryId: WorldEntityId,
  currentTurn: number,
  opts?: { status?: "founding" | "active" }
): Promise<void> {
  await leaveRivalBlocs(db, organizationId, countryId, currentTurn);
  await liftOwnSanctionsAgainst(db, organizationId, countryId);
  const memberships = await getOrganizationMembershipsCollection(db);
  await memberships.updateOne(
    { organizationId, countryId },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        organizationId,
        countryId,
        // "founding" for empty-org accession — the joiner effectively founds
        // the org; everything else is a normal "active" admission.
        status: opts?.status ?? "active",
        joinedAt: new Date(),
        joinedTurn: currentTurn,
      },
    },
    { upsert: true }
  );
  // Re-joining clears any prior withdrawal tombstone, so a future withdrawal can
  // re-tombstone and the self-heal treats this member as legitimately present.
  await clearOrganizationWithdrawal(db, organizationId, countryId);
}

/**
 * ONE COUNTRY, ONE BLOC. Give up the rival alliance's row before taking this one.
 *
 * Called from `admitMember` because that is the single chokepoint every
 * accession runs through; a rule enforced at four call sites will be missed
 * at the fifth.
 *
 * ⚠️ BEFORE the insert. `loadBlocMembership` writes `out[countryId] = bloc`
 * per row with no precedence, so a country in both poles reads as whichever
 * doc Mongo returns last. A throw between the two steps must leave the
 * country in NEITHER pole (wrong but deterministic) rather than BOTH.
 *
 * Silent no-op for orgs that do not govern accession: joining the UN costs a
 * country nothing it already holds.
 */
async function leaveRivalBlocs(
  db: Db,
  organizationId: string,
  countryId: WorldEntityId,
  currentTurn: number
): Promise<void> {
  // A proxy war's hosts are world entities. North Vietnam holds no alliance rows
  // to give up and is not a `CountryId` the withdrawal path accepts.
  if (!(countryId in COUNTRY_CONFIGS)) return;

  const preset = await getGameStatePresetOrDefault(db);
  const year = PRESET_YEAR[preset] ?? PRESET_YEAR[DEFAULT_PRESET];
  // Ordinary built-ins have no accession pole and need no topology read.
  if (
    organizationId in INTERNATIONAL_ORGANIZATIONS &&
    !resolveAlignmentEra(year).channels.some(
      (channel) => channel.organizationId === organizationId && channel.alignmentAccession
    )
  ) {
    return;
  }
  const topology = await loadAlignmentTopology(db, year);
  for (const rivalId of rivalBlocOrgsFor(preset, organizationId, topology.channels)) {
    // Checked, because `removeOrganizationMembership` writes a withdrawal
    // tombstone and a history line for every remaining member. Calling it for a
    // country that was never in the rival would announce a departure that never
    // happened, and the tombstone would then block a legitimate accession later.
    if (!(await isMember(db, rivalId as Parameters<typeof isMember>[1], countryId as CountryId)))
      continue;
    const def = await loadOrganizationDef(db, rivalId as Parameters<typeof loadOrganizationDef>[1]);
    await removeOrganizationMembership(
      db,
      countryId as CountryId,
      rivalId,
      def?.name ?? rivalId,
      currentTurn
    );
  }
}

/**
 * An organisation does not sanction its own member, so admitting one settles
 * the quarrel: terminate any sanctions this org holds against the joiner and
 * lift the embargoes they fanned out.
 *
 * `proposeLegislation` refuses to TABLE sanctions against a member; accession
 * is the other door, and nothing was watching it. Otherwise other members go
 * on embargoing a country they just voted in, and the alignment phase docks
 * the bloc's own standing for sanctioning one of its own.
 *
 * ⚠️ BEFORE the insert, like `leaveRivalBlocs`: a throw between the two steps
 * must leave a non-member whose sanctions were lifted early, not a member
 * under its own organisation's embargo.
 *
 * Same teardown as `expireActiveSanctions`: lift embargoes, then mark the
 * resolution terminated.
 */
async function liftOwnSanctionsAgainst(
  db: Db,
  organizationId: string,
  countryId: WorldEntityId
): Promise<void> {
  const legislation = await getOrganizationLegislationCollection(db);
  const standing = await legislation
    .find({
      organizationId,
      type: "sanctions",
      status: "active",
      sanctionsTargetCountryId: countryId,
    } as Parameters<typeof legislation.find>[0])
    .toArray();
  const now = new Date();
  for (const resolution of standing) {
    await liftOrganizationSanctions(db, resolution._id);
    await legislation.updateOne(
      { _id: resolution._id },
      { $set: { status: "terminated", terminatedAt: now } }
    );
  }
}

/**
 * Decide a parallel-join application from its current state. No-op unless a
 * terminal decision is reachable.
 */
export async function resolveJoinApplication(
  db: Db,
  proposalId: ObjectId,
  currentTurn: number
): Promise<void> {
  const proposals = await getOrganizationProposalsCollection(db);
  const proposal = await proposals.findOne({ _id: proposalId });
  if (!proposal || proposal.status !== "pending") return;

  const organizationId = proposal.organizationId;
  const country = proposal.proposingCountryId as CountryId;
  const countryName = COUNTRY_CONFIGS[country]?.name ?? country;

  // Read the linked Join bill's live status (poll).
  let billStatus: string | undefined;
  if (proposal.domesticBillId) {
    const bill = await billsCollection(db).findOne(
      { _id: proposal.domesticBillId },
      { projection: { status: 1 } }
    );
    billStatus = bill?.status;
  }

  const orgApproved = proposal.orgApproved === true;
  const orgRejected = proposal.orgApproved === false;
  const domesticApproved =
    proposal.domesticApproved === true ||
    (billStatus ? BILL_PASSED_STATUSES.has(billStatus) : false);
  const domesticFailed =
    proposal.domesticApproved === false ||
    (billStatus ? BILL_FAILED_STATUSES.has(billStatus) : false);

  // Failure on either side → cancel the application + the still-pending counterpart.
  if (orgRejected || domesticFailed) {
    const reason = orgRejected ? "Members declined admission." : "Domestic ratification failed.";
    await proposals.updateOne(
      { _id: proposalId },
      {
        $set: {
          status: "cancelled",
          cancelledReason: reason,
          resolvedAt: new Date(),
          resolvedOnTurn: currentTurn,
        },
      }
    );
    // Cancel the linked bill only if it's still in progress (i.e. the org side failed).
    if (proposal.domesticBillId && !domesticFailed) {
      await billsCollection(db).updateOne(
        { _id: proposal.domesticBillId, status: { $nin: BILL_FAILED_STATUS_LIST } },
        { $set: { status: "failed", updatedAt: new Date() } }
      );
    }
    await recordOrgHistoryEvent(
      db,
      country,
      currentTurn,
      `${countryName}'s application to ${organizationId} failed: ${reason}`,
      { organizationId, proposalId: proposalId.toString() }
    );
    return;
  }

  // Both gates passed → admit.
  if (orgApproved && domesticApproved) {
    await admitMember(db, organizationId, country, currentTurn, {
      status: proposal.orgVoteExempt ? "founding" : "active",
    });
    await proposals.updateOne(
      { _id: proposalId },
      { $set: { status: "approved", resolvedAt: new Date(), resolvedOnTurn: currentTurn } }
    );
    await recordOrgHistoryEvent(
      db,
      country,
      currentTurn,
      `${countryName} admitted to ${organizationId}.`,
      { organizationId, proposalId: proposalId.toString() }
    );
  }
  // Otherwise one side is still pending — leave the proposal open.
}
