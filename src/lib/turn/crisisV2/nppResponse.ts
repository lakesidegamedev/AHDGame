import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { resolveRatioGdp } from "@/lib/budget/gdpDenominator";
import { commitLeverUse } from "@/lib/crises/levers/leverCommand";
import { leverBlock } from "@/lib/crises/levers/availability";
import {
  NPP_EXECUTIVE_ROLES,
  chooseNppLevers,
  interventionismFromPersonality,
  seededRng,
} from "@/lib/crises/v2/nppResponse";
import type { CrisisRole } from "@/lib/crises/v2/types";
import { loadCountryTiers } from "@/lib/country/countryTier";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import type { CrisisLeverUse } from "@/lib/db/types/crisis";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { logger } from "@/lib/observability/logger";
import { officeHolderProvider } from "./holderProviders";
import { getCrisisDefinition } from "./registry";
import { loadActiveCrisisDocs, resolveCrisisCountries } from "./spillover";

const COMPONENT = "crisisV2NppResponse";

/** Lever pulls NPP governments make across the whole world in one turn. */
export const MAX_NPP_PULLS_PER_TURN = 12;

const DEFAULT_INTERVENTIONISM = 0.5;

interface Government {
  headNppId: ObjectId;
  interventionism: number;
}

async function loadGovernments(
  db: Db,
  countryIds: readonly string[]
): Promise<Map<string, Government>> {
  const formations = await getGovernmentFormationsCollection(db)
    .find(
      { _id: { $in: [...countryIds] as CountryId[] }, status: "formed" },
      { projection: { presidentNppId: 1, pmNppId: 1 } }
    )
    .toArray();
  const headByCountry = new Map<string, ObjectId>();
  for (const formation of formations) {
    const head = formation.presidentNppId ?? formation.pmNppId ?? null;
    if (head) headByCountry.set(String(formation._id), head);
  }
  if (headByCountry.size === 0) return new Map();
  const heads = await (
    await getNppsCollection(db)
  )
    .find({ _id: { $in: [...headByCountry.values()] } }, { projection: { personality: 1 } })
    .toArray();
  const personality = new Map(heads.map((npp) => [npp._id.toString(), npp.personality]));
  const result = new Map<string, Government>();
  for (const [countryId, headNppId] of headByCountry) {
    const traits = personality.get(headNppId.toString());
    result.set(countryId, {
      headNppId,
      interventionism: traits ? interventionismFromPersonality(traits) : DEFAULT_INTERVENTIONISM,
    });
  }
  return result;
}

interface Purse {
  treasuryBalance: number;
  output?: number;
  approval: number;
}

async function loadPurses(db: Db, countryIds: readonly string[]): Promise<Map<string, Purse>> {
  const [budgets, approvals] = await Promise.all([
    (await getFederalBudgetCollection(db))
      .find(
        { countryId: { $in: [...countryIds] as CountryId[] } },
        { projection: { countryId: 1, treasuryBalance: 1, gdp: 1, gdpSmoothed: 1 } }
      )
      .toArray(),
    db
      .collection<GovernmentApproval>("governmentApprovals")
      .find({ _id: { $in: [...countryIds] as CountryId[] } }, { projection: { approvalRating: 1 } })
      .toArray(),
  ]);
  const approvalOf = new Map(approvals.map((row) => [String(row._id), row.approvalRating]));
  const result = new Map<string, Purse>();
  for (const budget of budgets) {
    result.set(budget.countryId, {
      treasuryBalance: budget.treasuryBalance ?? 0,
      output: resolveRatioGdp(budget) || undefined,
      approval: approvalOf.get(budget.countryId) ?? 50,
    });
  }
  return result;
}

