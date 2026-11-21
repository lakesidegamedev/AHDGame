"use client";
import { renderGuidedLegislationModalView } from "./GuidedLegislationModal.view";

import { observedDirection } from "./guidedLegislationFormat";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { LawChoice } from "@/lib/resetLegislation/rules/eligibility";
import { useToast } from "@/contexts/ToastContext";
import { postBillProposalWithElectionConfirmation } from "@/components/bills/BillAutoFailWarning";
import { CUSTOM_BILL_BODY_MAX_LENGTH, MAX_PROVISIONS } from "@shared/constants/legislation";
import type { BillCategory } from "@shared/constants/legislation";
import { primaryMetricById, primaryMetrics } from "@/lib/resetMetrics/catalog";
import { playerMetricDescription } from "@/lib/resetMetrics/presentation";
import { estimateObservedMetricChange } from "@/lib/resetMetrics/rules/effectForecast";
import {
  isResetMetricScoreCountry,
  type ResetMetricScoreCountry,
} from "@/lib/resetMetrics/conditionScore";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";

import {
  toPayload as embargoToPayload,
  type EmbargoProvisionInput,
} from "@/components/bills/embargoProvisionTypes";
import { useEnabledCountryIds } from "@/lib/hooks/useEnabledCountryIds";

interface CatalogOption {
  option: { choice: LawChoice; annualAllocation: number };
  title: string;
  description: string;
  currentChoice: LawChoice;
  currentAnnualAllocation: number;
  annualAllocationDelta: number;
  primaryMetricEffects: { metricId: string; favorableNormalizedPoints: number }[];
  balanceBasis: "game-calibrated-provisional";
}

interface CatalogFamily {
  familyId: string;
  title: string;
  domain: string;
  primaryMetricIds: string[];
  currentLaw: string;
  currentLawDescription: string;
  currentChoice: LawChoice;
  overseeingSeatId: string | null;
  overseeingAgencyId: string;
  overseeingAgencyName?: string;
  options: CatalogOption[];
}

interface CatalogTax {
  id: string;
  title: string;
  existingLegislationTypeId: string;
}

interface CatalogMetric {
  id: string;
  name: string;
  description: string;
}

interface CatalogResponse {
  balanceNotice: string;
  year?: number;
  families: CatalogFamily[];
  metrics?: CatalogMetric[];
  taxes: CatalogTax[];
}

interface MetricBoardResponse {
  metrics?: Array<{ id: string; observation: { value: number | null } }>;
}

interface LegacyTaxType {
  _id: string;
  name: string;
  taxSliderEstimate?: {
    minRate: number;
    maxRate: number;
    step: number;
    currentRate: number;
  };
}

type DraftProvision =
  | { kind: "embargo"; row: EmbargoProvisionInput }
  | {
      kind: "law";
      family: CatalogFamily;
      option: CatalogOption;
    }
  | {
      kind: "tax";
      tax: CatalogTax;
      rate: number;
      currentRate: number;
    }
  | {
      kind: "subsidy";
      action: SubsidyAction;
      scopeType: SubsidyScope;
      targetSectorType: OperatingSectorType | "";
      domesticOnly: boolean;
    };

type SubsidyAction = "subsidy" | "end_subsidy";
export type SubsidyScope = "economy_wide" | "sector";

const TAXES_DOMAIN = "Taxes";
const SUBSIDIES_DOMAIN = "Subsidies";
const TRADE_DOMAIN = "Trade";

const SUBSIDY_ACTIONS: { action: SubsidyAction; title: string; description: string }[] = [
  {
    action: "subsidy",
    title: "Grant a subsidy",
    description: "Qualifying companies earn a +7.5% profit margin, paid from the budget.",
  },
  {
    action: "end_subsidy",
    title: "End a subsidy",
    description: "Withdraw an active subsidy for the economy or one sector.",
  },
];

function subsidyTargetLabel(provision: {
  scopeType: SubsidyScope;
  targetSectorType: OperatingSectorType | "";
}): string {
  return provision.scopeType === "sector" && provision.targetSectorType
    ? OPERATING_SECTOR_TYPE_LABELS[provision.targetSectorType]
    : "Economy-wide";
}

