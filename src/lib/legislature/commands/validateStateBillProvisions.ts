import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import {
  checkDuplicateProvisions,
  checkDuplicateResetLawFamilies,
  checkCurrentPolicyLevel,
  STATE_TERMINAL_STATUSES,
} from "@/lib/congress/billProposalLimits";
import type {
  LegislationType,
  ResetLawProvision,
  StateBill,
  StateBillProvision,
} from "@/lib/db/types";
import {
  countProvisionsChargedNationalInfluence,
  SUBSIDY_BILL_CATEGORIES,
} from "@shared/constants/legislation";
import { OPERATING_SECTOR_TYPES, type OperatingSectorType } from "@/lib/constants/corporations";
import { getEraContext } from "@/lib/era/context";
import { isLegislationTypeActive } from "@/lib/era/legislationCatalog";
import { stampTaxSliderProvisions } from "@/lib/politicalLegislation/taxSlider";
import type { GameState } from "@/lib/db/types/gameState";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { isResetV2Country, resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { loadReviewedLawCatalog } from "@/lib/resetLegislation/loadReviewedCatalog";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import type { LawChoice } from "@/lib/resetLegislation/rules/eligibility";
import { resetTaxesFor } from "@/lib/resetLegislation/taxCatalog";
import { resolveResetTaxProvisionFields } from "@/lib/resetLegislation/resolveTaxProvision";

export type ValidateStateBillProvisionsResult =
  | {
      ok: true;
      provisions: StateBillProvision[] | undefined;
      /** Provisions charged national influence on the shared cost ladder. */
      influenceProvisionCount: number;
    }
  | { ok: false; status: number; error: string };

function isSubsidyType(type: unknown): type is "subsidy" | "end_subsidy" {
  return type === "subsidy" || type === "end_subsidy";
}

/**
 * The provision gate every sub-national bill passes through, whether a member
 * proposes it directly or a governor queues it for a party NPP to introduce.
 * Validates and normalizes the provisions (reviewed v2 law selections and tax
 * rates, legacy policy rows, subsidies) and runs the duplicate and current-law
 * checks against the region's active bills. It charges nothing and writes
 * nothing.
 */
export async function validateStateBillProvisions(
  db: Db,
  args: {
    countryId: CountryId;
    stateId: string;
    gameState: GameState | null;
    category?: string;
    provisions?: unknown[];
  }
): Promise<ValidateStateBillProvisionsResult> {
  const { countryId, stateId, gameState: gameStateForTurn, category, provisions } = args;
  const resetLegislationV2 =
    resetSystemVersionsForCountry(gameStateForTurn, RESET_V2_READY, countryId).legislation === "v2";
  if (
    !resetLegislationV2 &&
    provisions?.some(
      (provision) =>
        typeof provision === "object" &&
        provision !== null &&
        "type" in provision &&
        provision.type === "reset_law"
    )
  ) {
    return {
      ok: false,
      status: 409,
      error: "Reviewed legislation is unavailable. Refresh the page before proposing.",
    };
  }
  // Reviewed v2 bills deliberately use `custom` for multi-domain drafts. Legacy
  // custom bills remain flavor-only and cannot smuggle mechanical provisions.
  const effectiveProvisions = category === "custom" && !resetLegislationV2 ? [] : provisions;
  const rawResetSelections = (Array.isArray(effectiveProvisions) ? effectiveProvisions : []).filter(
    (
      provision
    ): provision is {
      type: "reset_law";
      familyId?: unknown;
      scope?: unknown;
      regionId?: unknown;
      choice?: unknown;
    } =>
      typeof provision === "object" &&
      provision !== null &&
      "type" in provision &&
      provision.type === "reset_law"
  );
  const validatedResetLawProvisions: ResetLawProvision[] = [];
  if (rawResetSelections.length > 0) {
    if (!isResetV2Country(countryId)) {
      return { ok: false, status: 400, error: "Legislation v2 is unavailable in this country." };
    }
    const resetSelections: Array<{
      type: "reset_law";
      familyId: string;
      scope: "regional";
      regionId: string;
      choice: LawChoice;
    }> = [];
    for (const selection of rawResetSelections) {
      if (
        selection.scope !== "regional" ||
        typeof selection.regionId !== "string" ||
        selection.regionId.toUpperCase() !== stateId ||
        typeof selection.familyId !== "string" ||
        typeof selection.choice !== "string"
      ) {
        return {
          ok: false,
          status: 400,
          error: "Each v2 regional law selection must identify its family and region.",
        };
      }
      resetSelections.push({
        type: "reset_law",
        familyId: selection.familyId,
        scope: "regional",
        regionId: selection.regionId,
        choice: selection.choice as LawChoice,
      });
    }
    const gameState = await db.collection<GameState>("gameState").findOne(
      { _id: "current" },
      {
        projection: {
          resetWorldId: 1,
          startingYear: 1,
          currentYear: 1,
          metricsSystemVersion: 1,
          legislationSystemVersion: 1,
          resetVersionSeeds: 1,
        },
      }
    );
    if (
      !gameState?.resetWorldId ||
      resetSystemVersionsForCountry(gameState, RESET_V2_READY, countryId).legislation !== "v2"
    ) {
      return { ok: false, status: 409, error: "Legislation v2 is not enabled." };
    }
    const catalog = await loadReviewedLawCatalog({
      db,
      worldId: gameState.resetWorldId,
      country: countryId as ResetCountry,
      scope: "regional",
      regionId: stateId,
      year: gameState.currentYear ?? gameState.startingYear ?? 1991,
    });
    const seen = new Set<string>();
    for (const selection of resetSelections) {
      if (seen.has(selection.familyId)) {
        return {
          ok: false,
          status: 400,
          error: "Each v2 regional law family may appear once for this region.",
        };
      }
      const family = catalog.find((candidate) => candidate.familyId === selection.familyId);
      const entry = family?.options.find(
        (candidate) => candidate.option.choice === selection.choice
      );
      if (!family || !entry || entry.option.choice === entry.currentChoice) {
        return { ok: false, status: 400, error: "This v2 regional law option is unavailable." };
      }
      seen.add(family.familyId);
      validatedResetLawProvisions.push({
        type: "reset_law",
        familyId: family.familyId,
        scope: "regional",
        regionId: stateId,
        choice: entry.option.choice,
        reviewedOption: entry.option,
        titleSnapshot: entry.title,
        descriptionSnapshot: entry.description,
        currentLawSnapshot: family.currentLaw,
        currentLawDescriptionSnapshot: family.currentLawDescription,
        currentChoiceSnapshot: entry.currentChoice,
        currentAnnualAllocationSnapshot: entry.currentAnnualAllocation,
        annualAllocationDeltaSnapshot: entry.annualAllocationDelta,
        overseeingSeatIdSnapshot: null,
        overseeingAgencyIdSnapshot: family.overseeingAgencyId,
        primaryMetricEffectsSnapshot: entry.primaryMetricEffects,
        balanceBasis: entry.balanceBasis,
      });
    }
    const duplicateProgramBill = await db.collection<StateBill>("stateBills").findOne({
      stateId,
      countryId,
      status: { $nin: STATE_TERMINAL_STATUSES },
      provisions: {
        $elemMatch: {
          type: "reset_law",
          familyId: { $in: [...seen] },
        },
      },
    });
    if (duplicateProgramBill) {
      return {
        ok: false,
        status: 409,
        error: "An active bill already contains one of these v2 law families.",
      };
    }
  }
  const legacyEffectiveProvisions = (
    Array.isArray(effectiveProvisions) ? effectiveProvisions : []
  ).filter(
    (provision) =>
      !(
        typeof provision === "object" &&
        provision !== null &&
        "type" in provision &&
        provision.type === "reset_law"
      )
  );
  const regionalResetTaxes = isResetV2Country(countryId)
    ? resetTaxesFor(countryId as ResetCountry, "regional")
    : [];
  const regionalResetTaxIds = new Set(
    regionalResetTaxes.map((tax) => tax.existingLegislationTypeId)
  );
  if (
    resetLegislationV2 &&
    legacyEffectiveProvisions.some((provision) => {
      // Subsidies sit outside the reviewed law catalog: they act on corporate
      // margins, not on a law family, so a v2 world keeps proposing them as-is.
      if (
        typeof provision === "object" &&
        provision !== null &&
        "type" in provision &&
        isSubsidyType(provision.type)
      ) {
        return false;
      }
      const legislationTypeId =
        typeof provision === "object" && provision !== null && "legislationTypeId" in provision
          ? String(provision.legislationTypeId)
          : "";
      return !regionalResetTaxIds.has(legislationTypeId);
    })
  ) {
    return {
      ok: false,
      status: 409,
      error: "This world accepts only reviewed regional law, tax and subsidy provisions.",
    };
  }
  const sanitizedProvisions: StateBillProvision[] | undefined = Array.isArray(effectiveProvisions)
    ? legacyEffectiveProvisions.map((provision) => {
        if (
          typeof provision === "object" &&
          provision != null &&
          "type" in provision &&
          provision.type === "subsidy"
        ) {
          const subsidy = provision as unknown as {
            scopeType: "economy_wide" | "sector";
            targetSectorType?: string;
            targetStrategyId?: string;
            domesticOnly: boolean;
          };
          return {
            type: "subsidy" as const,
            scopeType: subsidy.scopeType,
            ...(subsidy.targetSectorType
              ? { targetSectorType: subsidy.targetSectorType as OperatingSectorType }
              : {}),
            ...(subsidy.targetStrategyId ? { targetStrategyId: subsidy.targetStrategyId } : {}),
            domesticOnly: subsidy.domesticOnly,
          };
        }
        if (
          typeof provision === "object" &&
          provision != null &&
          "type" in provision &&
          provision.type === "end_subsidy"
        ) {
          const endSubsidy = provision as unknown as {
            scopeType: "economy_wide" | "sector";
            targetSectorType?: string;
            targetStrategyId?: string;
          };
          return {
            type: "end_subsidy" as const,
            scopeType: endSubsidy.scopeType,
            ...(endSubsidy.targetSectorType
              ? { targetSectorType: endSubsidy.targetSectorType as OperatingSectorType }
              : {}),
            ...(endSubsidy.targetStrategyId
              ? { targetStrategyId: endSubsidy.targetStrategyId }
              : {}),
          };
        }

        const policyProvision = provision as {
          legislationTypeId?: string;
          policyOptionId?: string;
          effectDirection?: number;
          economic?: number;
          social?: number;
          proposedRate?: number;
        };
        const policyOptionId =
          typeof policyProvision.policyOptionId === "string" &&
          policyProvision.policyOptionId.trim()
            ? policyProvision.policyOptionId.trim()
            : undefined;
        const proposedRate =
          typeof policyProvision.proposedRate === "number" &&
          Number.isFinite(policyProvision.proposedRate)
            ? policyProvision.proposedRate
            : undefined;
        return {
          legislationTypeId: String(policyProvision.legislationTypeId ?? "").trim(),
          ...(policyOptionId ? { policyOptionId } : {}),
          effectDirection: Math.max(
            -1,
            Math.min(1, Math.round(Number(policyProvision.effectDirection) || 0))
          ),
          ...(policyProvision.economic != null
            ? {
                economic: Math.max(-3, Math.min(3, Math.round(Number(policyProvision.economic)))),
              }
            : {}),
          ...(policyProvision.social != null
            ? {
                social: Math.max(-3, Math.min(3, Math.round(Number(policyProvision.social)))),
              }
            : {}),
          ...(proposedRate !== undefined ? { proposedRate } : {}),
        };
      })
    : undefined;

  if (sanitizedProvisions && sanitizedProvisions.length > 0) {
    if (resetLegislationV2) {
      const reviewedTaxes = sanitizedProvisions.flatMap((provision, index) =>
        "legislationTypeId" in provision ? [{ index, provision }] : []
      );
      if (
        new Set(reviewedTaxes.map(({ provision }) => provision.legislationTypeId)).size !==
        reviewedTaxes.length
      ) {
        return { ok: false, status: 400, error: "A v2 bill cannot repeat a tax instrument." };
      }
      const legislationTypes = reviewedTaxes.length
        ? await db
            .collection<LegislationType>("legislationTypes")
            .find({
              _id: { $in: reviewedTaxes.map(({ provision }) => provision.legislationTypeId) },
            })
            .toArray()
        : [];
      const legislationTypeById = new Map(legislationTypes.map((type) => [type._id, type]));
      for (const { index, provision } of reviewedTaxes) {
        const legislationType = legislationTypeById.get(provision.legislationTypeId);
        if (!legislationType) {
          return { ok: false, status: 400, error: "Unknown reviewed tax instrument." };
        }
        const resolved = await resolveResetTaxProvisionFields(
          db,
          legislationType,
          provision.proposedRate,
          provision.policyOptionId,
          countryId as ResetCountry,
          "regional",
          stateId
        );
        if (!resolved.ok) {
          return { ok: false, status: 400, error: resolved.error };
        }
        sanitizedProvisions[index] = { ...provision, ...resolved.fields };
      }
    } else {
      const stamped = await stampTaxSliderProvisions(db, sanitizedProvisions, countryId, stateId);
      if (!stamped.ok) {
        return { ok: false, status: 400, error: stamped.error };
      }
      sanitizedProvisions.length = 0;
      sanitizedProvisions.push(...stamped.provisions);
    }
  }
  sanitizedProvisions?.push(...validatedResetLawProvisions);

  const policyProvisionsForCheck = (sanitizedProvisions ?? [])
    .filter(
      (
        provision
      ): provision is {
        legislationTypeId: string;
        policyOptionId?: string;
        effectDirection: number;
      } =>
        !("type" in provision) ||
        (provision.type !== "subsidy" &&
          provision.type !== "end_subsidy" &&
          provision.type !== "reset_law")
    )
    .filter((provision) => provision.legislationTypeId);

  // Era gate: a state bill cannot legislate a type before its historical window.
  // Null year (flag off / legacy) ⇒ every type active, byte-identical.
  const { year: eraYear } = await getEraContext(db);
  for (const provision of policyProvisionsForCheck) {
    if (!isLegislationTypeActive(provision.legislationTypeId, eraYear)) {
      return { ok: false, status: 400, error: "This legislation is not available in this era." };
    }
  }

  const subsidyProvisionCount = (sanitizedProvisions ?? []).filter(
    (provision) => "type" in provision && isSubsidyType(provision.type)
  ).length;

  for (const provision of sanitizedProvisions ?? []) {
    if (
      "type" in provision &&
      (provision.type === "subsidy" || provision.type === "end_subsidy") &&
      provision.scopeType === "sector" &&
      !provision.targetSectorType
    ) {
      return {
        ok: false,
        status: 400,
        error: "Sector-scoped subsidy provisions must specify a target sector type.",
      };
    }
    if (
      "type" in provision &&
      provision.type === "subsidy" &&
      provision.targetSectorType &&
      !OPERATING_SECTOR_TYPES.includes(provision.targetSectorType as OperatingSectorType)
    ) {
      return { ok: false, status: 400, error: `Invalid sector: ${provision.targetSectorType}.` };
    }
  }

  if (
    subsidyProvisionCount > 0 &&
    !SUBSIDY_BILL_CATEGORIES.has(category as Parameters<typeof SUBSIDY_BILL_CATEGORIES.has>[0]) &&
    // A reviewed v2 draft that mixes subsidies with laws or taxes is `custom`.
    !(resetLegislationV2 && category === "custom")
  ) {
    return {
      ok: false,
      status: 400,
      error: "Subsidy provisions can only be included in industry bills.",
    };
  }

  if (category === "industry" && subsidyProvisionCount === 0) {
    return {
      ok: false,
      status: 400,
      error: "Industry bills must contain at least one subsidy provision.",
    };
  }

  const duplicateCheck = await checkDuplicateProvisions(
    db,
    "stateBills",
    { stateId, status: { $nin: STATE_TERMINAL_STATUSES } },
    policyProvisionsForCheck
  );
  if (duplicateCheck) {
    return { ok: false, status: 409, error: duplicateCheck.error };
  }

  const resetLawDuplicateCheck = await checkDuplicateResetLawFamilies(
    db,
    "stateBills",
    { stateId, status: { $nin: STATE_TERMINAL_STATUSES } },
    validatedResetLawProvisions
  );
  if (resetLawDuplicateCheck) {
    return { ok: false, status: 409, error: resetLawDuplicateCheck.error };
  }

  const currentLevelCheck = await checkCurrentPolicyLevel(db, stateId, policyProvisionsForCheck);
  if (currentLevelCheck) {
    return { ok: false, status: 409, error: currentLevelCheck.error };
  }

  return {
    ok: true,
    provisions: sanitizedProvisions,
    influenceProvisionCount: countProvisionsChargedNationalInfluence({
      policyProvisionCount: policyProvisionsForCheck.length + validatedResetLawProvisions.length,
      subsidyProvisionCount,
    }),
  };
}
