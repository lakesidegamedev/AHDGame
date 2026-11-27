import { ObjectId, type Db } from "mongodb";
import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import type { CountryId } from "@/lib/constants/countries";
import type { NPP } from "@/lib/db/types";
import type { ProposalVoteRecord } from "@/lib/db/types/internationalOrganization";

import { proposeOrganizationLegislation } from "@/lib/internationalOrganizations/commands/proposeLegislation";
import {
  getDiplomaticActionsRemaining,
  spendDiplomaticAction,
} from "@/lib/internationalOrganizations/diplomaticActions";
import { upsertPendingOrganizationVote } from "@/lib/internationalOrganizations/voteWrite";
import { imposeEmbargo, liftEmbargo } from "@/lib/trade/commands/embargoCommands";
import { TRADE_EMBARGO_MAX_DURATION_TURNS } from "@/lib/trade/constants";
import type { ForeignPolicyChoice } from "./foreignPolicy";
import { executeAutonomousWarChoice } from "./autonomousWarCommands";
import { proposeNppForeignPolicyBill } from "./proposeNppForeignPolicyBill";
import { tradeEmbargoesCollection } from "@/lib/db/repositories/tradeEmbargoes";
import { organizationLegislationCollection } from "@/lib/db/repositories/organizationLegislation";
import { organizationMembershipProposalsCollection } from "@/lib/db/repositories/organizationMembershipProposals";
import { organizationLeadershipElectionsCollection } from "@/lib/db/repositories/organizationLeadershipElections";

export interface ForeignPolicyExecutionResult {
  acted: boolean;
  note: string;
}

const DEFAULT_AID_AMOUNT = 5_000_000;

function rejected(note: string): ForeignPolicyExecutionResult {
  return { acted: false, note };
}

async function executeVote(
  db: Db,
  countryId: CountryId,
  head: NPP,
  choice: ForeignPolicyChoice,
  currentTurn: number,
  now: Date
): Promise<ForeignPolicyExecutionResult> {
  if (!choice.pendingItemId || !choice.pendingKind) {
    return rejected("The selected organization vote has no pending item identity.");
  }
  if (!ObjectId.isValid(choice.pendingItemId)) {
    return rejected("The selected organization vote has an invalid pending item identity.");
  }

  const vote: ProposalVoteRecord = {
    countryId,
    characterId: head._id,
    characterName: head.name,
    vote: choice.type === "vote_org_yes" ? "yes" : "no",
    castAt: now,
    castOnTurn: currentTurn,
  };
  const itemId = new ObjectId(choice.pendingItemId);
  const result =
    choice.pendingKind === "membership"
      ? await upsertPendingOrganizationVote(
          organizationMembershipProposalsCollection(db),
          itemId,
          vote
        )
      : choice.pendingKind === "legislation"
        ? await upsertPendingOrganizationVote(organizationLegislationCollection(db), itemId, vote)
        : await upsertPendingOrganizationVote(
            organizationLeadershipElectionsCollection(db),
            itemId,
            vote
          );

  return result.matchedCount > 0
    ? { acted: true, note: `Cast an organization ${vote.vote} vote.` }
    : rejected("The organization item was no longer pending when the vote was cast.");
}