function subsidyTargetKey(provision: {
  scopeType: SubsidyScope;
  targetSectorType: OperatingSectorType | "";
}): string {
  return `subsidy:${provision.scopeType}:${provision.targetSectorType}`;
}

type Step = "starting" | "family" | "level" | "review" | "overview";

function resetMetricCountry(countryId: CountryId): ResetMetricScoreCountry | null {
  const normalized = countryId.toUpperCase();
  return isResetMetricScoreCountry(normalized) ? normalized : null;
}

function categoryForDomain(domain: string, scope: "national" | "regional"): BillCategory {
  const normalized = domain.toLowerCase();
  if (normalized.includes("health")) return "healthcare";
  if (normalized.includes("education") || normalized.includes("skill")) return "education";
  if (normalized.includes("environment") || normalized.includes("climate")) return "environment";
  if (normalized.includes("defense") || normalized.includes("security")) return "defense";
  if (normalized.includes("immigration") || normalized.includes("migration")) return "immigration";
  if (normalized.includes("infrastructure") || normalized.includes("transport")) {
    return "infrastructure";
  }
  if (normalized.includes("agriculture") || normalized.includes("food")) return "agriculture";
  // The reviewed economy domain also mentions trade. Its law provisions are
  // economic policies, whereas legacy trade bills require tariffs or embargoes.
  if (normalized.includes("economy")) return "economy";
  if (normalized.includes("trade")) return scope === "regional" ? "economy" : "trade";
  if (normalized.includes("technology") || normalized.includes("research")) return "technology";
  if (normalized.includes("justice") || normalized.includes("policing")) return "public safety";
  if (normalized.includes("civil") || normalized.includes("governance")) return "social";
  return "economy";
}

function categoryForDraft(
  draft: readonly DraftProvision[],
  scope: "national" | "regional"
): BillCategory {
  const categories = new Set(
    draft.map((provision) =>
      provision.kind === "embargo"
        ? "trade"
        : provision.kind === "tax"
          ? "tax"
          : provision.kind === "subsidy"
            ? "industry"
            : categoryForDomain(provision.family.domain, scope)
    )
  );
  return categories.size === 1 ? ([...categories][0] as BillCategory) : "custom";
}

export interface GuidedLegislationModalProps {
  countryId: CountryId;
  endpoint: string;
  chambers: readonly { value: string; label: string }[];
  initialChamber: string;
  scope?: "national" | "regional";
  regionId?: string;
  adminOverride?: boolean;
  canSubmit?: boolean;
  hasActiveBill?: boolean;
  /**
   * Offer the Subsidies domain. Off where the endpoint accepts only reviewed
   * law and tax provisions (a Cabinet bill).
   */
  offerSubsidies?: boolean;
  /** Disable for national endpoints that accept only reviewed laws and taxes. */
  offerTrade?: boolean;
  /** Request a seated party NPP to introduce this regional bill for its chair. */
  proposeViaPartyNpp?: boolean;
  /** Wording of the subsidy "home companies only" toggle. */
  domesticOnlyLabel?: string;
  /**
   * Governor queue mode: the bill is handed to the first eligible party NPP, who
   * introduces it next turn. Flavor-only custom bills are not offered.
   */
  queue?: { eligibleNpps: readonly { _id: string; name: string }[] };
  onClose: () => void;
  onSuccess: () => void;
}