async function loadLastPulls(
  db: Db,
  crisisIds: readonly ObjectId[],
  holderIds: readonly string[]
): Promise<Map<string, number>> {
  const rows = await db
    .collection<CrisisLeverUse>("crisisLeverUses")
    .find(
      { crisisId: { $in: [...crisisIds] }, holderId: { $in: [...holderIds] } },
      { projection: { crisisId: 1, leverId: 1, holderId: 1, submittedTurn: 1 } }
    )
    .toArray();
  const latest = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.crisisId.toString()}|${row.leverId}|${row.holderId}`;
    latest.set(key, Math.max(latest.get(key) ?? -Infinity, row.submittedTurn));
  }
  return latest;
}

export interface NppResponseResult {
  considered: number;
  pulled: number;
  failed: number;
}

/**
 * Lets NPP governments respond to crises in their countries. Each turn, for
 * every active v2 crisis touching an NPP country, the government's head picks
 * levers for the executive roles no player holds, by severity, stage, what the
 * treasury and approval can bear, and its personality. Pulls go through the
 * same claim-then-charge path players use, so they hit the same unique slot,
 * the same treasury and approval charges and the same ledger. Background
 * countries are never iterated: they have no government to act.
 */
export async function runNppCrisisResponse(db: Db, turn: number): Promise<NppResponseResult> {
  const result: NppResponseResult = { considered: 0, pulled: 0, failed: 0 };
  try {
    const docs = await loadActiveCrisisDocs(db);
    if (docs.length === 0) return result;
    const tiers = await loadCountryTiers(db);
    const countries = await resolveCrisisCountries(db, docs);

    const work: { doc: (typeof docs)[number]; countryId: string }[] = [];
    for (const doc of docs) {
      const def = getCrisisDefinition(doc.v2.definitionId);
      if (!def || doc.v2.stage === "resolved") continue;
      if (!def.levers.some((lever) => NPP_EXECUTIVE_ROLES.includes(lever.role))) continue;
      for (const countryId of countries.get(doc._id.toString()) ?? []) {
        if (tiers.tierOf(countryId) === "npp") work.push({ doc, countryId });
      }
    }
    if (work.length === 0) return result;

    const nppCountries = [...new Set(work.map((item) => item.countryId))];
    const [governments, purses, playerHolders] = await Promise.all([
      loadGovernments(db, nppCountries),
      loadPurses(db, nppCountries),
      officeHolderProvider.load({ db, turn, countryIds: new Set(nppCountries) }),
    ]);
    const headIds = [...governments.values()].map((gov) => gov.headNppId.toString());
    const lastPulls =
      headIds.length === 0
        ? new Map<string, number>()
        : await loadLastPulls(db, [...new Set(work.map((item) => item.doc._id))], headIds);

    work.sort(
      (a, b) =>
        b.doc.v2.severity - a.doc.v2.severity ||
        a.doc._id.toString().localeCompare(b.doc._id.toString())
    );
    let pulls = 0;
    for (const { doc, countryId } of work) {
      if (pulls >= MAX_NPP_PULLS_PER_TURN) break;
      const government = governments.get(countryId);
      const purse = purses.get(countryId);
      const def = getCrisisDefinition(doc.v2.definitionId);
      if (!government || !purse || !def || doc.v2.stage === "resolved") continue;
      result.considered += 1;

      const held = playerHolders.get(countryId) ?? {};
      const roles = new Set<CrisisRole>(
        NPP_EXECUTIVE_ROLES.filter((role) => (held[role]?.length ?? 0) === 0)
      );
      const holder = government.headNppId.toString();
      const blocked = new Set(
        def.levers
          .filter((lever) =>
            leverBlock(
              doc.v2,
              lever,
              holder,
              turn,
              lastPulls.get(`${doc._id.toString()}|${lever.id}|${holder}`)
            )
          )
          .map((lever) => lever.id)
      );

      const picks = chooseNppLevers({
        def,
        stage: doc.v2.stage,
        severity: doc.v2.severity,
        roles,
        blockedLeverIds: blocked,
        budget: purse,
        interventionism: government.interventionism,
        rng: seededRng(`${doc._id.toString()}:${countryId}:${turn}`),
      });
      for (const pick of picks) {
        if (pulls >= MAX_NPP_PULLS_PER_TURN) break;
        try {
          const committed = await commitLeverUse(db, {
            crisis: doc,
            lever: pick.lever,
            holderId: government.headNppId,
            countryId,
            intensity: pick.intensity,
            turn,
          });
          if (committed.ok) {
            pulls += 1;
            result.pulled += 1;
            purse.treasuryBalance -= pick.cost.treasuryCash ?? 0;
            purse.approval -= pick.cost.approval?.points ?? 0;
          } else {
            result.failed += 1;
          }
        } catch (error) {
          result.failed += 1;
          logger.error(COMPONENT, "NPP lever pull failed", error, {
            crisisId: doc._id.toString(),
            leverId: pick.lever.id,
          });
        }
      }
    }
  } catch (error) {
    logger.error(COMPONENT, "NPP crisis response failed; skipped this turn", error);
  }
  return result;
}
