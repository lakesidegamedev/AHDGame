import { northernIrelandAssemblyAllows } from "@/lib/countries/uk/northernIreland/service";
import type { Db } from "mongodb";
import {
  getCountryConfig,
  getSubNationalLegislatureKey,
  type CountryId,
} from "@/lib/constants/countries";
import type { AuthUserWithCharacter } from "@/lib/auth";
import { STATE_TERMINAL_STATUSES } from "@/lib/congress/billProposalLimits";
import type { Character, ElectedOfficial, PoliticalParty, StateBill } from "@/lib/db/types";
import { isBannedParty } from "@/lib/turn/onePartyConstraints";
import { getCountryState } from "@/lib/countryState";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import { BILL_PROPOSE_ACTION_COST, getProvisionCostTotal } from "@shared/constants/legislation";
import type { LegislatureCommandResult } from "@/lib/legislature/commands/types";
import { getGameState } from "@/lib/gameState";
import { snapshotPolicyProvisionsInPlace } from "@/lib/legislature/provisionEnrichment";
import { validateStateBillProvisions } from "@/lib/legislature/commands/validateStateBillProvisions";

const VOTING_DURATION_HOURS = 24;

export interface ProposeStateBillInput {
  title: string;
  summary: string;
  category?: string;
  legislationTypeId?: string;
  effectDirection?: number;
  provisions?: unknown[];
  adminOverride?: boolean;
}

