"use client";
import { renderLegacyProposeLegislationModalView } from "./ProposeLegislationModal.view";

import { useWorldFlags } from "@/hooks/useWorldFlags";
import { LegislationSystemGate } from "@/components/legislation/LegislationSystemGate";

import { useState, useEffect, useMemo } from "react";

import { useToast } from "@/contexts/ToastContext";
import { captureProductEvent } from "@/lib/analytics/capture";
import {
  BILL_CATEGORIES,
  CATEGORY_TO_POLICY_DOMAINS,
  MAX_PROVISIONS,
  NATIONALIZATION_BILL_CATEGORIES,
  ELECTORAL_LAW_BILL_CATEGORIES,
  CENTRAL_BANK_INDEPENDENCE_BILL_CATEGORIES,
  SUBSIDY_BILL_CATEGORIES,
  TARIFF_BILL_CATEGORIES,
  getProvisionCostTotal,
  getProposableBillCategories,
} from "@shared/constants/legislation";
import type { BillCategory } from "@shared/constants/legislation";

import { type CentralBankIndependenceAction } from "@/components/bills/CentralBankProvisionEditor";

import { canLegislateEconomicSystem } from "@/lib/economy/economicSystemReformRules";
import type { EconomicSystemTarget } from "@/lib/db/types/legislation";
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
import { legislatureApiUrl } from "@/lib/urls";

import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";

import { getNationalStateId } from "@/lib/policy/nationalStateId";

import { useEnabledCountryIds } from "@/lib/hooks/useEnabledCountryIds";
import type { BillProposalAutoFailWarning } from "@/lib/legislature/billAutoFailWarning";
import { fetchJson } from "@/lib/observability/fetchJson";
import { GuidedLegislationModal } from "@/components/legislation/GuidedLegislationModal";
import { apiErrorText } from "@/lib/errors/catalog";

