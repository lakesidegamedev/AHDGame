"use client";
import { renderExpandMarketModalView } from "./ExpandMarketModal.view";

import { useBodyScrollLock } from "@/components/ui/useBodyScrollLock";

import { useTranslations } from "next-intl";

import { apiErrorText } from "@/lib/errors/catalog";
import { useState, useEffect, useRef, useCallback } from "react";

import { useRouter } from "next/navigation";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { type CountryId } from "@/lib/constants/countriesCore";

import { plantsOfRoom } from "./plantsPresentation";

/** Big-number form of room to build: whole plants, "<1" for a sliver, "0" for none. */
function roomPlantsFigure(
  units: number | null | undefined,
  sectorType: string,
  unknown: string
): string {
  if (units == null || !Number.isFinite(units)) return unknown;
  if (units <= 0) return "0";
  const plants = plantsOfRoom(units, { sectorType });
  return plants >= 1 ? plants.toLocaleString("en-US") : "<1";
}
import { facilityVocabulary } from "@/lib/constants/facilityVocabulary";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { useDialogA11y } from "@/components/ui";

interface Competitor {
  corpId: string;
  name: string;
  sequentialId: number | null;
  logoUrl: string | null;
  brandColor: string | null;
  revenue: number;
}

interface Suggestion {
  stateId: string;
  stateName: string;
  countryId: string;
  canAfford: boolean;
  ownedSectorId: string | null;
  competitors: Competitor[];
  totalCompetitorRevenue: number;
  /** Plants tier: what the starter plant costs to build HERE (₳). */
  starterBuildCostAnchor?: number | null;
  /** Plants tier: entry fee + starter build, the all-in price (₳). */
  foundingTotalAnchor?: number | null;
  /**
   * Plants tier: the founding command's verdict for this market right now,
   * computed server-side from the same rules the command enforces.
   */
  entry?: { canEnter: boolean; reason: EntryBlockReason | null; message: string | null } | null;
  /** Plants tier: room to build here, capacity units per day. */
  roomToBuildUnits?: number | null;
  /** Plants tier: "country" when that room is one figure shared by the country. */
  roomScope?: "state" | "country" | null;
  buildDemand?: import("@/lib/corporations/rules/fundedBuildDemand").BuildDemandRow[];
  buildDemandTurn?: number;
}

type EntryBlockReason =
  | "actions_paused"
  | "player_control_required"
  | "command_economy"
  | "already_operating"
  | "retail_paused"
  | "insufficient_capital";

/** Short row label for why a market cannot be entered now. */
const ENTRY_BLOCK_LABEL: Record<EntryBlockReason, string> = {
  actions_paused: "Actions paused",
  player_control_required: "Resume control first",
  command_economy: "State-run market",
  already_operating: "You operate here",
  retail_paused: "Retail paused",
  insufficient_capital: "Not enough cash",
};

/** Whether a plants row can be founded now. Older payloads fall back to cash only. */
function canEnterNow(s: Suggestion): boolean {
  return s.entry ? s.entry.canEnter : s.canAfford;
}

/** Plants-tier founding terms that do not vary by state. */
interface FoundingQuote {
  /** Capacity the starter plant delivers, output units per day. */
  starterUnits: number;
  /** Entry fee: land, permits, licences (₳). */
  foundingFeeAnchor: number;
  /** Turns until the starter plant comes online. */
  foundingBuildTurns: number;
}

interface ExpandMarketModalProps {
  corpId: string;
  primaryType: OperatingSectorType;
  secondaryType?: OperatingSectorType | null;
  liquidCapital: number;
  onClose: () => void;
  /**
   * Plants tier: entering a market means BUILDING your first plant there, so
   * the picker ranks on untapped demand and the detail card quotes the real
   * founding charge instead of a split cost.
   */
  plantsMode?: boolean;
  /** Deep-link: skip type pick and open suggestions for this sector type. */
  initialSectorType?: OperatingSectorType;
  /** Deep-link: focus this state once suggestions load. */
  initialStateId?: string;
}

type Step = "selectType" | "suggestions";
export type SuggestionMode = "unowned" | "playerCorp";
export type OwnershipFilter = "all" | "owned" | "unowned";