export async function proposeStateBill(
  db: Db,
  countryId: CountryId,
  stateId: string,
  user: AuthUserWithCharacter,
  input: ProposeStateBillInput
): Promise<LegislatureCommandResult> {
  stateId = stateId.toUpperCase();
  if (!(await northernIrelandAssemblyAllows(db, countryId, stateId))) {
    return {
      status: 403,
      body: {
        error:
          "Northern Ireland's devolved institutions are suspended pending a ratified settlement.",
      },
    };
  }
  const now = new Date();
  const postCountryConfig = getCountryConfig(countryId);
  const {
    title,
    summary,
    category,
    legislationTypeId,
    effectDirection,
    provisions,
    adminOverride,
  } = input;

  const character = user.character;
  if (!character) {
    return { status: 400, body: { error: "No character found" } };
  }

  // One-party-state guard: banned parties cannot propose bills.
  // Reads runtime governmentType so post-Stage-4 conversion immediately
  // lifts the banned-party restriction.
  const runtimeState = await getCountryState(db, countryId);
  if (runtimeState.governmentType === "onePartyState" && character.party) {
    const sponsorParty = await db
      .collection<PoliticalParty>("politicalParties")
      .findOne({ sequentialId: parseInt(character.party, 10), countryId });
    // RUNTIME shape, not `postCountryConfig` — see the note in `nationalBillActions`.
    if (isBannedParty({ governmentType: runtimeState.governmentType }, sponsorParty)) {
      return {
        status: 403,
        body: { error: "Banned parties cannot propose legislation." },
      };
    }
  }

  if (!adminOverride || !user.isAdmin) {
    const existingActiveBill = await db.collection<StateBill>("stateBills").findOne({
      sponsorId: character._id,
      stateId,
      status: { $nin: STATE_TERMINAL_STATUSES },
    });
    if (existingActiveBill) {
      return {
        status: 403,
        body: {
          error:
            "You already have a bill in progress in this legislature. Wait for it to resolve before proposing another.",
        },
      };
    }
  }

  if (adminOverride) {
    if (!user.isAdmin) {
      return { status: 403, body: { error: "Admin access required" } };
    }
  } else {
    const subNationalOffice = getSubNationalLegislatureKey(countryId);
    const official = await db.collection<ElectedOfficial>("electedOfficials").findOne({
      officeType: subNationalOffice,
      state: stateId,
      characterId: character._id,
      countryId,
    });
    if (!official) {
      return {
        status: 403,
        body: {
          error: `You must hold ${postCountryConfig.subNationalChamber?.name ?? "State Senate"} seats in this region to propose bills`,
        },
      };
    }
  }

  const votingEndsAt = new Date(now.getTime() + VOTING_DURATION_HOURS * 3_600_000);
  const gameStateForTurn = await getGameState(db);
  const votingEndsOnTurn = (gameStateForTurn?.currentTurn ?? 0) + VOTING_DURATION_HOURS;
  const validation = await validateStateBillProvisions(db, {
    countryId,
    stateId,
    gameState: gameStateForTurn,
    category,
    provisions,
  });
  if (!validation.ok) {
    return { status: validation.status, body: { error: validation.error } };
  }
  const { provisions: sanitizedProvisions, influenceProvisionCount } = validation;

  const npiCost = getProvisionCostTotal(influenceProvisionCount);
  const actionCost = BILL_PROPOSE_ACTION_COST;
  const currentNational = character.nationalInfluence ?? 0;

  // Freeze the proposed and current option labels. Without this the bill detail
  // page re-reads the live law on every render, so once the bill enacts the
  // current-law box shows the bill's own outcome and the bill looks like it
  // re-passed the law already in force.
  //
  // Placed after every validation gate, so a proposal about to be rejected does
  // not pay for the catalog and policy lookups, and BEFORE the action/influence
  // charge, so a failure here cannot leave the sponsor billed for a bill that was
  // never inserted. Only the insert below has a refund path.
  //
  // It must still run AFTER stampTaxSliderProvisions: a slider provision carries
  // a synthetic "rate:" option id that resolves to no seeded option, so the
  // snapshot pass leaves its already-stamped labels alone.
  if (sanitizedProvisions && sanitizedProvisions.length > 0) {
    await snapshotPolicyProvisionsInPlace(db, sanitizedProvisions, {
      scope: "region",
      countryId,
      regionId: stateId,
    });
  }

  if (!(adminOverride && user.isAdmin)) {
    const currentActions = character.actions ?? 0;
    if (currentActions < actionCost) {
      return {
        status: 400,
        body: {
          error: `Proposing a bill costs ${actionCost} action points (you have ${currentActions}).`,
        },
      };
    }
    if (npiCost > 0 && currentNational < npiCost) {
      return {
        status: 400,
        body: {
          error: `This bill costs ${npiCost} national political influence (you have ${currentNational.toFixed(0)}).`,
        },
      };
    }
    const spendResult = await db.collection<Character>("characters").updateOne(
      {
        _id: character._id,
        actions: { $gte: actionCost },
        ...(npiCost > 0 ? { nationalInfluence: { $gte: npiCost } } : {}),
      },
      {
        $set: {
          updatedAt: now,
        },
        $inc: {
          actions: -actionCost,
          ...(npiCost > 0 ? { nationalInfluence: -npiCost } : {}),
        },
      }
    );
    if (spendResult.modifiedCount === 0) {
      return {
        status: 409,
        body: { error: "Your actions or national influence changed. Please try again." },
      };
    }
  }

  const bill: Omit<StateBill, "_id"> = {
    stateId,
    countryId,
    title: title.trim(),
    summary: summary.trim(),
    ...(category ? { category } : {}),
    sponsorId: character._id,
    sponsorName: character.name,
    sponsorParty: character.party,
    ...(adminOverride && user.isAdmin ? { adminProposed: true } : {}),
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    legislationTypeId,
    effectDirection,
    provisions: sanitizedProvisions,
    ...(npiCost > 0 ? { proposalNpiCost: npiCost } : {}),
    ...(!(adminOverride && user.isAdmin) ? { proposalActionCost: actionCost } : {}),
    proposedAt: now,
    votingStartedAt: now,
    votingEndsAt,
    votingEndsOnTurn,
    createdAt: now,
    updatedAt: now,
  };

  let result;
  try {
    result = await db.collection<StateBill>("stateBills").insertOne(bill as StateBill);
  } catch (error) {
    if (!(adminOverride && user.isAdmin)) {
      await db.collection<Character>("characters").updateOne(
        { _id: character._id },
        {
          $inc: {
            actions: actionCost,
            ...(npiCost > 0 ? { nationalInfluence: npiCost } : {}),
          },
          $set: { updatedAt: new Date() },
        }
      );
    }
    throw error;
  }

  let budget: {
    totalBudget: number;
    enactedBillCosts: number;
    surplus: number;
    isOverBudget: boolean;
    turnsOverBudget: number;
  } | null = null;
  if (postCountryConfig.subNationalChamber?.regionalModel) {
    const budgetDoc = await db
      .collection<RegionalBudget>("regionalBudgets")
      .findOne({ _id: stateId });
    if (budgetDoc) {
      budget = {
        totalBudget: budgetDoc.totalBudget,
        enactedBillCosts: budgetDoc.enactedBillCosts,
        surplus: budgetDoc.surplus,
        isOverBudget: budgetDoc.isOverBudget,
        turnsOverBudget: budgetDoc.turnsOverBudget,
      };
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      billId: result.insertedId.toString(),
      budget,
    },
  };
}