async function executeOrganizationProposal(
  db: Db,
  countryId: CountryId,
  head: NPP,
  choice: ForeignPolicyChoice,
  currentTurn: number
): Promise<ForeignPolicyExecutionResult> {
  if (!choice.organizationId || !choice.targetCountryId) {
    return rejected("The selected organization proposal is missing its organization or target.");
  }

  const { organizationId, targetCountryId } = choice;
  const result = await withAtomicResult(db, async (db) => {
    const replay = await withTurnValueSettlement(
      db,
      "npp-organization-proposal",
      currentTurn,
      async (db) => {
        if ((await getDiplomaticActionsRemaining(db, countryId, currentTurn)) < 1) {
          return { ok: false as const, note: "No diplomatic actions remain this turn." };
        }

        const actor = { characterId: head._id, characterName: head.name };
        const shared = { db, countryId, orgId: organizationId, actor };
        const result =
          choice.type === "propose_fta"
            ? await proposeOrganizationLegislation({
                ...shared,
                input: {
                  type: "free_trade_agreement",
                  parties: [countryId, targetCountryId],
                },
              })
            : choice.type === "propose_sanctions"
              ? await proposeOrganizationLegislation({
                  ...shared,
                  input: {
                    type: "sanctions",
                    targetCountryId: targetCountryId,
                    commodity: "all",
                  },
                })
              : choice.type === "propose_aid"
                ? await proposeOrganizationLegislation({
                    ...shared,
                    input: {
                      type: "aid_package",
                      recipientCountryId: targetCountryId,
                      amount: DEFAULT_AID_AMOUNT,
                    },
                  })
                : choice.type === "support_war"
                  ? await proposeOrganizationLegislation({
                      ...shared,
                      input: {
                        type: "aid_package",
                        recipientCountryId: targetCountryId,
                        amount: DEFAULT_AID_AMOUNT,
                        description: choice.conflictId
                          ? `Material support for the allied war effort in ${choice.conflictId}.`
                          : "Material support for an allied war effort.",
                      },
                    })
                  : choice.type === "join_war"
                    ? choice.conflictId && choice.conflictSide
                      ? await proposeOrganizationLegislation({
                          ...shared,
                          input: {
                            type: "join_conflict",
                            theaterId: choice.conflictId,
                            side: choice.conflictSide,
                          },
                        })
                      : { ok: false as const, error: "The war-entry choice has no conflict side." }
                    : await proposeOrganizationLegislation({
                        ...shared,
                        input: {
                          type: "joint_statement",
                          subjectCountryId: targetCountryId,
                          stance: choice.type === "condemn_country" ? "condemn" : "endorse",
                        },
                      });

        if (!result.ok) return { ok: false as const, note: result.error };
        const spent = await spendDiplomaticAction(db, countryId, currentTurn);
        if (!spent.ok)
          return { ok: false as const, note: "No diplomatic actions remain this turn." };
        return {
          ok: true as const,
          note: `Tabled organization legislation ${result.legislationId}.`,
        };
      },
      { sourceKey: `${currentTurn}:${countryId}:${head._id.toHexString()}` }
    );
    return replay;
  });
  return { acted: result.ok, note: result.note };
}

async function executeEmbargo(
  db: Db,
  countryId: CountryId,
  head: NPP,
  choice: ForeignPolicyChoice,
  currentTurn: number
): Promise<ForeignPolicyExecutionResult> {
  if (!choice.targetCountryId) return rejected("The embargo choice has no target country.");
  if (choice.type === "impose_embargo") {
    const result = await imposeEmbargo(db, {
      sourceCountry: countryId,
      targetCountry: choice.targetCountryId,
      commodity: "all",
      direction: "both",
      mode: "block",
      durationTurns: TRADE_EMBARGO_MAX_DURATION_TURNS,
      currentTurn,
      createdBy: head._id,
    });
    return result.ok
      ? { acted: true, note: `Imposed temporary embargo ${result.embargoId.toString()}.` }
      : rejected(result.error);
  }

  const embargo = await tradeEmbargoesCollection(db).findOne({
    sourceCountry: countryId,
    targetCountry: choice.targetCountryId,
    origin: "minister",
    $or: [{ expiresTurn: { $exists: false } }, { expiresTurn: { $gte: currentTurn } }],
  });
  if (!embargo) return rejected("No active ministerial embargo can be lifted for that target.");
  const result = await liftEmbargo(db, embargo._id, countryId);
  return result.ok
    ? { acted: true, note: `Lifted temporary embargo ${result.embargoId.toString()}.` }
    : rejected(result.error);
}

/**
 * Execute one already-scored autonomous foreign-policy choice through existing
 * domain commands. Tariff choices become ordinary national bills rather than
 * bypassing the country's legislature.
 */
export async function executeForeignPolicyChoice(
  db: Db,
  countryId: CountryId,
  head: NPP,
  choice: ForeignPolicyChoice,
  currentTurn: number,
  now: Date
): Promise<ForeignPolicyExecutionResult> {
  try {
    if (choice.type === "vote_org_yes" || choice.type === "vote_org_no") {
      return executeVote(db, countryId, head, choice, currentTurn, now);
    }
    if (choice.type === "conduct_war" || choice.type === "seek_peace") {
      return executeAutonomousWarChoice(db, countryId, head, choice, currentTurn);
    }
    if (
      choice.type === "propose_fta" ||
      choice.type === "propose_sanctions" ||
      choice.type === "propose_aid" ||
      choice.type === "endorse_country" ||
      choice.type === "condemn_country" ||
      choice.type === "support_war" ||
      choice.type === "join_war"
    ) {
      return executeOrganizationProposal(db, countryId, head, choice, currentTurn);
    }
    if (choice.type === "impose_embargo" || choice.type === "lift_embargo") {
      return executeEmbargo(db, countryId, head, choice, currentTurn);
    }
    if (!choice.targetCountryId) return rejected("The tariff choice has no target country.");
    const bill = await proposeNppForeignPolicyBill(
      db,
      countryId,
      head,
      choice.type,
      choice.targetCountryId,
      currentTurn,
      now
    );
    return bill.ok
      ? { acted: true, note: `Introduced national trade bill ${bill.billId}.` }
      : rejected(bill.reason);
  } catch (error) {
    return rejected(error instanceof Error ? error.message : String(error));
  }
}