function useGuidedLegislationModalContext({
  countryId,
  endpoint,
  chambers,
  initialChamber,
  scope = "national",
  regionId,
  adminOverride,
  canSubmit = true,
  hasActiveBill = false,
  offerSubsidies = true,
  offerTrade = true,
  proposeViaPartyNpp = false,
  domesticOnlyLabel = scope === "regional"
    ? "Companies headquartered in this region only"
    : "Domestic companies only",
  queue,
  onClose,
  onSuccess,
}: GuidedLegislationModalProps) {
  const { showToast } = useToast();
  const enabledCountryIds = useEnabledCountryIds();
  const canOfferTrade = scope === "national" && offerTrade && !queue;
  const [embargoRows, setEmbargoRows] = useState<EmbargoProvisionInput[]>([
    { action: "embargo", targetCountry: "", commodity: "all", direction: "both", mode: "block" },
  ]);
  const t = useTranslations("layout.guidedLegislation");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [legacyTaxes, setLegacyTaxes] = useState<LegacyTaxType[]>([]);
  const [metricValues, setMetricValues] = useState<Record<string, number | null>>({});
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("starting");
  const [path, setPath] = useState<"domain" | "metric" | "custom">("domain");
  const [domain, setDomain] = useState("");
  const [metric, setMetric] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<LawChoice | "">("");
  const [selectedTaxId, setSelectedTaxId] = useState("");
  const [taxRate, setTaxRate] = useState<number | "">("");
  const [subsidyAction, setSubsidyAction] = useState<SubsidyAction | "">("");
  const [subsidyScope, setSubsidyScope] = useState<SubsidyScope>("economy_wide");
  const [subsidySector, setSubsidySector] = useState<OperatingSectorType | "">("");
  const [subsidyDomesticOnly, setSubsidyDomesticOnly] = useState(false);
  const targetNppId = queue?.eligibleNpps[0]?._id ?? "";
  const [draft, setDraft] = useState<DraftProvision[]>([]);
  const [title, setTitle] = useState("");
  const [messageBodies, setMessageBodies] = useState({ policy: "", custom: "" });
  const [chamber, setChamber] = useState(initialChamber);
  const [submitting, setSubmitting] = useState(false);
  const isCustomBill = path === "custom";
  const summary = isCustomBill ? messageBodies.custom : messageBodies.policy;
  const bodyLimit = isCustomBill ? CUSTOM_BILL_BODY_MAX_LENGTH : 2000;
  const bodyTooLong = summary.length > bodyLimit;
  function setSummary(value: string) {
    setMessageBodies((current) => ({ ...current, [isCustomBill ? "custom" : "policy"]: value }));
  }
  const hasStartedBill = draft.length > 0 || Boolean(title.trim()) || Boolean(summary.trim());
  const canReturnToBill = hasStartedBill && step !== "overview";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(
        `/api/country/${countryId}/reset-legislation/catalog?scope=${scope}${regionId ? `&regionId=${encodeURIComponent(regionId)}` : ""}`,
        {
          cache: "no-store",
        }
      ).then(async (response) => {
        const body = (await response.json()) as CatalogResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The v2 law catalog is unavailable");
        return body;
      }),
      fetch(
        `/api/game/legislation-types?scope=${scope === "regional" ? "state" : "national"}&country=${countryId.toLowerCase()}${regionId ? `&regionId=${encodeURIComponent(regionId)}` : ""}&nocache=1&exactTax=1`,
        { cache: "no-store" }
      ).then(async (response) => {
        if (!response.ok) throw new Error("The tax catalog is unavailable");
        return (await response.json()) as LegacyTaxType[];
      }),
      fetch(
        `/api/country/${countryId}/reset-metrics${regionId ? `?region=${encodeURIComponent(regionId)}` : ""}`,
        { cache: "no-store" }
      ).then(async (response) => {
        if (!response.ok) return {} as MetricBoardResponse;
        return (await response.json()) as MetricBoardResponse;
      }),
    ])
      .then(([nextCatalog, types, metricBoard]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setLegacyTaxes(types);
        setMetricValues(
          Object.fromEntries(
            (metricBoard.metrics ?? []).map((row) => [row.id, row.observation.value])
          )
        );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "Catalog load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [countryId, regionId, scope]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (canReturnToBill) {
        setStep("overview");
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [canReturnToBill, onClose]);

  const availableTaxes = useMemo(
    () =>
      (catalog?.taxes ?? []).filter((candidate) =>
        legacyTaxes.some(
          (type) =>
            type._id === candidate.existingLegislationTypeId && Boolean(type.taxSliderEstimate)
        )
      ),
    [catalog, legacyTaxes]
  );
  const domains = useMemo(() => {
    const values = [...new Set(catalog?.families.map((family) => family.domain) ?? [])].sort();
    return [
      ...values,
      ...(availableTaxes.length > 0 ? [TAXES_DOMAIN] : []),
      ...(offerSubsidies ? [SUBSIDIES_DOMAIN] : []),
      ...(canOfferTrade ? [TRADE_DOMAIN] : []),
    ];
  }, [availableTaxes.length, catalog, offerSubsidies, canOfferTrade]);
  const metrics = useMemo(() => {
    const usedIds = new Set(catalog?.families.flatMap((family) => family.primaryMetricIds) ?? []);
    const returned = new Map(
      (catalog?.metrics ?? []).map((candidate) => [candidate.id, candidate])
    );
    return [...usedIds]
      .map((id) => {
        const fallback = primaryMetrics.find((candidate) => candidate.id === id);
        return (
          returned.get(id) ?? {
            id,
            name: fallback?.name ?? `Metric ${id}`,
            description: fallback
              ? playerMetricDescription(fallback)
              : "No metric description is available.",
          }
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [catalog]);
  const metricById = useMemo(
    () => new Map(metrics.map((candidate) => [candidate.id, candidate])),
    [metrics]
  );
  const metricName = (id: string) => metricById.get(id)?.name ?? `Metric ${id}`;
  const normalizedEffectChange = (
    candidateFamily: CatalogFamily,
    candidateOption: CatalogOption,
    metricId: string
  ) => {
    const currentOption = candidateFamily.options.find(
      (entry) => entry.option.choice === candidateFamily.currentChoice
    );
    const currentPoints =
      currentOption?.primaryMetricEffects.find((effect) => effect.metricId === metricId)
        ?.favorableNormalizedPoints ?? 0;
    const proposedPoints =
      candidateOption.primaryMetricEffects.find((effect) => effect.metricId === metricId)
        ?.favorableNormalizedPoints ?? 0;
    return Number((proposedPoints - currentPoints).toFixed(4));
  };
  const metricEffectIndicator = (
    candidateFamily: CatalogFamily,
    candidateOption: CatalogOption,
    metricId: string
  ) => {
    const normalizedChange = normalizedEffectChange(candidateFamily, candidateOption, metricId);
    if (Math.abs(normalizedChange) < 0.0001) return "At equilibrium";
    const definition = primaryMetricById(metricId);
    const country = resetMetricCountry(countryId);
    if (!definition || !country) return "Direction unavailable";
    const forecast = estimateObservedMetricChange({
      metric: definition,
      currentValue: metricValues[metricId] ?? null,
      favorableNormalizedPoints: normalizedChange,
      countryId: country,
      year: catalog?.year ?? 1991,
    });
    return forecast ? observedDirection(forecast.delta) : "Direction unavailable";
  };
  const agencyName = (candidate: CatalogFamily) =>
    candidate.overseeingAgencyName ??
    candidate.overseeingAgencyId
      .replace(/^(us|uk|jp)_/, "")
      .split("_")
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(" ");
  const matchingFamilies = useMemo(() => {
    if (!catalog) return [];
    if (path === "domain") {
      if (domain === TAXES_DOMAIN || domain === SUBSIDIES_DOMAIN) return [];
      return catalog.families.filter((family) => !domain || family.domain === domain);
    }
    return catalog.families.filter((family) => !metric || family.primaryMetricIds.includes(metric));
  }, [catalog, domain, metric, path]);
  const family = catalog?.families.find((candidate) => candidate.familyId === selectedFamilyId);
  const option = family?.options.find((candidate) => candidate.option.choice === selectedChoice);
  const tax = catalog?.taxes.find((candidate) => candidate.id === selectedTaxId);
  const taxType = legacyTaxes.find((candidate) => candidate._id === tax?.existingLegislationTypeId);
  const taxEstimate = taxType?.taxSliderEstimate;
  const taxRateValid =
    taxEstimate != null &&
    typeof taxRate === "number" &&
    Number.isFinite(taxRate) &&
    taxRate >= taxEstimate.minRate &&
    taxRate <= taxEstimate.maxRate &&
    Math.abs(
      (taxRate - taxEstimate.minRate) / taxEstimate.step -
        Math.round((taxRate - taxEstimate.minRate) / taxEstimate.step)
    ) < 1e-7;
  const subsidyValid = subsidyAction !== "" && (subsidyScope !== "sector" || subsidySector !== "");
  function clearSelection() {
    setSelectedFamilyId("");
    setSelectedChoice("");
    setSelectedTaxId("");
    setSubsidyAction("");
  }
  function returnToBill() {
    if (hasStartedBill) setStep("overview");
  }

  function beginAnother() {
    if (draft.some((p) => p.kind === "embargo")) {
      setEmbargoRows(draft.flatMap((p) => (p.kind === "embargo" ? [{ ...p.row }] : [])));
      setPath("domain");
      setDomain(TRADE_DOMAIN);
      setStep("family");
      return;
    }
    setStep("starting");
    setPath("domain");
    setDomain("");
    setMetric("");
    clearSelection();
  }

  function addLawToDraft() {
    if (!family || !option || option.option.choice === option.currentChoice) return;
    const replacesExisting = draft.some(
      (provision) => provision.kind === "law" && provision.family.familyId === family.familyId
    );
    if (!replacesExisting && draft.length >= MAX_PROVISIONS) {
      showToast(`A bill can contain at most ${MAX_PROVISIONS} provisions.`, "error");
      return;
    }
    setDraft((current) => [
      ...current.filter(
        (provision) => provision.kind !== "law" || provision.family.familyId !== family.familyId
      ),
      { kind: "law", family, option },
    ]);
    setStep("overview");
  }

  function addTaxToDraft() {
    const estimate = taxEstimate;
    if (
      !tax ||
      !estimate ||
      !taxRateValid ||
      typeof taxRate !== "number" ||
      taxRate === estimate.currentRate
    )
      return;
    const replacesExisting = draft.some(
      (provision) =>
        provision.kind === "tax" &&
        provision.tax.existingLegislationTypeId === tax.existingLegislationTypeId
    );
    if (!replacesExisting && draft.length >= MAX_PROVISIONS) {
      showToast(`A bill can contain at most ${MAX_PROVISIONS} provisions.`, "error");
      return;
    }
    setDraft((current) => [
      ...current.filter(
        (provision) =>
          provision.kind !== "tax" ||
          provision.tax.existingLegislationTypeId !== tax.existingLegislationTypeId
      ),
      { kind: "tax", tax, rate: taxRate, currentRate: estimate.currentRate },
    ]);
    setStep("overview");
  }

  function addSubsidyToDraft() {
    if (!subsidyValid) return;
    const provision: DraftProvision = {
      kind: "subsidy",
      action: subsidyAction,
      scopeType: subsidyScope,
      targetSectorType: subsidyScope === "sector" ? subsidySector : "",
      domesticOnly: subsidyAction === "subsidy" && subsidyDomesticOnly,
    };
    // Granting and ending the same target in one bill contradict each other, so a
    // second row for a target replaces the first.
    const key = subsidyTargetKey(provision);
    const sameTarget = (candidate: DraftProvision) =>
      candidate.kind === "subsidy" && subsidyTargetKey(candidate) === key;
    if (!draft.some(sameTarget) && draft.length >= MAX_PROVISIONS) {
      showToast(`A bill can contain at most ${MAX_PROVISIONS} provisions.`, "error");
      return;
    }
    setDraft((current) => [...current.filter((candidate) => !sameTarget(candidate)), provision]);
    setStep("overview");
  }

  async function submit() {
    if (
      !isCustomBill &&
      draft.some((p) => p.kind === "embargo") &&
      (!canOfferTrade || draft.some((p) => p.kind !== "embargo"))
    ) {
      showToast("Embargoes require a separate national Trade bill.", "error");
      return;
    }
    if (queue && !targetNppId) {
      showToast(t("noEligiblePartyNpp"), "error");
      return;
    }
    if (!canSubmit) {
      showToast(t("activeBillProposalBlocked"), "error");
      return;
    }
    if (!title.trim() || !summary.trim() || (!isCustomBill && draft.length === 0)) {
      showToast(
        isCustomBill ? t("required") : "Add a title, summary, and at least one provision.",
        "error"
      );
      return;
    }
    if (bodyTooLong) {
      showToast(t("tooLong", { limit: bodyLimit }), "error");
      return;
    }
    setSubmitting(true);
    try {
      const provisions = (isCustomBill ? [] : draft).map((provision) => {
        if (provision.kind === "embargo") return embargoToPayload(provision.row);
        if (provision.kind === "law") {
          return {
            type: "reset_law",
            familyId: provision.family.familyId,
            scope,
            ...(scope === "regional" && regionId ? { regionId } : {}),
            choice: provision.option.option.choice,
          };
        }
        if (provision.kind === "subsidy") {
          return {
            type: provision.action,
            scopeType: provision.scopeType,
            ...(provision.scopeType === "sector"
              ? { targetSectorType: provision.targetSectorType }
              : {}),
            ...(provision.action === "subsidy" ? { domesticOnly: provision.domesticOnly } : {}),
          };
        }
        return {
          legislationTypeId: provision.tax.existingLegislationTypeId,
          proposedRate: provision.rate,
          effectDirection: 0,
        };
      });
      const { response, data, cancelled } = await postBillProposalWithElectionConfirmation({
        url: endpoint,
        body: {
          title: title.trim(),
          summary: summary.trim(),
          chamber,
          category: isCustomBill ? "custom" : categoryForDraft(draft, scope),
          provisions,
          ...(queue ? { targetNppId } : {}),
          ...(proposeViaPartyNpp ? { proposeViaPartyNpp: true } : {}),
          ...(adminOverride ? { adminOverride: true } : {}),
        },
      });
      if (cancelled) return;
      if (!response.ok) {
        showToast(
          data.error ??
            (queue ? "The bill could not be queued." : "The bill could not be proposed."),
          "error"
        );
        return;
      }
      showToast(queue ? "Bill queued." : "Bill proposed.", "success");
      onSuccess();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const steps: { id: Step; label: string }[] = isCustomBill
    ? [
        { id: "starting", label: "Starting point" },
        { id: "overview", label: t("customBill") },
      ]
    : [
        { id: "starting", label: "Starting point" },
        { id: "family", label: "Law family" },
        { id: "level", label: "Policy level" },
        { id: "review", label: "Review provision" },
        { id: "overview", label: "Bill overview" },
      ];
  return {
    kind: "context" as const,
    context: {
      SUBSIDIES_DOMAIN,
      SUBSIDY_ACTIONS,
      TAXES_DOMAIN,
      TRADE_DOMAIN,
      addLawToDraft,
      addSubsidyToDraft,
      addTaxToDraft,
      adminOverride,
      agencyName,
      availableTaxes,
      beginAnother,
      bodyLimit,
      bodyTooLong,
      canOfferTrade,
      canReturnToBill,
      canSubmit,
      catalog,
      chamber,
      chambers,
      clearSelection,
      countryId,
      domain,
      domains,
      domesticOnlyLabel,
      draft,
      embargoRows,
      enabledCountryIds,
      family,
      hasActiveBill,
      isCustomBill,
      legacyTaxes,
      loadError,
      matchingFamilies,
      metric,
      metricEffectIndicator,
      metricName,
      metrics,
      normalizedEffectChange,
      onClose,
      option,
      path,
      queue,
      returnToBill,
      setChamber,
      setDomain,
      setDraft,
      setEmbargoRows,
      setMetric,
      setPath,
      setSelectedChoice,
      setSelectedFamilyId,
      setSelectedTaxId,
      setStep,
      setSubsidyAction,
      setSubsidyDomesticOnly,
      setSubsidyScope,
      setSubsidySector,
      setSummary,
      setTaxRate,
      setTitle,
      showToast,
      step,
      steps,
      submit,
      submitting,
      subsidyAction,
      subsidyDomesticOnly,
      subsidyScope,
      subsidySector,
      subsidyTargetKey,
      subsidyTargetLabel,
      subsidyValid,
      summary,
      t,
      targetNppId,
      tax,
      taxEstimate,
      taxRate,
      taxRateValid,
      title,
    },
  };
}
export type GuidedLegislationModalViewContext = Extract<
  ReturnType<typeof useGuidedLegislationModalContext>,
  { kind: "context" }
>["context"];

export function GuidedLegislationModal(
  ...args: Parameters<typeof useGuidedLegislationModalContext>
) {
  const result = useGuidedLegislationModalContext(...args);
  return renderGuidedLegislationModalView(result.context);
}