interface LegislationTypeOption {
  _id: string;
  name: string;
  /** Set by the era-gated legislation-types API for types unlocked this era. */
  eraNew?: boolean;
  description?: string;
  explanation?: string;
  policyDomain: string;
  effectTargetsWeighted?: { metricCategoryId: string; metricId: string; weight: number }[];
  policyOptions?: {
    id: string;
    name: string;
    explanation?: string;
    effectDirection: number;
    economic?: number;
    social?: number;
    bucketApprovals?: Record<string, number>;
    /** National minimum wage laws, minimumWageLawStage on: the wage floor this option sets. */
    wageFloorKaitz?: number;
  }[];
  /** New-generation catalog laws (US/UK/RU/DD): API-attached per-level fiscal estimates. */
  estimates?: { level: number; cost: number; revenue: number; net: number }[];
  /** GDP at the priced scope — annotates cost deltas as %GDP. */
  estimatesGdp?: number;
  /** New-generation catalog laws: political-metric targets (registry family ids). */
  politicalMetricTargets?: { metricId: string; weight: number }[];
  /** New-generation tax laws: API-attached live slider state (rate range + current rate). */
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

interface ProvisionRow {
  legislationTypeId: string;
  policyOptionId: string;
  effectDirection: number;
  economic: number;
  social: number;
  proposedRate?: number;
}

const EMPTY_PROVISION_ROW: ProvisionRow = {
  legislationTypeId: "",
  policyOptionId: "",
  effectDirection: 0,
  economic: 0,
  social: 0,
};

export interface ProposeChamberOption {
  value: string;
  label: string;
}

const EMPTY_SUBSIDY = {
  type: "subsidy" as "subsidy" | "end_subsidy",
  scopeType: "economy_wide" as "economy_wide" | "sector",
  targetSectorType: "",
  targetStrategyId: "",
  domesticOnly: false,
};

/**
 * Unified "Propose Legislation" modal for the country legislatures (UK, DE, JP,
 * IE, CN). Generalises the formerly-duplicated per-country modals: the body,
 * fetches, provision/tariff/subsidy builders, cost ledger and submit flow are
 * identical; per-country differences come in through config props:
 *   - `chambers`      — originating-chamber options (JP selects Shūgiin/Sangiin;
 *                       single-chamber legislatures pass one, rendered fixed)
 *   - `domesticOnlyLabel` — wording of the subsidy "domestic corporations only" toggle
 *   - `proposalWarning` / `proposalWarnings` — single or per-chamber auto-fail warning
 * Submits to `${legislatureApiUrl(countryId)}/bills`.
 */
function useLegacyProposeLegislationModalContext({
  countryId,
  adminOverride = false,
  blockedProvisions,
  proposalWarning,
  proposalWarnings,
  chambers,
  defaultChamber,
  domesticOnlyLabel = "Domestic corporations only",
  hasActiveBill = false,
  proposeViaPartyNpp = false,
  onClose,
  onSuccess,
}: {
  countryId: CountryId;
  adminOverride?: boolean;
  blockedProvisions?: { legislationTypeId: string; policyOptionId: string }[];
  proposalWarning?: BillProposalAutoFailWarning | null;
  proposalWarnings?: Record<string, BillProposalAutoFailWarning | null>;
  chambers: ProposeChamberOption[];
  defaultChamber?: string;
  domesticOnlyLabel?: string;
  /** Player already has a bill in voting — modal stays browsable, submit blocked. */
  hasActiveBill?: boolean;
  proposeViaPartyNpp?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [cat, setCat] = useState(BILL_CATEGORIES[0] as string);
  const worldFlags = useWorldFlags();
  const { maastrichtEligibleCountries } = worldFlags;
  const [treatyAction, setTreatyAction] = useState<"" | "ratify" | "reject">("");
  const canDecideTreaty =
    cat === "foreign policy" && maastrichtEligibleCountries?.includes(countryId) === true;
  const includeTreaty = canDecideTreaty && treatyAction !== "";
  const [billChamber, setBillChamber] = useState<string>(
    defaultChamber ?? chambers[0]?.value ?? ""
  );
  const [legislationTypes, setLegislationTypes] = useState<LegislationTypeOption[]>([]);
  const [rows, setRows] = useState<ProvisionRow[]>([{ ...EMPTY_PROVISION_ROW }]);
  const [submitting, setSubmitting] = useState(false);
  const [currentPolicies, setCurrentPolicies] = useState<Record<string, number>>({});
  const [tariffRows, setTariffRows] = useState<TariffProvisionInput[]>([
    { scopeType: "economy_wide", rate: 10 },
  ]);
  // Trade bills split into two provision families; the sub-type picks the builder.
  const [tradeSubType, setTradeSubType] = useState<"tariff" | "embargo">("tariff");
  const [embargoRows, setEmbargoRows] = useState<EmbargoProvisionInput[]>([
    { action: "embargo", targetCountry: "", commodity: "all", direction: "both", mode: "block" },
  ]);
  const enabledCountryIds = useEnabledCountryIds();

  const isTradeCat = TARIFF_BILL_CATEGORIES.has(cat as BillCategory);
  const isSubsidyCat = SUBSIDY_BILL_CATEGORIES.has(cat as BillCategory);
  const isNatCat = NATIONALIZATION_BILL_CATEGORIES.has(cat as BillCategory);
  const isElectoralCat = ELECTORAL_LAW_BILL_CATEGORIES.has(cat as BillCategory);
  const { euroAdoptionEligibleCountries = [] } = worldFlags;
  const canProposeEuro = cat === "economy" && euroAdoptionEligibleCountries.includes(countryId);
  const [includeEuroAdoption, setIncludeEuroAdoption] = useState(false);
  const isCentralBankCat = CENTRAL_BANK_INDEPENDENCE_BILL_CATEGORIES.has(cat as BillCategory);
  // Custom (flavor/roleplay) bills carry no provisions and have no in-game effect.
  const isCustomCat = cat === "custom";
  const [natRows, setNatRows] = useState<NatProvisionInput[]>([{ type: "nationalize" }]);

  const [subsidyProvisions, setSubsidyProvisions] = useState([{ ...EMPTY_SUBSIDY }]);
  // Union-law provision (v3 Phase 7b, industry category). Inclusion is an
  // explicit checkbox (code-review fix #15) — bias=0 is a valid, legislatable
  // reset to neutral, not just "don't propose one" (see ProposeBillModal.tsx).
  const [includeUnionLaw, setIncludeUnionLaw] = useState(false);
  const [unionLawBias, setUnionLawBias] = useState(0);
  // Electoral law — franchise and registration access, each opt-in separately so
  // a bill touching one axis does not silently reset the other.
  const [electoralLaw, setElectoralLaw] = useState({
    includeVotingAge: false,
    votingAge: 18,
    includeRegAccess: false,
    registrationAccess: 0,
    includeJapanShugiinReform: false,
  });
  const {
    includeVotingAge,
    votingAge,
    includeRegAccess,
    registrationAccess,
    includeJapanShugiinReform,
  } = electoralLaw;
  function updateElectoralLaw<K extends keyof typeof electoralLaw>(
    key: K,
    value: (typeof electoralLaw)[K]
  ) {
    setElectoralLaw((current) => ({ ...current, [key]: value }));
  }
  const canProposeJapanShugiinReform =
    countryId === COUNTRY_CLIENT_CONFIGS.JP.id &&
    worldFlags.preset === "1991-default" &&
    (worldFlags.currentYear ?? 0) >= 1994;
  // Central bank independence — opt-in, economy category. grant hands
  // rate-setting to the bank; revoke returns it to the government.
  const [includeCbIndependence, setIncludeCbIndependence] = useState(false);
  const [cbIndependenceAction, setCbIndependenceAction] =
    useState<CentralBankIndependenceAction>("grant");
  // Economic system reform — opt-in, economy category, planned-era countries.
  const canReformEconomicSystem = cat === "economy" && canLegislateEconomicSystem(countryId);
  const [includeEconomicReform, setIncludeEconomicReform] = useState(false);
  const [economicReformTarget, setEconomicReformTarget] =
    useState<EconomicSystemTarget>("dual_track");
  // Union ban (player suggestion #93): "bias" = the slider law; "ban"/"repeal_ban"
  // are standalone actions that leave the bias untouched at enactment.
  const [unionLawAction, setUnionLawAction] = useState<"bias" | "ban" | "repeal_ban">("bias");

  // Some provisions stand alone and need no accompanying policy row:
  // e.g. "Return rate-setting to the government" or a franchise change are
  // complete statutes by themselves. Each such provision occupies one
  // MAX_PROVISIONS slot, so policy rows get what is left.
  const standaloneProvisionCount =
    (canProposeEuro && includeEuroAdoption ? 1 : 0) +
    (includeTreaty ? 1 : 0) +
    (isCentralBankCat && includeCbIndependence ? 1 : 0) +
    (canReformEconomicSystem && includeEconomicReform ? 1 : 0) +
    (isElectoralCat && (includeVotingAge || includeRegAccess) ? 1 : 0);
  const hasStandaloneProvision = standaloneProvisionCount > 0;
  // A standalone provision occupies one of the bill's MAX_PROVISIONS slots, so
  // the policy rows get what is left.

  const maxPolicyRows = Math.max(0, MAX_PROVISIONS - standaloneProvisionCount);

  const blockedProvisionKeys = new Set(
    (blockedProvisions ?? []).map((bp) => `${bp.legislationTypeId}:${bp.policyOptionId}`)
  );

  const selectedProposalWarning = proposalWarnings?.[billChamber] ?? proposalWarning ?? null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    fetchJson<LegislationTypeOption[]>(
      `/api/game/legislation-types?scope=national&country=${countryId.toLowerCase()}&nocache=1`,
      { feature: "propose-legislation-types" }
    )
      .then((types) => {
        if (Array.isArray(types)) setLegislationTypes(types);
      })
      .catch(() => {});
  }, [countryId]);

