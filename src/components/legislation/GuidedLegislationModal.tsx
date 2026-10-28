"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { LawChoice } from "@/lib/resetLegislation/rules/eligibility";
import { useToast } from "@/contexts/ToastContext";
import { postBillProposalWithElectionConfirmation } from "@/components/bills/BillAutoFailWarning";
import {
  BILL_PROPOSE_ACTION_COST,
  CUSTOM_BILL_BODY_MAX_LENGTH,
  getProvisionCostTotal,
  MAX_PROVISIONS,
} from "@shared/constants/legislation";
import type { BillCategory } from "@shared/constants/legislation";
import { primaryMetricById, primaryMetrics } from "@/lib/resetMetrics/catalog";
import { playerMetricDescription } from "@/lib/resetMetrics/presentation";
import { estimateObservedMetricChange } from "@/lib/resetMetrics/rules/effectForecast";
import type { ResetMetricScoreCountry } from "@/lib/resetMetrics/conditionScore";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import { SubsidySectorSelect } from "@/components/bills/SubsidySectorSelect";
import { EmbargoProvisionEditor } from "@/components/bills/EmbargoProvisionEditor";
import {
  toPayload as embargoToPayload,
  validateRows as validateEmbargoRows,
  type EmbargoProvisionInput,
} from "@/components/bills/embargoProvisionTypes";
import { useEnabledCountryIds } from "@/lib/hooks/useEnabledCountryIds";
import { formatEmbargoProvisionLabel } from "@/lib/legislature/embargoProvisionLabel";

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
type SubsidyScope = "economy_wide" | "sector";

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

const POSITION_LABEL: Record<LawChoice, string> = {
  far_left: "Far left",
  center_left: "Center left",
  center: "Center",
  center_right: "Center right",
  far_right: "Far right",
  leave_to_states: "Federalism",
};

function money(value: number): string {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
  return `${sign}${compact.format(absolute)}/yr`;
}

function changeClass(value: number, lowerIsGood: boolean): string {
  if (Math.abs(value) < 0.0001) return "text-muted";
  const good = lowerIsGood ? value < 0 : value > 0;
  return good ? "text-success" : "text-error";
}

function resetMetricCountry(countryId: CountryId): ResetMetricScoreCountry | null {
  const normalized = countryId.toUpperCase();
  return normalized === "US" || normalized === "UK" || normalized === "JP" ? normalized : null;
}

function observedDirection(delta: number): string {
  if (Math.abs(delta) < 0.000001) return "At equilibrium";
  return delta > 0 ? "▲" : "▼";
}

