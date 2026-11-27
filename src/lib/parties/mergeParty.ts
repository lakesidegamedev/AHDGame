import { withSessionDb } from "@/lib/db/sessionDb";
import type { AnyBulkWriteOperation, Db, Document, ObjectId } from "mongodb";

import type { NPP } from "@/lib/db/types";

import { assertMergeEligibility, MergeEligibilityError } from "@/lib/parties/mergeEligibility";
import { withPartyTerritoryMutation } from "@/lib/parties/territoryMutation";

import type { StatePartyOrg } from "@/lib/db/types/statePartyOrg";
import type { StateRegistrationPool } from "@/lib/db/types/stateRegistrationPool";

import { selectMergeNppCull } from "@/lib/npp/mergeNppCap";
import { selectNationalMergeNppCull } from "@/lib/npp/rules/mergeNationalCap";
import { getPartyNppCapacity } from "@/lib/npp/partyCapacity";
import { notifyGovernorOfSenateVacancy } from "@/lib/governors/senateVacancy";
import { applyOptionalCountryScope } from "@/lib/elections/party/nationalPartyElectionScope";
import {
  deriveOrganizationShares,
  resolveOrganizationUnits,
} from "@/lib/parties/rules/organizationBucket";

import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { nationalPartyElectionsCollection } from "@/lib/db/repositories/nationalPartyElections";

import { nationalCommitteeElectionsCollection } from "@/lib/db/repositories/nationalCommitteeElections";
import { stateRegistrationPoolCollection } from "@/lib/db/repositories/stateRegistrationPool";

/** How a merger is admitted. Committee mergers use the defaults. */
export interface MergePartyOptions {
  /**
   * Require live geographic contact and preserved territory. A party folded
   * by party renewal joins its ideological neighbour wherever it sits.
   */
  requireAdjacency?: boolean;
  /**
   * Cull incoming NPPs over the per-region and national recruitment caps. A
   * fold keeps every NPP so no seat-holder is deleted by the move.
   */
  enforceNppCap?: boolean;
}

/**
 * Absorb `sourcePartyId` into `targetPartyId`: members, treasury, state org,
 * NPPs, live candidacies, elected seats and coalition slots move to the
 * target, and the source is marked defunct.
 */
export async function mergePartyInto(
  db: Db,
  sourcePartyId: ObjectId,
  targetPartyId: ObjectId,
  currentTurn: number,
  options: MergePartyOptions = {}
): Promise<void> {
  return withSessionDb(db, (tx) =>
    mergePartyIntoInTransaction(tx, sourcePartyId, targetPartyId, currentTurn, options)
  );
}