const OWNERSHIP_OPTIONS: { value: OwnershipFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unowned", label: "New markets" },
  { value: "owned", label: "Already in" },
];

function useExpandMarketModalContext({
  corpId,
  primaryType,
  secondaryType,
  liquidCapital,
  onClose,
  plantsMode = false,
  initialSectorType,
  initialStateId,
}: ExpandMarketModalProps) {
  const t = useTranslations("corporations.sectorInvestment");
  const { dialogProps, titleId } = useDialogA11y(onClose);
  useBodyScrollLock();
  const resolveCountryName = useCountryDisplayName();
  const { formatAmount } = useCurrency();
  const router = useRouter();
  // Any sector type is buildable, so honor an incoming type in either mode and
  // fall back to the corp's primary type when none is supplied.
  const startType = initialSectorType ?? primaryType;
  const [step, setStep] = useState<Step>(
    plantsMode || initialSectorType ? "suggestions" : "selectType"
  );
  const [selectedType, setSelectedType] = useState<OperatingSectorType>(startType);
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>("unowned");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>(
    plantsMode && !initialStateId ? "unowned" : "all"
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fetchedLiquidCapital, setFetchedLiquidCapital] = useState<number>(liquidCapital);
  const [liquidCurrencyCode, setLiquidCurrencyCode] = useState<CurrencyCode | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(
    plantsMode || Boolean(initialSectorType)
  );
  const [suggestionError, setSuggestionError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // Multi-select country filter. Empty = all countries (global top markets).
  // Selecting one or more re-queries the server for the top markets WITHIN those
  // countries, so options outside the global top-N are revealed.
  const [countryFilters, setCountryFilters] = useState<Set<string>>(new Set());
  // Every country with a market in this sector — comes from the API (NOT just
  // the countries in the current top-N), so all of them are selectable.
  const [availableCountries, setAvailableCountries] = useState<{ id: string; name: string }[]>([]);
  const [foundingQuote, setFoundingQuote] = useState<FoundingQuote | null>(null);
  const [countrySharedDemand, setCountrySharedDemand] = useState(false);
  const [countryDemandEstimates, setCountryDemandEstimates] = useState<Record<string, number>>({});
  // Two-step under plants: pick the market, then read the terms and confirm.
  // Founding now spends real money on a plant that takes turns to arrive, so
  // it should not be one click away from a list.
  const [confirming, setConfirming] = useState(false);
  const [foundingBusy, setFoundingBusy] = useState(false);
  const [foundingError, setFoundingError] = useState("");
  // Prefer the deep-linked state once on the next suggestions load.
  const pendingStateRef = useRef<string | undefined>(initialStateId);

  const fetchSuggestions = useCallback(
    async function (
      type: OperatingSectorType,
      mode: SuggestionMode,
      countries: Set<string>,
      ownership: OwnershipFilter,
      pinStateId?: string
    ) {
      const countryParam =
        countries.size > 0 ? `&country=${encodeURIComponent([...countries].join(","))}` : "";
      const ownershipParam = ownership !== "all" ? `&ownership=${ownership}` : "";
      const stateParam = pinStateId ? `&state=${encodeURIComponent(pinStateId)}` : "";

      return fetch(
        `/api/corporations/${corpId}/expand-suggestions?sectorType=${encodeURIComponent(type)}&mode=${mode}${countryParam}${ownershipParam}${stateParam}`
      )
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            setSuggestionError(apiErrorText(data, "Failed to load suggestions"));
            return;
          }
          const nextSuggestions: Suggestion[] = data.suggestions ?? [];
          const want = pendingStateRef.current;
          const initialIndex = want ? nextSuggestions.findIndex((s) => s.stateId === want) : 0;
          // Publish the list and its initial selection together. A later effect can
          // overwrite a player's selection if they click as soon as the rows appear.
          setActiveIndex(Math.max(0, initialIndex));
          if (want && nextSuggestions.length > 0) pendingStateRef.current = undefined;
          setSuggestions(nextSuggestions);
          setCountrySharedDemand(data.countrySharedDemand === true);
          setCountryDemandEstimates(
            Object.fromEntries(
              (
                (data.countryDemandEstimates as {
                  countryId: string;
                  roomToBuildUnits: number;
                }[]) ?? []
              ).map(({ countryId, roomToBuildUnits }) => [countryId, roomToBuildUnits])
            )
          );
          setAvailableCountries(
            ((data.availableCountries as string[]) ?? [])
              .map((id) => ({ id, name: resolveCountryName(id as CountryId) }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
          if (typeof data.liquidCapital === "number") {
            setFetchedLiquidCapital(data.liquidCapital);
          }
          setLiquidCurrencyCode((data.liquidCurrencyCode as CurrencyCode | null) ?? null);
          setFoundingQuote(
            typeof data.starterUnits === "number"
              ? {
                  starterUnits: data.starterUnits as number,
                  foundingFeeAnchor: (data.foundingFeeAnchor as number) ?? 0,
                  foundingBuildTurns: (data.foundingBuildTurns as number) ?? 0,
                }
              : null
          );
          setConfirming(false);
          setStep("suggestions");
        })
        .catch(async () => {
          setSuggestionError("Network error");
        })
        .finally(() => {
          setLoadingSuggestions(false);
        });
    },
    [corpId, resolveCountryName]
  );

  function handleFetchSuggestions(...args: Parameters<typeof fetchSuggestions>) {
    setLoadingSuggestions(true);
    setSuggestionError("");
    return fetchSuggestions(...args);
  }

  // Plants mode opens on the ranked market list because the buildable type is
  // already known. A state-board deep link also pins its originating state into
  // the top-N (Maryland is not necessarily a global top market).
  useEffect(() => {
    if (!plantsMode && !initialSectorType) return;
    const type = startType;
    const ownership = plantsMode && !initialStateId ? "unowned" : "all";
    void fetchSuggestions(type, "unowned", new Set(), ownership, initialStateId);
  }, [plantsMode, initialSectorType, startType, initialStateId, fetchSuggestions]);

  // Toggling a country re-queries the server (top markets within the new
  // selection) rather than filtering the already-fetched top-N client-side.
  const toggleCountry = (id: string) => {
    const next = new Set(countryFilters);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCountryFilters(next);
    void handleFetchSuggestions(selectedType, suggestionMode, next, ownershipFilter);
  };

  const clearCountryFilter = () => {
    if (countryFilters.size === 0) return;
    setCountryFilters(new Set());
    void handleFetchSuggestions(selectedType, suggestionMode, new Set(), ownershipFilter);
  };

  const selectCountry = (id: string) => {
    const next = id ? new Set([id]) : new Set<string>();
    setCountryFilters(next);
    void handleFetchSuggestions(selectedType, suggestionMode, next, ownershipFilter);
  };

  const selectPlantSectorType = (type: OperatingSectorType) => {
    if (type === selectedType) return;
    setSelectedType(type);
    setSuggestionMode("unowned");
    setOwnershipFilter("unowned");
    setCountryFilters(new Set());
    void handleFetchSuggestions(type, "unowned", new Set(), "unowned");
  };

  async function handleModeSwitch(newMode: SuggestionMode) {
    setSuggestionMode(newMode);
    setCountryFilters(new Set());
    await handleFetchSuggestions(selectedType, newMode, new Set(), ownershipFilter);
  }

  // Ownership re-queries the server so the filter applies before the top-N
  // slice (owned/new markets outside the global top-N still surface). Country
  // selection is preserved across the switch.
  async function handleOwnershipSwitch(next: OwnershipFilter) {
    if (next === ownershipFilter) return;
    setOwnershipFilter(next);
    await handleFetchSuggestions(selectedType, suggestionMode, countryFilters, next);
  }

  const activeSuggestion = suggestions[activeIndex] ?? suggestions[0] ?? null;
  // Room to build: the same figure the state board shows for this market.
  const roomFor = (s: Suggestion): number | null =>
    s.buildDemand
      ? (s.roomToBuildUnits ?? null)
      : (s.roomToBuildUnits ??
        (countrySharedDemand ? countryDemandEstimates[s.countryId] : undefined) ??
        null);
  const activeDemandUnits = activeSuggestion ? roomFor(activeSuggestion) : null;
  const activeCanEnter = activeSuggestion ? canEnterNow(activeSuggestion) : false;
  const activeBlockMessage =
    activeSuggestion && !activeCanEnter
      ? (activeSuggestion.entry?.message ??
        "You do not have enough capital for the entry fee and first plant.")
      : null;
  const selectedFacility = facilityVocabulary(selectedType);
  const selectedFacilityAction =
    selectedFacility.buildVerb.charAt(0).toUpperCase() + selectedFacility.buildVerb.slice(1);
  const activeMarketCurrency = activeSuggestion
    ? (COUNTRY_CURRENCY_MAP[activeSuggestion.countryId as CountryId] ?? "USD")
    : "USD";
  const formatMarketAmount = (amount: number, currencyCode: CurrencyCode = activeMarketCurrency) =>
    formatAmount(amount, currencyCode);
  const formatTreasuryAmount = (amount: number) =>
    formatAmount(amount, liquidCurrencyCode ?? undefined);
  const marketCurrencyTitle = `Forex-normalized market revenue. Local display mode shows ${activeMarketCurrency}, the target state's home currency; other display modes convert from the same underlying value.`;

  async function handleFoundFirstPlant() {
    if (!activeSuggestion || !canEnterNow(activeSuggestion)) return;
    setFoundingBusy(true);
    setFoundingError("");
    try {
      const res = await fetch(`/api/corporations/${corpId}/sectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId: activeSuggestion.stateId,
          sectorType: selectedType,
        }),
      });
      const data = (await res.json()) as { error?: string; sectorId?: string };
      if (!res.ok) {
        setFoundingError(apiErrorText(data, "Could not start this plant"));
        return;
      }
      onClose();
      if (data.sectorId) {
        router.push(`/corporation/${corpId}/sector/${data.sectorId}?build=1`);
        router.refresh();
      } else {
        router.push(`/corporation/${corpId}?tab=sectors`);
        router.refresh();
      }
    } catch {
      setFoundingError("Network error");
    } finally {
      setFoundingBusy(false);
    }
  }

  // Any sector type is buildable. Primary and secondary are listed first and
  // badged; the rest carry the off-type margin penalty but are not gated out.
  const orderedTypes: OperatingSectorType[] = [
    primaryType,
    ...(secondaryType ? [secondaryType] : []),
    ...OPERATING_SECTOR_TYPES.filter((t) => t !== primaryType && t !== secondaryType),
  ];
  return {
    kind: "context" as const,
    context: {
      ENTRY_BLOCK_LABEL,
      OWNERSHIP_OPTIONS,
      activeBlockMessage,
      activeCanEnter,
      activeDemandUnits,
      activeIndex,
      activeSuggestion,
      availableCountries,
      canEnterNow,
      clearCountryFilter,
      confirming,
      corpId,
      countryFilters,
      countrySharedDemand,
      dialogProps,
      fetchedLiquidCapital,
      formatMarketAmount,
      formatTreasuryAmount,
      foundingBusy,
      foundingError,
      foundingQuote,
      handleFetchSuggestions,
      handleFoundFirstPlant,
      handleModeSwitch,
      handleOwnershipSwitch,
      loadingSuggestions,
      marketCurrencyTitle,
      onClose,
      orderedTypes,
      ownershipFilter,
      plantsMode,
      primaryType,
      resolveCountryName,
      roomFor,
      roomPlantsFigure,
      secondaryType,
      selectCountry,
      selectPlantSectorType,
      selectedFacilityAction,
      selectedType,
      setActiveIndex,
      setConfirming,
      setCountryFilters,
      setSelectedType,
      setStep,
      step,
      suggestionError,
      suggestionMode,
      suggestions,
      t,
      titleId,
      toggleCountry,
    },
  };
}
export type ExpandMarketModalViewContext = Extract<
  ReturnType<typeof useExpandMarketModalContext>,
  { kind: "context" }
>["context"];

export default function ExpandMarketModal(...args: Parameters<typeof useExpandMarketModalContext>) {
  const result = useExpandMarketModalContext(...args);
  return renderExpandMarketModalView(result.context);
}
