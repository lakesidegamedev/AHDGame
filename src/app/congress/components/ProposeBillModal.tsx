"use client";
import { renderLegacyProposeBillModalView } from "./ProposeBillModal.view";

import { apiErrorText } from "@/lib/errors/catalog";
import { useWorldFlags } from "@/hooks/useWorldFlags";
import { LegislationSystemGate } from "@/components/legislation/LegislationSystemGate";

import { useState, useEffect, useMemo, useCallback } from "react";

import { useToast } from "@/contexts/ToastContext";
import { captureProductEvent } from "@/lib/analytics/capture";

import {
  BILL_CATEGORIES,
  SUBSIDY_BILL_CATEGORIES,
  TARIFF_BILL_CATEGORIES,
  NATIONALIZATION_BILL_CATEGORIES,
  ELECTORAL_LAW_BILL_CATEGORIES,
  BILL_PROPOSE_ACTION_COST,
  getProvisionCostTotal,
  getProposableBillCategories,
  MAX_PROVISIONS,
} from "@shared/constants/legislation";
import type { BillCategory } from "@shared/constants/legislation";

import {
  toNatPayload,
  validateNatRows,
  type NatProvisionInput,
} from "@/components/bills/NationalizationProvisionEditor";
import { postBillProposalWithElectionConfirmation } from "@/components/bills/BillAutoFailWarning";
import {
  toPayload as tariffToPayload,
  validateRows as validateTariffRows,
  type TariffProvisionInput,
} from "@/components/bills/tariffProvisionTypes";
import {
  toPayload as embargoToPayload,
  validateRows as validateEmbargoRows,
  type EmbargoProvisionInput,
} from "@/components/bills/embargoProvisionTypes";
import type { ChamberTab } from "./CongressConstants";
import type { CountryId } from "@/lib/constants/countriesCore";
import { useEnabledCountryIds } from "@/lib/hooks/useEnabledCountryIds";
import { fetchJson } from "@/lib/observability/fetchJson";

import type { CurrencyCode } from "@/lib/constants/currencies";
import type { BillProposalAutoFailWarning } from "@/lib/legislature/billAutoFailWarning";
import { GuidedLegislationModal } from "@/components/legislation/GuidedLegislationModal";

interface LegislationPolicyOption {
  id: string;
  name: string;
  explanation?: string;
  stance: "left" | "center" | "right";
  effectDirection: -1 | 0 | 1;
  economic: number;
  social: number;
  bucketApprovals?: Record<string, number>;
  /** National minimum wage laws, minimumWageLawStage on: the wage floor this option sets. */
  wageFloorKaitz?: number;
}

interface EffectTargetWeighted {
  metricCategoryId: string;
  metricId: string;
  weight: number;
}

interface LegislationTypeOption {
  _id: string;
  name: string;
  description: string;
  explanation?: string;
  policyDomain: string;
  subCategory: string;
  policyOptions?: LegislationPolicyOption[];
  effectTargetsWeighted?: EffectTargetWeighted[];
  /** Set by the era-gated legislation-types API for types unlocked this era. */
  eraNew?: boolean;
  /**
   * Which country's book this type belongs to (lower-case). A merge re-scopes
   * the absorbed state's catalogue onto the survivor, so this — not the
   * compiled per-country tables — is what says a carried law is now ours.
   */
  countryScope?: string;
  /** Political-legislation v2 (spec §8): live per-level fiscal estimates. */
  estimates?: Array<{ level: number; cost: number; revenue: number; net: number }>;
  /** GDP at the priced scope — annotates cost deltas as %GDP. */
  estimatesGdp?: number;
  /** New-generation catalog laws: political-metric targets (registry family ids). */
  politicalMetricTargets?: { metricId: string; weight: number }[];
  /** Tax-slider laws (ruling #16): slider bounds + live rate + revenue delta. */
  taxSliderEstimate?: {
    minRate: number;
    maxRate: number;
    step: number;
    baselineRate: number;
    currentRate: number;
    waypoints: Array<{ rate: number; label: string }>;
    revenueDeltaPerPoint: number;
  };
}

/**
 * Inline notice for supplementary form loads (bill types, categories, balance,
 * current policies). Without it, failed fetches leave selectors empty with no
 * explanation and no retry.
 */
function SupplementaryLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
      >
        Try again
      </button>
    </div>
  );
}

function useLegacyProposeBillModalContext({
  chamber,
  adminOverride,
  myChamber,
  countryId,
  blockedProvisions,
  proposalWarnings,
  hasActiveBill = false,
  onClose,
  onSuccess,
}: {
  chamber: ChamberTab;
  adminOverride?: boolean;
  myChamber?: "house" | "senate" | null;
  countryId: CountryId;
  blockedProvisions?: { legislationTypeId: string; policyOptionId: string }[];
  proposalWarnings?: Record<string, BillProposalAutoFailWarning | null>;
  /** Player already has a bill in voting — modal stays browsable, submit blocked. */
  hasActiveBill?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [chosenCategory, setCat] = useState<string>(BILL_CATEGORIES[0]);
  // Use myChamber (the user's actual chamber) if available, otherwise fall back to activeTab
  const effectiveChamber = myChamber ?? chamber;
  const [billChamber, setBillChamber] = useState<"house" | "senate" | "joint">(effectiveChamber);
  const [legislationTypes, setLegislationTypes] = useState<LegislationTypeOption[]>([]);
  // All national legislation types for this country (category-agnostic), fetched
  // once to decide which categories to offer — hides categories the country has
  // no laws for (e.g. agriculture/technology in the US).
  const [allNationalTypes, setAllNationalTypes] = useState<{ policyDomain: string }[]>([]);
  const availableCategories = useMemo(
    () => getProposableBillCategories(allNationalTypes),
    [allNationalTypes]
  );
  const cat =
    allNationalTypes.length > 0 && !(availableCategories as string[]).includes(chosenCategory)
      ? (availableCategories[0] ?? BILL_CATEGORIES[0])
      : chosenCategory;
  const [provisions, setProvisions] = useState<
    {
      legislationTypeId: string;
      policyOptionId: string;
      effectDirection: number;
      economic: number;
      social: number;
      /** Tax-slider laws (ruling #16): slider-chosen rate. */
      proposedRate?: number;
    }[]
  >([
    {
      legislationTypeId: "",
      policyOptionId: "",
      effectDirection: 0,
      economic: 0,
      social: 0,
    },
  ]);
  const [nationalInfluence, setNationalInfluence] = useState<number | null>(null);
  const [projectionResult, setProjection] = useState<{
    costAmount: number;
    pctOfGdp: number;
    currencyCode: CurrencyCode;
    warning: string | null;
  } | null>(null);
  const [currentPolicies, setCurrentPolicies] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Supplementary-load failures (issue #2792). Each has its own flag so a
  // failed side fetch shows an inline retry instead of silently degrading.
  const [typesError, setTypesError] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [budgetError, setBudgetError] = useState(false);

  const [policiesError, setPoliciesError] = useState(false);

  const isSubsidyCat = SUBSIDY_BILL_CATEGORIES.has(cat as BillCategory);
  const isTradeCat = TARIFF_BILL_CATEGORIES.has(cat as BillCategory);
  const isNatCat = NATIONALIZATION_BILL_CATEGORIES.has(cat as BillCategory);
  const isElectoralCat = ELECTORAL_LAW_BILL_CATEGORIES.has(cat as BillCategory);
  // Custom (flavor/roleplay) bills carry no provisions and have no in-game effect.
  const isCustomCat = cat === "custom";
  const { maastrichtEligibleCountries } = useWorldFlags();
  const [treatyAction, setTreatyAction] = useState<"" | "ratify" | "reject">("");
  const canDecideTreaty =
    cat === "foreign policy" && maastrichtEligibleCountries?.includes(countryId) === true;
  const includeTreaty = canDecideTreaty && treatyAction !== "";
  const [natRows, setNatRows] = useState<NatProvisionInput[]>([{ type: "nationalize" }]);

  const [tariffRows, setTariffRows] = useState<TariffProvisionInput[]>([
    { scopeType: "economy_wide", rate: 10 },
  ]);
  // Trade bills split into two provision families; the sub-type picks the builder.
  const [tradeSubType, setTradeSubType] = useState<"tariff" | "embargo">("tariff");
  const [embargoRows, setEmbargoRows] = useState<EmbargoProvisionInput[]>([
    { action: "embargo", targetCountry: "", commodity: "all", direction: "both", mode: "block" },
  ]);
  const enabledCountryIds = useEnabledCountryIds();

  // Build lookup set for blocked provision options (legislationTypeId:policyOptionId)
  const blockedProvisionKeys = new Set(
    (blockedProvisions ?? []).map((bp) => `${bp.legislationTypeId}:${bp.policyOptionId}`)
  );

  // Subsidy provisions (used when cat is "industry")
  const [subsidyProvisions, setSubsidyProvisions] = useState<
    {
      type: "subsidy" | "end_subsidy";
      scopeType: "economy_wide" | "sector";
      targetSectorType: string;
      targetStrategyId: string;
      domesticOnly: boolean;
    }[]
  >([
    {
      type: "subsidy",
      scopeType: "economy_wide",
      targetSectorType: "",
      targetStrategyId: "",
      domesticOnly: false,
    },
  ]);
  // Union-law inclusion is an explicit checkbox rather than inferred from
  // bias !== 0, so a RESET back to neutral (bias=0) is representable once a
  // country has a nonzero law in effect.
  const [includeUnionLaw, setIncludeUnionLaw] = useState(false);
  const [unionLawBias, setUnionLawBias] = useState(0);
  // Electoral law — franchise and registration access. Two independent axes, so
  // each has its own include flag: a bill that only lowers the voting age must
  // not silently reset the registration regime the last law set.
  const [includeVotingAge, setIncludeVotingAge] = useState(false);
  const [votingAge, setVotingAge] = useState(18);
  const [includeRegAccess, setIncludeRegAccess] = useState(false);
  const [registrationAccess, setRegistrationAccess] = useState(0);
  // Union ban (player suggestion #93): "bias" = the slider law; "ban"/"repeal_ban"
  // are standalone actions that leave the bias untouched at enactment.
  const [unionLawAction, setUnionLawAction] = useState<"bias" | "ban" | "repeal_ban">("bias");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const loadLegislationTypes = useCallback(() => {
    // Congress can only propose national-scope legislation (not state-level)
    fetch(
      `/api/game/legislation-types?category=${encodeURIComponent(cat)}&scope=national&country=${countryId.toLowerCase()}&nocache=1`,
      { cache: "no-store" }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`legislation-types HTTP ${r.status}`);
        return r.json();
      })
      .then((list: LegislationTypeOption[]) => {
        setTypesError(false);
        setLegislationTypes(list || []);
        // Reset provisions when category changes to avoid stale type/policy references
        setProvisions([
          {
            legislationTypeId: "",
            policyOptionId: "",
            effectDirection: 0,
            economic: 0,
            social: 0,
          },
        ]);
      })
      .catch(() => {
        setLegislationTypes([]);
        setTypesError(true);
      });
  }, [cat, countryId]);

  useEffect(() => {
    loadLegislationTypes();
  }, [loadLegislationTypes]);

  const [actions, setActions] = useState<number | null>(null);

  // Category-agnostic national types → which categories the country can propose.
  const loadNationalTypes = useCallback(() => {
    fetchJson<{ policyDomain: string }[]>(
      `/api/game/legislation-types?scope=national&country=${countryId.toLowerCase()}&nocache=1`,
      { feature: "propose-bill-national-types" }
    )
      .then((list) => {
        if (Array.isArray(list)) {
          setCategoriesError(false);
          setAllNationalTypes(list);
        }
      })
      .catch(() => setCategoriesError(true));
  }, [countryId]);

  useEffect(() => {
    loadNationalTypes();
  }, [loadNationalTypes]);

  const loadBudget = useCallback(() => {
    fetchJson<{
      user?: { character?: { nationalInfluence?: number; actions?: number } };
    }>("/api/auth/me", { cache: "no-store", feature: "propose-bill-me" })
      .then((data) => {
        setBudgetError(false);
        setNationalInfluence(data?.user?.character?.nationalInfluence ?? null);
        setActions(data?.user?.character?.actions ?? null);
      })
      .catch(() => setBudgetError(true));
  }, []);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  // Fetch current federal policies for shift-based approval preview
  const loadCurrentPolicies = useCallback(() => {
    fetch("/api/game/current-policies?stateId=federal", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`current-policies HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Record<string, number>) => {
        setPoliciesError(false);
        setCurrentPolicies(data);
      })
      .catch(() => {
        setCurrentPolicies({});
        setPoliciesError(true);
      });
  }, []);

  useEffect(() => {
    loadCurrentPolicies();
  }, [loadCurrentPolicies]);

  // Standalone provisions (electoral law, treaty) consume a MAX_PROVISIONS slot, so policy provisions get the remainder or the body schema rejects the bill.
  const standaloneProvisionCount =
    (isElectoralCat && (includeVotingAge || includeRegAccess) ? 1 : 0) + (includeTreaty ? 1 : 0);
  const maxPolicyProvisions = Math.max(0, MAX_PROVISIONS - standaloneProvisionCount);

  const provisionCountForInfluenceCost = isCustomCat
    ? 0 // Custom bills have no provisions
    : isTradeCat
      ? 0 // Tariffs do not cost NPI
      : isNatCat
        ? natRows.length
        : isSubsidyCat
          ? subsidyProvisions.length
          : // An electoral-law provision rides the NPI ladder like any other, so
            // Must be counted here: otherwise the modal quotes a cost lower than the route charges, and `canAffordNpi` clears a bill the server refuses for insufficient influence.
            (includeTreaty
              ? provisions.filter((p) => p.legislationTypeId.trim()).length
              : provisions.length) + standaloneProvisionCount;
  const totalCost = getProvisionCostTotal(provisionCountForInfluenceCost);
  const canAffordNpi =
    adminOverride || nationalInfluence === null || nationalInfluence >= totalCost;
  const canAffordActions = adminOverride || actions === null || actions >= BILL_PROPOSE_ACTION_COST;
  const canAfford = canAffordNpi && canAffordActions;
  const selectedProposalWarning = proposalWarnings?.[billChamber] ?? null;

  // Live fiscal projection: the draft bill's annual budget cost. Debounced so
  // rapid provision edits don't hammer the estimate endpoint. Custom (flavor)
  // bills have no fiscal effect, so they clear the panel.
  const projectionProvisions = useMemo(
    () =>
      provisions
        .filter((p) => p.legislationTypeId.trim())
        .map((p) => ({
          legislationTypeId: p.legislationTypeId.trim(),
          policyOptionId: p.policyOptionId || undefined,
          effectDirection: p.effectDirection,
        })),
    [provisions]
  );
  const projection = isCustomCat || projectionProvisions.length === 0 ? null : projectionResult;
  const projectionKey = useMemo(() => JSON.stringify(projectionProvisions), [projectionProvisions]);
  useEffect(() => {
    if (isCustomCat || projectionProvisions.length === 0) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson<{
          costAmount: number;
          pctOfGdp: number;
          currencyCode: CurrencyCode;
          warning: string | null;
        }>("/api/congress/bills/estimate-cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countryId, provisions: projectionProvisions }),
          feature: "propose-bill-estimate-cost",
        });
        if (!cancelled && data) {
          setProjection({
            costAmount: data.costAmount,
            pctOfGdp: data.pctOfGdp,
            currencyCode: data.currencyCode,
            warning: data.warning ?? null,
          });
        }
      } catch {
        if (!cancelled) setProjection(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // projectionKey captures the provision content; countryId/isCustomCat gate it.
  }, [projectionKey, countryId, isCustomCat, projectionProvisions]);

  function setProvision(
    index: number,
    patch: Partial<{
      legislationTypeId: string;
      policyOptionId: string;
      effectDirection: number;
      economic: number;
      social: number;
      proposedRate: number;
    }>
  ) {
    setProvisions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      const lt = legislationTypes.find((t) => t._id === next[index].legislationTypeId);
      if (patch.legislationTypeId != null && lt?.policyOptions?.length) {
        const first = lt.policyOptions[0];
        next[index].policyOptionId = first.id;
        next[index].effectDirection = first.effectDirection;
        next[index].economic = first.economic ?? 0;
        next[index].social = first.social ?? 0;
      }
      // Tax-slider laws start at the live current rate (submit stays disabled
      // until the player moves it at least one step).
      if (patch.legislationTypeId != null && lt?.taxSliderEstimate) {
        next[index].proposedRate = lt.taxSliderEstimate.currentRate;
        next[index].policyOptionId = `rate:${lt.taxSliderEstimate.currentRate}`;
      }
      return next;
    });
  }

  function addProvision() {
    if (provisions.length >= maxPolicyProvisions) return;
    setProvisions((prev) => [
      ...prev,
      {
        legislationTypeId: "",
        policyOptionId: "",
        effectDirection: 0,
        economic: 0,
        social: 0,
      },
    ]);
  }

  function removeProvision(index: number) {
    if (provisions.length <= 1) return;
    setProvisions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let provisionPayload: unknown[];
    if (isCustomCat) {
      provisionPayload = [];
    } else if (isNatCat) {
      const err = validateNatRows(natRows);
      if (err) {
        setError(err);
        return;
      }
      provisionPayload = toNatPayload(natRows);
    } else if (isTradeCat) {
      if (tradeSubType === "embargo") {
        const err = validateEmbargoRows(embargoRows);
        if (err) {
          setError(err);
          return;
        }
        provisionPayload = embargoRows.map(embargoToPayload);
      } else {
        const err = validateTariffRows(tariffRows);
        if (err) {
          setError(err);
          return;
        }
        provisionPayload = tariffRows.map(tariffToPayload);
      }
    } else if (isSubsidyCat) {
      // Validate subsidy provisions
      const invalidSubsidy = subsidyProvisions.find(
        (p) => p.scopeType === "sector" && !p.targetSectorType.trim()
      );
      if (invalidSubsidy) {
        setError("Sector-scoped subsidy provisions require a target sector type.");
        return;
      }
      provisionPayload = subsidyProvisions.map((p) => ({
        type: p.type,
        scopeType: p.scopeType,
        ...(p.scopeType === "sector" && p.targetSectorType
          ? { targetSectorType: p.targetSectorType }
          : {}),
        ...(p.targetStrategyId.trim() ? { targetStrategyId: p.targetStrategyId.trim() } : {}),
        ...(p.type === "subsidy" ? { domesticOnly: p.domesticOnly } : {}),
      }));
      if (includeUnionLaw) {
        provisionPayload.push({
          type: "union_law",
          bias: unionLawAction === "bias" ? unionLawBias : 0,
          ...(unionLawAction !== "bias" ? { banAction: unionLawAction } : {}),
        });
      }
    } else {
      const policyProvisions = includeTreaty
        ? provisions.filter((p) => p.legislationTypeId.trim())
        : provisions;
      const valid = policyProvisions.every((p) => p.legislationTypeId.trim());
      if (!valid) {
        setError("Each provision must have a legislation type selected.");
        return;
      }
      // Tax-slider provisions must move the rate at least one step (ruling #16;
      // the server re-validates against the live rate).
      for (const p of policyProvisions) {
        const slider = legislationTypes.find(
          (t) => t._id === p.legislationTypeId
        )?.taxSliderEstimate;
        if (!slider) continue;
        const proposed = p.proposedRate ?? slider.currentRate;
        if (Math.abs(proposed - slider.currentRate) < slider.step - 1e-9) {
          setError(`Tax proposals must change the rate by at least ${slider.step}.`);
          return;
        }
      }
      if (!canAffordActions) {
        setError(
          `Proposing a bill costs ${BILL_PROPOSE_ACTION_COST} action points (you have ${actions ?? 0}).`
        );
        setLoading(false);
        return;
      }
      if (!canAffordNpi && totalCost > 0) {
        setError(
          `This bill costs ${totalCost} national political influence (you have ${nationalInfluence?.toFixed(0) ?? 0}).`
        );
        return;
      }
      // The add-provision cap already accounts for the franchise provision, but
      // a player can fill the rows first and tick the box afterwards, which the
      // cap cannot retract. Say so rather than letting the body schema refuse
      // the bill with a bare count.
      if (policyProvisions.length + standaloneProvisionCount > MAX_PROVISIONS) {
        setError(
          `A bill carries at most ${MAX_PROVISIONS} provisions, and the electoral-law change is one of them. Remove a policy provision.`
        );
        return;
      }
      provisionPayload = policyProvisions.map((p) => ({
        legislationTypeId: p.legislationTypeId.trim(),
        policyOptionId: p.policyOptionId || undefined,
        effectDirection: p.effectDirection,
        economic: p.economic,
        social: p.social,
        ...(p.proposedRate !== undefined && { proposedRate: p.proposedRate }),
      }));
      if (includeTreaty)
        provisionPayload.push({
          type: "european_treaty",
          treaty: "maastricht",
          action: treatyAction,
        });
      // Electoral law rides alongside the policy provisions of a social bill.
      // Each axis is opt-in separately so a franchise bill does not silently
      // reset the registration regime — the server enforces the same rule.
      if (isElectoralCat && (includeVotingAge || includeRegAccess)) {
        provisionPayload.push({
          type: "electoral_law",
          ...(includeVotingAge ? { votingAge } : {}),
          ...(includeRegAccess ? { registrationAccess } : {}),
        });
      }
    }

    setLoading(true);
    try {
      const body = {
        title: title.trim(),
        summary: summary.trim(),
        chamber: billChamber,
        category: cat,
        provisions: provisionPayload,
      };
      const {
        response: res,
        data,
        cancelled,
      } = await postBillProposalWithElectionConfirmation({
        url: "/api/congress/bills",
        body,
      });
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setError(apiErrorText(data, "Failed to propose bill"));
        return;
      }
      showToast("Bill proposed — voting is now open.");
      void captureProductEvent("bill_drafted");
      onSuccess();
      onClose();
    } finally {
      setLoading(false);
    }
  }
  return {
    kind: "context" as const,
    context: {
      SupplementaryLoadError,
      actions,
      addProvision,
      adminOverride,
      availableCategories,
      billChamber,
      blockedProvisionKeys,
      budgetError,
      canAfford,
      canAffordActions,
      canDecideTreaty,
      cat,
      categoriesError,
      countryId,
      currentPolicies,
      embargoRows,
      enabledCountryIds,
      error,
      handleSubmit,
      hasActiveBill,
      includeRegAccess,
      includeUnionLaw,
      includeVotingAge,
      isCustomCat,
      isElectoralCat,
      isNatCat,
      isSubsidyCat,
      isTradeCat,
      legislationTypes,
      loadBudget,
      loadCurrentPolicies,
      loadLegislationTypes,
      loadNationalTypes,
      loading,
      maxPolicyProvisions,
      myChamber,
      natRows,
      nationalInfluence,
      onClose,
      policiesError,
      projection,
      provisions,
      registrationAccess,
      removeProvision,
      selectedProposalWarning,
      setBillChamber,
      setCat,
      setEmbargoRows,
      setIncludeRegAccess,
      setIncludeUnionLaw,
      setIncludeVotingAge,
      setNatRows,
      setProvision,
      setRegistrationAccess,
      setSubsidyProvisions,
      setSummary,
      setTariffRows,
      setTitle,
      setTradeSubType,
      setTreatyAction,
      setUnionLawAction,
      setUnionLawBias,
      setVotingAge,
      subsidyProvisions,
      summary,
      tariffRows,
      title,
      totalCost,
      tradeSubType,
      treatyAction,
      typesError,
      unionLawAction,
      unionLawBias,
      votingAge,
    },
  };
}
export type LegacyProposeBillModalViewContext = Extract<
  ReturnType<typeof useLegacyProposeBillModalContext>,
  { kind: "context" }
>["context"];

function LegacyProposeBillModal(...args: Parameters<typeof useLegacyProposeBillModalContext>) {
  const result = useLegacyProposeBillModalContext(...args);
  return renderLegacyProposeBillModalView(result.context);
}

export function ProposeBillModal(props: Parameters<typeof LegacyProposeBillModal>[0]) {
  const flags = useWorldFlags();
  if (!flags.loaded || flags.failed) {
    return <LegislationSystemGate failed={flags.failed} onClose={props.onClose} />;
  }
  const useV2 =
    flags.resetSystemVersions.legislation === "v2" &&
    flags.resetV2Countries.includes(props.countryId);
  if (useV2) {
    const initial = props.myChamber ?? props.chamber;
    return (
      <GuidedLegislationModal
        countryId={props.countryId}
        endpoint="/api/congress/bills"
        chambers={[
          { value: "house", label: "House" },
          { value: "senate", label: "Senate" },
          { value: "joint", label: "Joint" },
        ]}
        initialChamber={initial}
        adminOverride={props.adminOverride}
        onClose={props.onClose}
        onSuccess={props.onSuccess}
      />
    );
  }
  return <LegacyProposeBillModal {...props} />;
}