async function mergePartyIntoInTransaction(
  db: Db,
  sourcePartyId: ObjectId,
  targetPartyId: ObjectId,
  currentTurn: number,
  options: MergePartyOptions = {}
): Promise<void> {
  const requireAdjacency = options.requireAdjacency !== false;
  const enforceNppCap = options.enforceNppCap !== false;
  const [proposingParty, targetParty] = await Promise.all([
    politicalPartiesCollection(db).findOne({ _id: sourcePartyId }),
    politicalPartiesCollection(db).findOne({ _id: targetPartyId }),
  ]);
  if (!proposingParty) throw new Error("Proposing party not found");
  if (!targetParty) throw new Error("Target party not found");
  return withPartyTerritoryMutation(
    db,
    [
      { countryId: proposingParty.countryId, partyId: String(proposingParty.sequentialId) },
      { countryId: targetParty.countryId, partyId: String(targetParty.sequentialId) },
    ],
    async () => {
      // Another merger may have completed between the initial lookup and claim.
      // Use fresh party status, balances and membership after admission.
      const [proposingParty, targetParty] = await Promise.all([
        politicalPartiesCollection(db).findOne({ _id: sourcePartyId }),
        politicalPartiesCollection(db).findOne({ _id: targetPartyId }),
      ]);
      if (proposingParty?.isDefunct && proposingParty.mergedIntoPartyId?.equals(targetPartyId))
        return;
      if (
        !proposingParty ||
        !targetParty ||
        proposingParty._id.equals(targetParty._id) ||
        proposingParty.isDefunct ||
        targetParty.isDefunct ||
        proposingParty.countryId !== targetParty.countryId
      ) {
        throw new MergeEligibilityError(
          "A merger requires two active parties in the same country."
        );
      }
      // Check before moving anyone: incoming members must not validate their own merger.
      if (requireAdjacency) await assertMergeEligibility(db, proposingParty, targetParty);

      const proposingStrId = String(proposingParty.sequentialId);
      const targetStrId = String(targetParty.sequentialId);
      const countryId = proposingParty.countryId;
      const now = new Date();

      // Captured before step 1 re-points them: their live candidacies move in 4d.
      const absorbedCharacterIds = (
        await charactersCollection(db)
          .find({ party: proposingStrId, countryId }, { projection: { _id: 1 } })
          .toArray()
      ).map((c) => c._id as ObjectId);

      // 1. Transfer characters — move party membership, halve partyInfluence
      await charactersCollection(db).updateMany({ party: proposingStrId, countryId }, [
        {
          $set: {
            party: targetStrId,
            // Membership continues through a merger; keep the original tenure.
            partyInfluence: {
              $floor: { $multiply: [{ $ifNull: ["$partyInfluence", 0] }, 0.5] },
            },
          },
        },
        // The absorbed party is gone, so its founders carry no leadership
        // exemption into the surviving one (see leadershipTenure.ts).
        { $unset: "foundedPartyId" },
      ]);

      // 2. NPP transfer is deferred to step 4c — it must run *after* the state-org
      //    merge (step 4) so the per-state recruitment cap is sized off the
      //    surviving party's POST-merge organization.

      // 3. Transfer national treasury
      if (
        ![
          proposingParty.treasury ?? 0,
          targetParty.treasury ?? 0,
          (proposingParty.treasury ?? 0) + (targetParty.treasury ?? 0),
        ].every(Number.isFinite)
      )
        throw new Error("Invalid party treasury");
      if ((proposingParty.treasury ?? 0) !== 0) {
        await politicalPartiesCollection(db).updateOne(
          { _id: targetParty._id },
          { $inc: { treasury: proposingParty.treasury }, $set: { updatedAt: now } }
        );
      }

      // 4. Merge state org. Organization percentages are cached bucket shares, so
      // transfer half of the absorbed party's durable units rather than mutating
      // the percentage directly.
      const statePartyOrgCol = statePartyOrgCollection(db);
      const proposingOrgs = await statePartyOrgCol
        .find({ partyId: proposingStrId, countryId })
        .toArray();

      const affectedStateIds = [...new Set(proposingOrgs.map((org) => org.stateId))];
      const regionalRows =
        affectedStateIds.length > 0
          ? await statePartyOrgCol.find({ countryId, stateId: { $in: affectedStateIds } }).toArray()
          : [];
      const rowsByState = new Map<string, StatePartyOrg[]>();
      for (const row of regionalRows) {
        const rows = rowsByState.get(row.stateId) ?? [];
        rows.push(row);
        rowsByState.set(row.stateId, rows);
      }

      const targetOrgWrites: AnyBulkWriteOperation<StatePartyOrg>[] = [];
      for (const org of proposingOrgs) {
        const stateRows = rowsByState.get(org.stateId) ?? [org];
        const resolved = deriveOrganizationShares(
          stateRows.map((row) => ({
            id: row._id ?? `${row.stateId}_${row.partyId}`,
            organization: row.organization ?? 0,
            organizationUnits: row.organizationUnits,
            lastOrganizationBuildTurn: row.lastOrganizationBuildTurn,
          }))
        );
        const sourceId = org._id ?? `${org.stateId}_${proposingStrId}`;
        const sourceUnits =
          resolved.rows.find((row) => row.id === sourceId)?.organizationUnits ??
          resolveOrganizationUnits(org);
        const bonusUnits = Math.floor(sourceUnits * 0.5 * 1_000_000) / 1_000_000;
        const treasury = org.treasury ?? 0;
        if (!Number.isFinite(treasury)) throw new Error("Invalid regional party treasury");
        if (bonusUnits <= 0 && treasury === 0) continue;
        const targetOrgId = `${org.stateId}_${targetStrId}`;
        const target = stateRows.find(
          (row) => row._id === targetOrgId || row.partyId === targetStrId
        );
        if (
          !Number.isFinite(target?.treasury ?? 0) ||
          !Number.isFinite((target?.treasury ?? 0) + treasury)
        )
          throw new Error("Invalid regional party treasury");
        const targetUnits =
          resolved.rows.find((row) => row.id === (target?._id ?? targetOrgId))?.organizationUnits ??
          0;

        if (target) {
          targetOrgWrites.push({
            updateOne: {
              filter: { _id: target._id ?? targetOrgId },
              update: [
                {
                  $set: {
                    organizationUnits: {
                      $add: [
                        { $max: [{ $ifNull: ["$organizationUnits", targetUnits] }, 0] },
                        bonusUnits,
                      ],
                    },
                    treasury: { $add: [{ $ifNull: ["$treasury", 0] }, treasury] },
                    lastOrganizationBuildTurn: currentTurn,
                    hasPresence: bonusUnits > 0 || target.hasPresence === true,
                    updatedAt: now,
                  },
                },
              ],
            },
          });
        } else {
          // Create minimal state org record for target in this state
          targetOrgWrites.push({
            insertOne: {
              document: {
                _id: targetOrgId,
                countryId,
                stateId: org.stateId,
                partyId: targetStrId,
                organization: 0,
                organizationUnits: bonusUnits,
                lastOrganizationBuildTurn: currentTurn,
                chairId: null,
                viceChairId: null,
                treasurerId: null,
                treasury,
                stateTaxRate: 0,
                politicalStrength: 0,
                hasPresence: bonusUnits > 0,
                createdAt: now,
                updatedAt: now,
              },
            },
          });
        }
      }
      if (targetOrgWrites.length > 0) {
        await statePartyOrgCol.bulkWrite(targetOrgWrites, { ordered: false });
      }

      // 4b. Wipe the absorbed party's state footprint. The target kept 50% of each
      //     state org (transferred above); the *remainder* is not carried over.
      //     Release any registration back to the state's unregistered pool so the
      //     0..100 reg invariant is preserved (the merged party's lean is lost, not
      //     inherited), then delete the rows so the defunct party stops surfacing in
      //     state Org/Reg views.
      const registrationReleases = proposingOrgs.flatMap(
        (org): AnyBulkWriteOperation<StateRegistrationPool>[] => {
          const reg = typeof org.registration === "number" ? org.registration : 0;
          return reg > 0
            ? [
                {
                  updateOne: {
                    filter: { _id: `${countryId}_${org.stateId}` },
                    update: { $inc: { unregistered: reg }, $set: { updatedAt: now } },
                  },
                },
              ]
            : [];
        }
      );
      if (registrationReleases.length > 0) {
        await stateRegistrationPoolCollection(db).bulkWrite(registrationReleases, {
          ordered: false,
        });
      }
      await statePartyOrgCol.deleteMany({ partyId: proposingStrId, countryId });

      // Refresh the cached shares after the absorbed rows are gone. Unit filters
      // prevent this compatibility write from overwriting a concurrent Build Org
      // contribution.
      if (affectedStateIds.length > 0) {
        const remainingRows = await statePartyOrgCol
          .find({ countryId, stateId: { $in: affectedStateIds } })
          .toArray();
        const remainingByState = new Map<string, StatePartyOrg[]>();
        for (const row of remainingRows) {
          const rows = remainingByState.get(row.stateId) ?? [];
          rows.push(row);
          remainingByState.set(row.stateId, rows);
        }
        const shareWrites = [...remainingByState.values()].flatMap((rows) => {
          const result = deriveOrganizationShares(
            rows.map((row) => ({
              id: row._id,
              organization: row.organization ?? 0,
              organizationUnits: row.organizationUnits,
              lastOrganizationBuildTurn: row.lastOrganizationBuildTurn,
            }))
          );
          const sourceById = new Map(rows.map((row) => [row._id, row]));
          return result.rows.map((row) => {
            const source = sourceById.get(row.id);
            return {
              updateOne: {
                filter:
                  source?.organizationUnits === undefined
                    ? { _id: row.id, organizationUnits: { $exists: false } }
                    : { _id: row.id, organizationUnits: row.organizationUnits },
                update: {
                  $set: {
                    organization: row.organization,
                    ...(source?.organizationUnits === undefined
                      ? { organizationUnits: row.organizationUnits }
                      : {}),
                    updatedAt: now,
                  },
                },
              },
            };
          });
        });
        if (shareWrites.length > 0) await statePartyOrgCol.bulkWrite(shareWrites);
      }

      // 4c. Transfer NPPs with the per-state recruitment cap enforced. The target
      //     keeps all its own NPPs, even if already over a cap. Incoming active NPPs
      //     fill the remaining slots in each home state (strongest first). Any over the cap
      //     are hard-deleted so a merge can't stack a region past the limit a fresh
      //     recruit would face. Retired NPPs carry no cap weight and always re-point
      //     to the target for historical continuity.
      const proposingActiveNpps = await nppsCollection(db)
        .find(
          { party: proposingStrId, countryId, retiredAt: null },
          { projection: { homeState: 1, politicalInfluence: 1, favorability: 1 } }
        )
        .toArray();

      const selectCull = async (): Promise<ObjectId[]> => {
        // Surviving party's POST-merge org per state (re-read after step 4 merged it).
        const targetOrgs = await statePartyOrgCollection(db)
          .find({ partyId: targetStrId, countryId })
          .toArray();
        const targetOrgByState = new Map<string, number>(
          targetOrgs.map((o) => [o.stateId, o.organization ?? 0])
        );

        // Surviving party's existing active NPP count per state — these consume slots
        // before any incoming NPP does.
        const targetActiveNpps = await nppsCollection(db)
          .find(
            { party: targetStrId, countryId, retiredAt: null },
            { projection: { homeState: 1 } }
          )
          .toArray();
        const targetActiveCountByState = new Map<string, number>();
        for (const n of targetActiveNpps) {
          targetActiveCountByState.set(
            n.homeState,
            (targetActiveCountByState.get(n.homeState) ?? 0) + 1
          );
        }

        const { keep, cull } = selectMergeNppCull({
          proposingNpps: proposingActiveNpps,
          targetActiveCountByState,
          targetOrgByState,
        });
        // Members have already moved in step 1, so this counts the combined party's
        // distinct, non-banned active players at resolution, not at proposal time.
        const { maxNpps } = await getPartyNppCapacity(db, countryId, targetStrId, now);
        const toRank = (n: NPP) => ({
          id: n._id.toString(),
          politicalInfluence: n.politicalInfluence,
          favorability: n.favorability,
        });
        const nationalCull = new Set(
          selectNationalMergeNppCull({
            survivingNpps: targetActiveNpps.map((n) => ({ id: n._id.toString() })),
            incomingNpps: keep.map(toRank),
            maxNpps,
          })
        );
        return [
          ...cull.map((n) => n._id),
          ...keep.filter((n) => nationalCull.has(n._id.toString())).map((n) => n._id),
        ];
      };
      const cullIds = enforceNppCap ? await selectCull() : [];

      // Re-point every absorbed NPP that survives (kept active + all retired) to the
      // target in a single pass; the cull set is excluded.
      await nppsCollection(db).updateMany(
        { party: proposingStrId, countryId, _id: { $nin: cullIds } },
        { $set: { party: targetStrId } }
      );

      // Remove overflow from political service and clean its active electoral references.
      if (cullIds.length > 0) {
        const heldOfficials = await electedOfficialsCollection(db)
          .find({ nppId: { $in: cullIds } })
          .toArray();
        if (heldOfficials.length > 0) {
          await electedOfficialsCollection(db).deleteMany({
            _id: { $in: heldOfficials.map((o) => o._id) },
          });
          for (const o of heldOfficials) {
            if (o.officeType === "senate") {
              await notifyGovernorOfSenateVacancy(db, o.state, o.senateClass);
            }
          }
        }
        // Live NPP candidacies also use characterId; do not leave a deleted NPP
        // on the ballot or permit its campaign to continue accumulating votes.
        await electionCandidatesCollection<Document>(db).deleteMany({
          $or: [{ nppId: { $in: cullIds } }, { characterId: { $in: cullIds } }],
        });
        await campaignsCollection<Document>(db).updateMany(
          { candidateId: { $in: cullIds }, status: { $ne: "archived" } },
          {
            $set: {
              status: "archived",
              archivedAt: now,
              archivedReason: "removed",
              updatedAt: now,
            },
          }
        );
        // Retiring removes political capacity while preserving the actor's financial estate.
        await nppsCollection(db).updateMany(
          { _id: { $in: cullIds } },
          { $set: { party: targetStrId, retiredAt: now, currentOffice: null } }
        );
      }

      // 4d. Live candidacies follow their candidates. A candidacy keeps the party
      //     it was filed under, so one left on the absorbed party seats its winner
      //     back into the dead party when the race resolves. NPP
      //     candidacies carry the NPP's id as `characterId`. Selected by member
      //     rather than by country because legacy candidacies have no countryId.
      const cullIdSet = new Set(cullIds.map((id) => id.toString()));
      const movedCandidateIds = [
        ...absorbedCharacterIds,
        ...proposingActiveNpps.map((n) => n._id).filter((id) => !cullIdSet.has(id.toString())),
      ];
      if (movedCandidateIds.length > 0) {
        await electionCandidatesCollection<Document>(db).updateMany(
          { party: proposingStrId, status: "active", characterId: { $in: movedCandidateIds } },
          { $set: { party: targetStrId } }
        );
        await campaignsCollection<Document>(db).updateMany(
          {
            party: proposingStrId,
            candidateId: { $in: movedCandidateIds },
            status: { $ne: "archived" },
          },
          { $set: { party: targetStrId, updatedAt: now } }
        );
      }

      // 5. Transfer elected seats — re-point all of the absorbed party's elected
      //    officials (any chamber) to the target so its legislative seats move with
      //    it. Country-scoped: `party` (sequentialId) is not globally unique.
      await electedOfficialsCollection(db).updateMany(
        { party: proposingStrId, countryId },
        { $set: { party: targetStrId, updatedAt: now } }
      );

      // 6. Collapse the absorbed party out of any coalitions — transfer its slot to
      //    the target and strip dangling invites/requests addressed to it.
      const { absorbPartyIntoCoalitions } = await import("@/lib/coalitions/absorbParty");
      await absorbPartyIntoCoalitions(db, { countryId, proposingParty, targetParty, now });

      // 7. Rebuild the parliamentary seat snapshot from the re-pointed officials and
      //    updated coalition membership. Only when the country tracks a government
      //    formation (parliamentary systems); presidential systems read seats live.
      const govCol = governmentFormationsCollection(db);
      const gov = await govCol.findOne({ _id: countryId });
      if (gov) {
        const govSet: Record<string, unknown> = {};
        if (gov.governingPartyId === proposingStrId) govSet.governingPartyId = targetStrId;
        if (
          Array.isArray(gov.coalitionPartyIds) &&
          gov.coalitionPartyIds.includes(proposingStrId)
        ) {
          govSet.coalitionPartyIds = Array.from(
            new Set(gov.coalitionPartyIds.map((id) => (id === proposingStrId ? targetStrId : id)))
          );
        }
        if (Object.keys(govSet).length > 0) {
          await govCol.updateOne({ _id: countryId }, { $set: { ...govSet, updatedAt: now } });
        }
        const { updateParliamentaryGovernmentSeats } =
          await import("@/lib/turn/parliamentaryGovernment");
        await updateParliamentaryGovernmentSeats(db, countryId);
      }

      // 8. Recount target party member count after transfer
      const newMemberCount = await charactersCollection(db).countDocuments({
        party: targetStrId,
        countryId: targetParty.countryId,
      });

      // 9. Defunct the proposing party — clear leadership and mark dissolved
      await politicalPartiesCollection(db).updateOne(
        { _id: proposingParty._id },
        {
          $set: {
            isDefunct: true,
            defunctAtTurn: currentTurn,
            mergedIntoPartyId: targetParty._id,
            chairId: null,
            viceChairId: null,
            treasurerId: null,
            committeeIds: [],
            memberCount: 0,
            treasury: 0,
            updatedAt: now,
          },
        }
      );

      // 9b. Close the absorbed party's in-flight internal races, which would
      //     otherwise seat a chair or committee of a party that no longer exists.
      const openRaces = applyOptionalCountryScope(
        { partyId: proposingStrId, status: "voting" },
        countryId
      );
      const cancelRace = { $set: { status: "cancelled", updatedAt: now } };
      await Promise.all([
        nationalPartyElectionsCollection<Document>(db).updateMany(openRaces, cancelRace),
        nationalCommitteeElectionsCollection<Document>(db).updateMany(openRaces, cancelRace),
      ]);

      // 10. Update target party member count
      await politicalPartiesCollection(db).updateOne(
        { _id: targetParty._id },
        { $set: { memberCount: newMemberCount, updatedAt: now } }
      );
    }
  );
}