function metricDirectionClass(indicator: string): string {
  return indicator === "▲" || indicator === "▼" ? "inline-block text-sm leading-none" : "";
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

export function GuidedLegislationModal({
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 py-8">
      <div className="my-auto w-full max-w-5xl rounded-2xl border border-card-border bg-card shadow-modal">
        <header className="flex items-start justify-between border-b border-card-border p-5">
          <div>
            <h2 className="text-lg font-semibold">
              {queue ? "Queue a bill" : "Guided legislative proposal"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {isCustomBill ? t("noEffects") : `Build up to ${MAX_PROVISIONS} reviewed provisions.`}{" "}
              Costs {BILL_PROPOSE_ACTION_COST} action points and{" "}
              {getProvisionCostTotal(
                isCustomBill ? 0 : draft.filter((p) => p.kind !== "embargo").length
              )}{" "}
              national influence at the current draft size.
              {queue
                ? " The chosen NPP introduces the bill next turn. The cost is refunded if the bill is cancelled."
                : null}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canReturnToBill ? (
              <button
                type="button"
                onClick={returnToBill}
                className="rounded-lg border border-card-border px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary"
              >
                Back to bill
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-xl text-muted"
            >
              ×
            </button>
          </div>
        </header>

        <div className="border-b border-card-border px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {steps.map((candidate) => {
              const className = `rounded px-2 py-1 text-[11px] ${step === candidate.id ? "bg-primary text-white" : "bg-background text-muted"}`;
              return candidate.id === "overview" && canReturnToBill ? (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={returnToBill}
                  className={`${className} hover:text-primary`}
                >
                  {candidate.label}
                </button>
              ) : (
                <span key={candidate.id} className={className}>
                  {candidate.label}
                </span>
              );
            })}
          </div>
        </div>

        <main className="max-h-[72vh] overflow-y-auto p-5">
          {(hasActiveBill || !canSubmit) && !adminOverride ? (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("activeBillProposalBlocked")}
            </div>
          ) : null}
          {loadError && !isCustomBill ? (
            <div
              role="alert"
              className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error"
            >
              {loadError}
            </div>
          ) : null}
          {!catalog && !loadError && !isCustomBill ? (
            <p className="text-sm text-muted">Loading the reviewed catalog...</p>
          ) : null}
          {catalog || step === "starting" || step === "overview" ? (
            <>
              {step === "starting" ? (
                <section className="space-y-5">
                  <div>
                    <h3 className="font-semibold">How do you want to find a law?</h3>
                    <p className="mt-1 text-sm text-muted">{t("startingHelp")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(queue
                      ? (["domain", "metric"] as const)
                      : (["domain", "metric", "custom"] as const)
                    ).map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={value !== "custom" && !catalog}
                        onClick={() => {
                          setPath(value);
                          setDomain("");
                          setMetric("");
                          if (value === "custom") {
                            setDraft([]);
                            clearSelection();
                            setStep("overview");
                          }
                        }}
                        className={`rounded-lg border px-4 py-2 text-sm ${path === value ? "border-primary bg-primary/15 text-primary" : "border-card-border"}`}
                      >
                        {t(
                          value === "custom"
                            ? "customBill"
                            : value === "domain"
                              ? "byDomain"
                              : "byMetric"
                        )}
                      </button>
                    ))}
                  </div>
                  {path === "domain" ? (
                    <label className="block max-w-xl text-sm text-muted">
                      Policy domain
                      <select
                        value={domain}
                        disabled={!catalog}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDomain(value);
                          if (!value) return;
                          clearSelection();
                          setStep("family");
                        }}
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-sm text-foreground"
                      >
                        <option value="">Select a policy domain</option>
                        {domains.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block max-w-xl text-sm text-muted">
                      Metric to affect
                      <select
                        value={metric}
                        disabled={!catalog}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMetric(value);
                          if (!value) return;
                          clearSelection();
                          setStep("family");
                        }}
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-sm text-foreground"
                      >
                        <option value="">Select a metric</option>
                        {metrics.map((candidate) => (
                          <option
                            key={candidate.id}
                            value={candidate.id}
                            title={candidate.description}
                          >
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>
              ) : null}

              {step === "family" ? (
                <section className="space-y-4">
                  <h3 className="font-semibold">Choose a law family</h3>
                  {path === "domain" && domain === TRADE_DOMAIN && canOfferTrade ? (
                    <div className="space-y-4">
                      <EmbargoProvisionEditor
                        value={embargoRows}
                        onChange={setEmbargoRows}
                        countryId={countryId}
                        enabledCountryIds={enabledCountryIds}
                      />
                      <button
                        type="button"
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => {
                          const error = validateEmbargoRows(embargoRows);
                          if (error) {
                            showToast(error, "error");
                            return;
                          }
                          if (
                            embargoRows.length > MAX_PROVISIONS ||
                            embargoRows.some(
                              (r) =>
                                r.targetCountry === countryId ||
                                !enabledCountryIds.includes(r.targetCountry as CountryId)
                            )
                          ) {
                            showToast(
                              "Choose an enabled foreign country for each embargo.",
                              "error"
                            );
                            return;
                          }
                          if (draft.some((p) => p.kind !== "embargo")) {
                            showToast("Embargoes require a separate national Trade bill.", "error");
                            return;
                          }
                          setDraft(
                            embargoRows.map((row) => ({ kind: "embargo", row: { ...row } }))
                          );
                          setStep("overview");
                        }}
                      >
                        Add to draft bill
                      </button>
                    </div>
                  ) : path === "domain" && domain === SUBSIDIES_DOMAIN ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SUBSIDY_ACTIONS.map((candidate) => (
                        <button
                          key={candidate.action}
                          type="button"
                          onClick={() => {
                            clearSelection();
                            setSubsidyAction(candidate.action);
                            setSubsidyScope("economy_wide");
                            setSubsidySector("");
                            setSubsidyDomesticOnly(false);
                            setStep("level");
                          }}
                          className="rounded-xl border border-card-border bg-background/40 p-4 text-left hover:border-primary"
                        >
                          <span className="font-medium">{candidate.title}</span>
                          <span className="mt-2 block text-xs text-muted">
                            {candidate.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : path === "domain" && domain === TAXES_DOMAIN ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {availableTaxes.map((candidate) => (
                        <button
                          key={candidate.existingLegislationTypeId}
                          type="button"
                          onClick={() => {
                            clearSelection();
                            setSelectedTaxId(candidate.id);
                            const type = legacyTaxes.find(
                              (row) => row._id === candidate.existingLegislationTypeId
                            );
                            setTaxRate(type?.taxSliderEstimate?.currentRate ?? "");
                            setStep("level");
                          }}
                          className="rounded-xl border border-card-border bg-background/40 p-4 text-left hover:border-primary"
                        >
                          <span className="font-medium">{candidate.title}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {matchingFamilies.map((candidate) => (
                        <button
                          key={candidate.familyId}
                          type="button"
                          onClick={() => {
                            clearSelection();
                            setSelectedFamilyId(candidate.familyId);
                            setStep("level");
                          }}
                          className="rounded-xl border border-card-border bg-background/40 p-4 text-left hover:border-primary"
                        >
                          <span className="text-[10px] font-semibold text-primary">
                            {candidate.domain}
                          </span>
                          <span className="mt-1 block font-medium">{candidate.title}</span>
                          <span className="mt-2 block text-xs text-muted">
                            Current law: {candidate.currentLaw}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep("starting")}
                    className="rounded-lg border border-card-border px-4 py-2 text-sm"
                  >
                    Back
                  </button>
                </section>
              ) : null}

              {step === "level" && family ? (
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold">{family.title}</h3>
                    <p className="mt-1 text-sm text-muted" title={family.currentLawDescription}>
                      Current law: {family.currentLaw}. The matching level is shown but cannot be
                      proposed.
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Overseeing agency: {agencyName(family)}
                    </p>
                    <p
                      className="mt-1 text-xs text-muted"
                      title="These provisional forecasts compare each option with current law at full implementation and show whether each observed metric is expected to rise or fall. Color indicates whether that movement is favorable or unfavorable."
                    >
                      Expected metric direction from current law at full implementation
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {family.options.map((candidate) => {
                      const current = candidate.option.choice === candidate.currentChoice;
                      return (
                        <button
                          key={candidate.option.choice}
                          type="button"
                          disabled={current}
                          onClick={() => {
                            setSelectedChoice(candidate.option.choice);
                            setStep("review");
                          }}
                          className={`rounded-xl border p-4 text-left ${current ? "cursor-not-allowed border-card-border bg-background/20 opacity-60" : "border-card-border bg-background/40 hover:border-primary"}`}
                        >
                          <span className="text-[10px] font-semibold uppercase text-primary">
                            {POSITION_LABEL[candidate.option.choice]}
                            {current ? " · current law" : ""}
                          </span>
                          <span className="mt-1 block font-semibold">{candidate.title}</span>
                          <span className="mt-2 block text-xs text-muted">
                            {candidate.description}
                          </span>
                          <span className="mt-3 block border-t border-card-border pt-2 text-xs">
                            Allocation{" "}
                            {money(
                              current
                                ? candidate.currentAnnualAllocation
                                : candidate.option.annualAllocation
                            )}
                          </span>
                          <span
                            className={`block text-xs font-medium ${changeClass(candidate.annualAllocationDelta, true)}`}
                          >
                            Budget change {money(candidate.annualAllocationDelta)}
                          </span>
                          {candidate.primaryMetricEffects.map((effect) => {
                            const indicator = metricEffectIndicator(
                              family,
                              candidate,
                              effect.metricId
                            );
                            return (
                              <span
                                key={effect.metricId}
                                className={`block text-xs font-medium ${changeClass(normalizedEffectChange(family, candidate, effect.metricId), false)}`}
                              >
                                {metricName(effect.metricId)}:{" "}
                                <span className={metricDirectionClass(indicator)}>{indicator}</span>
                              </span>
                            );
                          })}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("family")}
                    className="rounded-lg border border-card-border px-4 py-2 text-sm"
                  >
                    Back
                  </button>
                </section>
              ) : null}

              {step === "level" && tax && taxEstimate ? (
                <section className="space-y-5">
                  <div>
                    <h3 className="font-semibold">{tax.title}</h3>
                    <p className="mt-1 text-sm text-muted">
                      Choose the exact statutory rate. The current rate cannot be proposed as a
                      change.
                    </p>
                  </div>
                  <div className="rounded-xl border border-card-border bg-background/40 p-5">
                    <input
                      type="range"
                      className="w-full"
                      min={taxEstimate.minRate}
                      max={taxEstimate.maxRate}
                      step={taxEstimate.step}
                      value={taxRate}
                      onChange={(event) => setTaxRate(Number(event.target.value))}
                    />
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span>Current {taxEstimate.currentRate}%</span>
                      <label>
                        Proposed{" "}
                        <input
                          type="number"
                          className="ml-2 w-24 rounded border border-card-border bg-background px-2 py-1"
                          min={taxEstimate.minRate}
                          max={taxEstimate.maxRate}
                          step={taxEstimate.step}
                          value={taxRate}
                          onChange={(event) =>
                            setTaxRate(event.target.value === "" ? "" : Number(event.target.value))
                          }
                        />
                        %
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("family")}
                      className="rounded-lg border border-card-border px-4 py-2 text-sm"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!taxRateValid || taxRate === taxEstimate.currentRate}
                      onClick={() => setStep("review")}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Review
                    </button>
                  </div>
                </section>
              ) : null}

              {step === "level" && subsidyAction ? (
                <section className="space-y-5">
                  <div>
                    <h3 className="font-semibold">
                      {
                        SUBSIDY_ACTIONS.find((candidate) => candidate.action === subsidyAction)
                          ?.title
                      }
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {subsidyAction === "subsidy"
                        ? "Choose which companies qualify for the +7.5% profit margin."
                        : "Choose the subsidy to withdraw."}
                    </p>
                  </div>
                  <div className="space-y-3 rounded-xl border border-card-border bg-background/40 p-5">
                    <label className="block text-sm text-muted">
                      Coverage
                      <select
                        value={subsidyScope}
                        onChange={(event) => {
                          setSubsidyScope(event.target.value as SubsidyScope);
                          setSubsidySector("");
                        }}
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-sm text-foreground"
                      >
                        <option value="economy_wide">Economy-wide</option>
                        <option value="sector">Specific sector</option>
                      </select>
                    </label>
                    {subsidyScope === "sector" ? (
                      <label className="block text-sm text-muted">
                        Sector
                        <SubsidySectorSelect
                          value={subsidySector}
                          onChange={(value) => setSubsidySector(value as OperatingSectorType | "")}
                          placeholderLabel="Select a sector"
                          className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-sm text-foreground"
                        />
                      </label>
                    ) : null}
                    {subsidyAction === "subsidy" ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={subsidyDomesticOnly}
                          onChange={(event) => setSubsidyDomesticOnly(event.target.checked)}
                          className="rounded"
                        />
                        <span>{domesticOnlyLabel}</span>
                      </label>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("family")}
                      className="rounded-lg border border-card-border px-4 py-2 text-sm"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!subsidyValid}
                      onClick={() => setStep("review")}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Review
                    </button>
                  </div>
                </section>
              ) : null}

              {step === "level" && !family && (!tax || !taxEstimate) && !subsidyAction ? (
                <section className="space-y-4">
                  <div
                    role="alert"
                    className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error"
                  >
                    This policy level is unavailable. Return to the law list and choose another
                    provision.
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("family")}
                    className="rounded-lg border border-card-border px-4 py-2 text-sm"
                  >
                    Back
                  </button>
                </section>
              ) : null}

              {step === "review" ? (
                <section className="space-y-4">
                  <h3 className="font-semibold">Review provision</h3>
                  {family && option ? (
                    <div className="rounded-xl border border-card-border bg-background/40 p-5">
                      <p className="text-xs font-semibold uppercase text-primary">
                        {POSITION_LABEL[option.option.choice]}
                      </p>
                      <h4 className="mt-1 font-semibold">{option.title}</h4>
                      <p className="mt-2 text-sm text-muted">{option.description}</p>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Agency</dt>
                          <dd>{agencyName(family)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Fixed annual allocation</dt>
                          <dd>{money(option.option.annualAllocation)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Change from current law</dt>
                          <dd className={changeClass(option.annualAllocationDelta, true)}>
                            {money(option.annualAllocationDelta)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Balance basis</dt>
                          <dd>Game-calibrated provisional estimate</dd>
                        </div>
                      </dl>
                      <div className="mt-4 space-y-1">
                        <p
                          className="text-xs text-muted"
                          title="These provisional forecasts compare the selected option with current law at full implementation and show whether each observed metric is expected to rise or fall. Color indicates whether that movement is favorable or unfavorable."
                        >
                          Expected metric direction from current law at full implementation
                        </p>
                        {option.primaryMetricEffects.map((effect) => {
                          const indicator = metricEffectIndicator(family, option, effect.metricId);
                          return (
                            <p
                              key={effect.metricId}
                              className={changeClass(
                                normalizedEffectChange(family, option, effect.metricId),
                                false
                              )}
                            >
                              {metricName(effect.metricId)}:{" "}
                              <span className={metricDirectionClass(indicator)}>{indicator}</span>
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  ) : subsidyAction && subsidyValid ? (
                    <div className="rounded-xl border border-card-border bg-background/40 p-5">
                      <h4 className="font-semibold">
                        {subsidyAction === "subsidy" ? "Grant subsidy" : "End subsidy"}:{" "}
                        {subsidyTargetLabel({
                          scopeType: subsidyScope,
                          targetSectorType: subsidySector,
                        })}
                      </h4>
                      <p className="mt-2 text-sm text-muted">
                        {subsidyAction === "subsidy"
                          ? `Qualifying companies earn a +7.5% profit margin.${subsidyDomesticOnly ? ` ${domesticOnlyLabel}.` : ""}`
                          : "Ends the matching active subsidy."}
                      </p>
                    </div>
                  ) : tax && taxEstimate && taxRateValid ? (
                    <div className="rounded-xl border border-card-border bg-background/40 p-5">
                      <h4 className="font-semibold">{tax.title}</h4>
                      <p className="mt-2 text-sm">
                        Current rate {taxEstimate.currentRate}% → proposed rate {taxRate}%
                      </p>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("level")}
                      className="rounded-lg border border-card-border px-4 py-2 text-sm"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={
                        family && option
                          ? addLawToDraft
                          : subsidyAction
                            ? addSubsidyToDraft
                            : addTaxToDraft
                      }
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                    >
                      Add to draft bill
                    </button>
                  </div>
                </section>
              ) : null}

              {step === "overview" ? (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {isCustomBill ? t("customBill") : "Bill overview"}
                      </h3>
                      <p className="text-sm text-muted">
                        {isCustomBill
                          ? t("noEffects")
                          : "Review the draft or add another provision without retracing the previous steps."}
                      </p>
                    </div>
                    {isCustomBill ? (
                      <button
                        type="button"
                        onClick={beginAnother}
                        className="rounded-lg border border-card-border px-4 py-2 text-sm"
                      >
                        {t("changeStartingPoint")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={draft.length >= MAX_PROVISIONS}
                        onClick={beginAnother}
                        className="rounded-lg border border-card-border px-4 py-2 text-sm disabled:opacity-50"
                      >
                        Add another provision
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {draft.map((provision) => {
                      const key =
                        provision.kind === "embargo"
                          ? `embargo:${provision.row.action}:${provision.row.targetCountry}:${provision.row.commodity}:${provision.row.direction}`
                          : provision.kind === "law"
                            ? provision.family.familyId
                            : provision.kind === "subsidy"
                              ? subsidyTargetKey(provision)
                              : provision.tax.existingLegislationTypeId;
                      return (
                        <div
                          key={key}
                          className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-background/40 p-4"
                        >
                          <div>
                            <p className="font-medium">
                              {provision.kind === "embargo"
                                ? formatEmbargoProvisionLabel(embargoToPayload(provision.row))
                                    .summary
                                : provision.kind === "law"
                                  ? provision.option.title
                                  : provision.kind === "subsidy"
                                    ? `${provision.action === "subsidy" ? "Grant subsidy" : "End subsidy"}: ${subsidyTargetLabel(provision)}`
                                    : `${provision.tax.title}: ${provision.rate}%`}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {provision.kind === "embargo"
                                ? formatEmbargoProvisionLabel(embargoToPayload(provision.row))
                                    .description
                                : provision.kind === "law"
                                  ? `${agencyName(provision.family)} · ${money(provision.option.option.annualAllocation)} · ${provision.family.primaryMetricIds.map(metricName).join(", ")}`
                                  : provision.kind === "subsidy"
                                    ? provision.action === "subsidy"
                                      ? `+7.5% profit margin${provision.domesticOnly ? ` · ${domesticOnlyLabel}` : ""}`
                                      : "Ends the matching active subsidy"
                                    : `Current ${provision.currentRate}%`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((current) =>
                                current.filter((candidate) => candidate !== provision)
                              )
                            }
                            className="text-xs text-error"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs text-muted">
                      Bill title
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </label>
                    {chambers.length > 0 ? (
                      <label className="text-xs text-muted">
                        Originating chamber
                        <select
                          value={chamber}
                          onChange={(event) => setChamber(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground"
                        >
                          {chambers.map((candidate) => (
                            <option key={candidate.value} value={candidate.value}>
                              {candidate.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <label className="block text-xs text-muted">
                    {isCustomBill ? t("messageBody") : "Summary"}
                    <textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      maxLength={bodyLimit}
                      rows={isCustomBill ? 10 : 3}
                      className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  {isCustomBill ? (
                    <p className="text-xs text-muted" aria-live="polite">
                      {t("characterCount", {
                        count: summary.length,
                        limit: CUSTOM_BILL_BODY_MAX_LENGTH,
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted" title={catalog?.balanceNotice}>
                      {catalog?.balanceNotice}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={
                        submitting ||
                        !canSubmit ||
                        (queue != null && !targetNppId) ||
                        bodyTooLong ||
                        (!isCustomBill && draft.length === 0) ||
                        !title.trim() ||
                        !summary.trim()
                      }
                      onClick={submit}
                      className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {queue
                        ? submitting
                          ? "Queuing..."
                          : "Queue bill"
                        : submitting
                          ? "Proposing..."
                          : "Propose bill"}
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