  useEffect(() => {
    // SSOT for the national policy-store id — RU stores under su_national,
    // US under federal; a raw `${cc}_national` template reads an id nothing
    // writes, so the "(current law)" markers silently vanish.
    const policyStoreId = getNationalStateId(countryId);
    fetch(`/api/game/current-policies?stateId=${encodeURIComponent(policyStoreId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, number>) => setCurrentPolicies(data))
      .catch(() => setCurrentPolicies({}));
  }, [countryId]);

  const allowedDomains: string[] =
    (CATEGORY_TO_POLICY_DOMAINS as Record<string, string[]>)[cat] ?? [];
  const filteredTypes = legislationTypes.filter((lt) => allowedDomains.includes(lt.policyDomain));

  // Only offer categories this country actually has laws for. Trade/industry
  // always qualify (own builders); policy categories require a matching
  // legislation type — so e.g. agriculture/technology are hidden for countries
  // without those laws (UK/US) but shown where they exist (JP/DE/CN).
  const availableCategories = useMemo(
    () => getProposableBillCategories(legislationTypes),
    [legislationTypes]
  );

  // If the current category became unavailable once types loaded, fall back to
  // the first available one so the form never sits on a hidden category.
  useEffect(() => {
    if (legislationTypes.length > 0 && !(availableCategories as string[]).includes(cat)) {
      handleCategoryChange(availableCategories[0] ?? BILL_CATEGORIES[0]);
    }
  }, [availableCategories, cat, legislationTypes.length]);

  function handleCategoryChange(nextCat: string) {
    setCat(nextCat);
    setRows([{ ...EMPTY_PROVISION_ROW }]);
    setSubsidyProvisions([{ ...EMPTY_SUBSIDY }]);
  }

  function updateRow(index: number, patch: Partial<ProvisionRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= maxPolicyRows) return;
    setRows((prev) => [...prev, { ...EMPTY_PROVISION_ROW }]);
  }

  function removeRow(index: number) {
    if (rows.length <= (hasStandaloneProvision ? 0 : 1)) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      showToast("Title and summary are required.", "error");
      return;
    }

    let provisionsPayload: unknown[];
    if (isCustomCat) {
      provisionsPayload = [];
    } else if (isNatCat) {
      const err = validateNatRows(natRows);
      if (err) {
        showToast(err, "error");
        return;
      }
      provisionsPayload = toNatPayload(natRows);
    } else if (isTradeCat) {
      if (tradeSubType === "embargo") {
        const err = validateEmbargoRows(embargoRows);
        if (err) {
          showToast(err, "error");
          return;
        }
        provisionsPayload = embargoRows.map(embargoToPayload);
      } else {
        const err = validateTariffRows(tariffRows);
        if (err) {
          showToast(err, "error");
          return;
        }
        provisionsPayload = tariffRows.map(tariffToPayload);
      }
    } else if (isSubsidyCat) {
      const invalid = subsidyProvisions.find(
        (p) => p.scopeType === "sector" && !p.targetSectorType.trim()
      );
      if (invalid) {
        showToast("Sector-scoped subsidy provisions require a target sector type.", "error");
        return;
      }
      provisionsPayload = subsidyProvisions.map((p) => ({
        type: p.type,
        scopeType: p.scopeType,
        ...(p.scopeType === "sector" && p.targetSectorType
          ? { targetSectorType: p.targetSectorType }
          : {}),
        ...(p.targetStrategyId.trim() ? { targetStrategyId: p.targetStrategyId.trim() } : {}),
        ...(p.type === "subsidy" ? { domesticOnly: p.domesticOnly } : {}),
      }));
      if (includeUnionLaw) {
        provisionsPayload.push({
          type: "union_law",
          bias: unionLawAction === "bias" ? unionLawBias : 0,
          ...(unionLawAction !== "bias" ? { banAction: unionLawAction } : {}),
        });
      }
    } else {
      // A bill whose whole content is a standalone provision needs no policy
      // row: an untouched blank starter row there is the ABSENCE of a policy
      // provision, not an incomplete one, so drop it instead of refusing the
      // bill. A row the player actually started still has to be finished.
      const policyRows = hasStandaloneProvision ? rows.filter((r) => r.legislationTypeId) : rows;
      if (policyRows.some((r) => !r.legislationTypeId)) {
        showToast("Every provision needs a policy type.", "error");
        return;
      }
      // The row cap already accounts for the standalone provision, but a player
      // can fill the rows first and tick the box afterwards, which the cap
      // cannot retract. Say so here rather than letting the body schema refuse
      // the bill with a bare count.
      if (policyRows.length + standaloneProvisionCount > MAX_PROVISIONS) {
        showToast(
          `A bill carries at most ${MAX_PROVISIONS} provisions, and the option selected below is one of them. Remove a policy provision.`,
          "error"
        );
        return;
      }
      for (const r of policyRows) {
        const lt = legislationTypes.find((t) => t._id === r.legislationTypeId);
        if (lt?.policyOptions?.length && !r.policyOptionId) {
          showToast("Every provision needs a policy option selected.", "error");
          return;
        }
        // Tax-slider provisions must move the rate at least one step (the
        // server re-validates against the live rate).
        const slider = lt?.taxSliderEstimate;
        if (slider) {
          const proposed = r.proposedRate ?? slider.currentRate;
          if (Math.abs(proposed - slider.currentRate) < slider.step - 1e-9) {
            showToast(`Tax proposals must change the rate by at least ${slider.step}.`, "error");
            return;
          }
        }
      }
      provisionsPayload = policyRows.map((r) => ({
        legislationTypeId: r.legislationTypeId,
        ...(r.policyOptionId ? { policyOptionId: r.policyOptionId } : {}),
        effectDirection: r.effectDirection,
        economic: r.economic,
        social: r.social,
        ...(r.proposedRate !== undefined ? { proposedRate: r.proposedRate } : {}),
      }));
      if (isElectoralCat && (includeVotingAge || includeRegAccess || includeJapanShugiinReform)) {
        provisionsPayload.push({
          type: "electoral_law",
          ...(includeVotingAge ? { votingAge } : {}),
          ...(includeRegAccess ? { registrationAccess } : {}),
          ...(includeJapanShugiinReform ? { japanShugiinReform: true } : {}),
        });
      }
      if (canProposeEuro && includeEuroAdoption) {
        provisionsPayload.push({ type: "euro_adoption" });
      }
      if (includeTreaty)
        provisionsPayload.push({
          type: "european_treaty",
          treaty: "maastricht",
          action: treatyAction,
        });
      if (isCentralBankCat && includeCbIndependence) {
        provisionsPayload.push({
          type: "central_bank_independence",
          action: cbIndependenceAction,
        });
      }
      if (canReformEconomicSystem && includeEconomicReform) {
        provisionsPayload.push({
          type: "economic_system_reform",
          target: economicReformTarget,
        });
      }
    }

    setSubmitting(true);
    try {
      const {
        response: res,
        data,
        cancelled,
      } = await postBillProposalWithElectionConfirmation({
        url: `${legislatureApiUrl(countryId)}/bills`,
        body: {
          title: title.trim(),
          summary: summary.trim(),
          chamber: billChamber,
          ...(proposeViaPartyNpp ? { proposeViaPartyNpp: true } : {}),
          category: cat,
          provisions: provisionsPayload,
        },
      });
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        showToast(apiErrorText(data, "Failed to propose bill."), "error");
      } else {
        showToast("Bill proposed and opened for voting.", "success");
        void captureProductEvent("bill_drafted");
        onSuccess();
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const npiCost = getProvisionCostTotal(
    isCustomCat
      ? 0
      : isTradeCat
        ? 0
        : isNatCat
          ? natRows.length
          : isSubsidyCat
            ? subsidyProvisions.length
            : // Standalone provisions ride the same ladder server-side, so they
              // have to be counted here too or the modal quotes a cost the
              // proposal then charges more than.
              rows.filter((r) => r.legislationTypeId).length + standaloneProvisionCount
  );
  const submitBlockedByActiveBill = hasActiveBill && !adminOverride;
  const submitDisabled =
    submitBlockedByActiveBill ||
    submitting ||
    !title.trim() ||
    !summary.trim() ||
    // Custom (flavor) bills carry no provisions, so the default empty provision
    // row must not gate submission (#910 — Propose button dead for custom bills).
    // A bill carrying a standalone provision is the same case: its content is
    // complete without a policy row, so the untouched blank starter row must not
    // grey out Propose either (#1250). Without one, an empty row list is not a
    // proposable bill: every non-custom category needs at least one provision,
    // and the player can reach zero rows by removing them and then clearing the
    // standalone provision that allowed it.
    (!isCustomCat &&
      !isTradeCat &&
      !isSubsidyCat &&
      !isNatCat &&
      !hasStandaloneProvision &&
      (rows.length === 0 || rows.some((r) => !r.legislationTypeId)));

  const chamberSelectable = chambers.length > 1;
  return {
    kind: "context" as const,
    context: {
      EMPTY_SUBSIDY,
      addRow,
      adminOverride,
      availableCategories,
      billChamber,
      blockedProvisionKeys,
      canDecideTreaty,
      canProposeEuro,
      canProposeJapanShugiinReform,
      canReformEconomicSystem,
      cat,
      cbIndependenceAction,
      chamberSelectable,
      chambers,
      countryId,
      currentPolicies,
      domesticOnlyLabel,
      economicReformTarget,
      embargoRows,
      enabledCountryIds,
      filteredTypes,
      handleCategoryChange,
      handleSubmit,
      hasStandaloneProvision,
      includeCbIndependence,
      includeEconomicReform,
      includeEuroAdoption,
      includeJapanShugiinReform,
      includeRegAccess,
      includeUnionLaw,
      includeVotingAge,
      isCentralBankCat,
      isCustomCat,
      isElectoralCat,
      isNatCat,
      isSubsidyCat,
      isTradeCat,
      legislationTypes,
      maxPolicyRows,
      natRows,
      npiCost,
      onClose,
      registrationAccess,
      removeRow,
      rows,
      selectedProposalWarning,
      setBillChamber,
      setCbIndependenceAction,
      setEconomicReformTarget,
      setEmbargoRows,
      setIncludeCbIndependence,
      setIncludeEconomicReform,
      setIncludeEuroAdoption,
      setIncludeUnionLaw,
      setNatRows,
      setSubsidyProvisions,
      setSummary,
      setTariffRows,
      setTitle,
      setTradeSubType,
      setTreatyAction,
      setUnionLawAction,
      setUnionLawBias,
      submitBlockedByActiveBill,
      submitDisabled,
      submitting,
      subsidyProvisions,
      summary,
      tariffRows,
      title,
      tradeSubType,
      treatyAction,
      unionLawAction,
      unionLawBias,
      updateElectoralLaw,
      updateRow,
      votingAge,
    },
  };
}
export type LegacyProposeLegislationModalViewContext = Extract<
  ReturnType<typeof useLegacyProposeLegislationModalContext>,
  { kind: "context" }
>["context"];

function LegacyProposeLegislationModal(
  ...args: Parameters<typeof useLegacyProposeLegislationModalContext>
) {
  const result = useLegacyProposeLegislationModalContext(...args);
  return renderLegacyProposeLegislationModalView(result.context);
}

export function ProposeLegislationModal(
  props: Parameters<typeof LegacyProposeLegislationModal>[0]
) {
  const flags = useWorldFlags();
  if (!flags.loaded || flags.failed) {
    return <LegislationSystemGate failed={flags.failed} onClose={props.onClose} />;
  }
  const useV2 =
    flags.resetSystemVersions.legislation === "v2" &&
    flags.resetV2Countries.includes(props.countryId);
  if (useV2) {
    return (
      <GuidedLegislationModal
        countryId={props.countryId}
        endpoint={`${legislatureApiUrl(props.countryId)}/bills`}
        chambers={props.chambers}
        initialChamber={props.defaultChamber ?? props.chambers[0]?.value ?? ""}
        adminOverride={props.adminOverride}
        offerSubsidies={true}
        proposeViaPartyNpp={props.proposeViaPartyNpp}
        canSubmit={props.adminOverride === true || !props.hasActiveBill}
        hasActiveBill={props.hasActiveBill}
        domesticOnlyLabel={props.domesticOnlyLabel}
        onClose={props.onClose}
        onSuccess={props.onSuccess}
      />
    );
  }
  return <LegacyProposeLegislationModal {...props} />;
}
