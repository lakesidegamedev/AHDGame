"use client";
import type { ReactNode } from "react";
import type { ExpandMarketModalViewContext } from "./ExpandMarketModal";
import type { SuggestionMode, OwnershipFilter } from "./ExpandMarketModal";

import { InlineError } from "@/components/ui/InlineError";

import Link from "next/link";

import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporationsClient";

import type { OperatingSectorType } from "@/lib/constants/corporationsClient";

import { type CountryId } from "@/lib/constants/countriesCore";
import { CorporationLogo } from "@/components/corporation/CorporationLogo";
import FundedBuildDemand from "./FundedBuildDemand";
import { CAPACITY_UNIT_LABEL, formatUnits, roomInPlantsLabel } from "./plantsPresentation";
import { facilityPlural, facilitySingular } from "@/lib/constants/facilityVocabulary";

export function renderExpandMarketModalView(context: ExpandMarketModalViewContext): ReactNode {
  const {
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
  } = context;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 px-3 py-4 pb-20 backdrop-blur-sm sm:px-4 sm:py-6 sm:pb-20"
      {...dialogProps}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100dvh-6rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-card-border px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 id={titleId} className="text-base font-bold text-foreground">
              {plantsMode ? "Build a new sector" : "Expand into new market"}
            </h2>
            {step === "suggestions" && !plantsMode && (
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground mt-0.5 transition-colors"
                onClick={() => setStep("selectType")}
              >
                Back to sector type selection
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-card-elevated transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {/* Step 1: Select sector type */}
          {step === "selectType" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                {plantsMode
                  ? "Choose what you want to make. The next step shows which markets have demand nobody is meeting yet."
                  : "Choose the sector type to find the best split opportunities."}
              </p>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {orderedTypes.map((t) => {
                  const isPrimary = t === primaryType;
                  const isSecondary = t === secondaryType;
                  const isSelected = selectedType === t;

                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedType(t)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-colors border ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-card-border bg-card-elevated/40 text-foreground hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <span className="font-medium">{OPERATING_SECTOR_TYPE_LABELS[t]}</span>
                      <span className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isPrimary && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/20 text-primary">
                            Primary
                          </span>
                        )}
                        {isSecondary && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-success/20 text-success">
                            Secondary
                          </span>
                        )}
                        {!isPrimary && !isSecondary && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-warning/10 text-warning">
                            -15% margin
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <InlineError error={suggestionError} className="text-sm text-error" />

              <button
                type="button"
                disabled={loadingSuggestions}
                onClick={() => {
                  setCountryFilters(new Set());
                  void handleFetchSuggestions(
                    selectedType,
                    suggestionMode,
                    new Set(),
                    ownershipFilter
                  );
                }}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingSuggestions
                  ? "Loading..."
                  : plantsMode
                    ? "Find untapped markets"
                    : "Find best opportunities"}
              </button>
            </div>
          )}

          {/* Step 2: Suggestions */}
          {step === "suggestions" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {plantsMode
                      ? confirming && activeSuggestion
                        ? `Review ${activeSuggestion.stateName}`
                        : "Choose a market"
                      : `${OPERATING_SECTOR_TYPE_LABELS[selectedType]} markets`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {plantsMode
                      ? `${OPERATING_SECTOR_TYPE_LABELS[selectedType]} sector · ${formatTreasuryAmount(fetchedLiquidCapital)} available`
                      : suggestionMode === "playerCorp"
                        ? "Sorted by competitor revenue"
                        : "Sorted by revenue capture"}
                  </p>
                </div>
                {plantsMode && confirming && (
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="shrink-0 rounded-md border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Back to markets
                  </button>
                )}
              </div>

              {suggestionError && (
                <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                  {suggestionError}
                </p>
              )}

              {/* Mode toggle */}
              <div
                className={`${plantsMode ? "hidden" : "flex"} rounded-lg border border-card-border overflow-hidden text-xs font-medium`}
              >
                <button
                  type="button"
                  onClick={() => suggestionMode !== "unowned" && handleModeSwitch("unowned")}
                  disabled={loadingSuggestions}
                  className={`flex-1 px-3 py-1.5 transition-colors ${
                    suggestionMode === "unowned"
                      ? "bg-primary text-white"
                      : "bg-card-elevated/40 text-muted hover:text-foreground"
                  }`}
                >
                  Untapped markets
                </button>
                <button
                  type="button"
                  onClick={() => suggestionMode !== "playerCorp" && handleModeSwitch("playerCorp")}
                  disabled={loadingSuggestions}
                  className={`flex-1 px-3 py-1.5 transition-colors border-l border-card-border ${
                    suggestionMode === "playerCorp"
                      ? "bg-primary text-white"
                      : "bg-card-elevated/40 text-muted hover:text-foreground"
                  }`}
                >
                  {loadingSuggestions && suggestionMode === "unowned"
                    ? "Loading..."
                    : "Player corp markets"}
                </button>
              </div>

              {/* Ownership filter — hide markets you already operate in, or show only those */}
              <div className={`${plantsMode ? "hidden" : "flex"} items-center gap-1.5 flex-wrap`}>
                <span className="text-body-sm font-medium text-muted">Show</span>
                {OWNERSHIP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => void handleOwnershipSwitch(opt.value)}
                    disabled={loadingSuggestions}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border disabled:opacity-50 ${
                      ownershipFilter === opt.value
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-card-border text-muted hover:text-foreground hover:border-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Available balance banner */}
              <div
                className={`${plantsMode ? "hidden" : "flex"} rounded-lg border border-card-border bg-card-elevated/30 px-3 py-2 items-center justify-between`}
              >
                <span className="text-xs text-muted">Your available capital</span>
                <span className="text-xs font-bold text-foreground">
                  {formatTreasuryAmount(fetchedLiquidCapital)}
                </span>
              </div>

              {plantsMode && !confirming && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-card-border bg-card-elevated/25 p-3">
                  <label className="col-span-2 space-y-1">
                    <span className="block text-body-sm font-medium text-muted">Sector type</span>
                    <select
                      value={selectedType}
                      disabled={loadingSuggestions}
                      onChange={(event) =>
                        selectPlantSectorType(event.target.value as OperatingSectorType)
                      }
                      className="w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                    >
                      {orderedTypes.map((t) => {
                        const suffix =
                          t === primaryType
                            ? " (primary)"
                            : t === secondaryType
                              ? " (secondary)"
                              : " (-15% margin)";
                        return (
                          <option key={t} value={t}>
                            {OPERATING_SECTOR_TYPE_LABELS[t]}
                            {suffix}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-body-sm font-medium text-muted">Rank by</span>
                    <select
                      value={suggestionMode}
                      disabled={loadingSuggestions}
                      onChange={(event) =>
                        void handleModeSwitch(event.target.value as SuggestionMode)
                      }
                      className="w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                    >
                      <option value="unowned">Best affordable fit</option>
                      <option value="playerCorp">Largest established</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-body-sm font-medium text-muted">Show</span>
                    <select
                      value={ownershipFilter}
                      disabled={loadingSuggestions}
                      onChange={(event) =>
                        void handleOwnershipSwitch(event.target.value as OwnershipFilter)
                      }
                      className="w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                    >
                      <option value="unowned">New markets</option>
                      <option value="all">All markets</option>
                      <option value="owned">Already in</option>
                    </select>
                  </label>
                  {availableCountries.length > 1 && (
                    <label className="col-span-2 space-y-1">
                      <span className="block text-body-sm font-medium text-muted">Country</span>
                      <select
                        value={countryFilters.size === 1 ? [...countryFilters][0] : ""}
                        disabled={loadingSuggestions}
                        onChange={(event) => selectCountry(event.target.value)}
                        className="w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                      >
                        <option value="">All countries</option>
                        {availableCountries.map((country) => (
                          <option key={country.id} value={country.id}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="col-span-2 text-[11px] leading-snug text-muted">
                    {suggestionMode === "unowned"
                      ? countrySharedDemand
                        ? "This daily demand estimate is shared across reachable markets in the country. It is not a sales guarantee."
                        : "Some demand is local to each state. Other demand is shared across reachable markets in the same country, so state estimates can overlap. These estimates are not a sales guarantee."
                      : "Established markets are ranked by the current revenue of competing corporations."}
                  </p>
                </div>
              )}

              {loadingSuggestions ? (
                <div className="rounded-xl border border-card-border bg-card-elevated/30 p-6 text-center">
                  <p className="text-sm text-muted">Finding the strongest markets...</p>
                </div>
              ) : suggestionError && suggestions.length === 0 ? null : suggestions.length === 0 ? (
                <div className="rounded-xl border border-card-border bg-card-elevated/30 p-6 text-center">
                  <p className="text-sm text-muted">
                    {plantsMode
                      ? suggestionMode === "playerCorp"
                        ? "No established markets found for this sector type."
                        : // Never claim the world is served. This branch means no
                          // Distinct from no candidate rows at all; don't imply the board is closed.
                          "No markets found for this sector type yet."
                      : suggestionMode === "playerCorp"
                        ? "No player corporations found in this sector type."
                        : "No available markets found for this sector type."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Country filter — multi-select; empty = all countries */}
                  <div
                    className={`${plantsMode ? "hidden" : "flex"} items-center gap-1.5 flex-wrap`}
                  >
                    <span className="text-body-sm font-medium text-muted">Country</span>
                    <button
                      type="button"
                      onClick={clearCountryFilter}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                        countryFilters.size === 0
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-card-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      All
                    </button>
                    {availableCountries.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCountry(c.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                          countryFilters.has(c.id)
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-card-border text-muted hover:text-foreground hover:border-muted"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>

                  {/* Market picker — plants.
                      A chip row can only carry a name, which under plants
                      hides the one number that decides where to build. The
                      picker becomes a short table so untapped demand sits next
                      to the state it belongs to and the rows can be compared
                      down a column rather than by clicking through them. */}
                  {plantsMode && !confirming && (
                    <div className="overflow-hidden rounded-lg border border-card-border">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-b border-card-border bg-card-elevated/40 px-3 py-2 text-sm font-semibold text-foreground">
                        <span>Market</span>
                        <span
                          className="text-right"
                          title="Demand buyers are not getting, less plants already under construction. Matches the state market page. Legacy unowned revenue does not limit building."
                        >
                          {suggestions.some((s) => s.buildDemand)
                            ? t("fundedAdvice.allOutputRoom")
                            : "Room to build"}
                        </span>
                        <span className="text-right">Entry</span>
                      </div>
                      <ul className="list-none divide-y divide-card-border/40">
                        {suggestions.map((s, i) => {
                          const room = roomFor(s);
                          const sharedRoom =
                            (s.roomScope ?? null) === "country" || countrySharedDemand;
                          const showCountryEstimate =
                            !sharedRoom ||
                            suggestions.findIndex((row) => row.countryId === s.countryId) === i;
                          const countryName = resolveCountryName(s.countryId as CountryId);
                          const open = canEnterNow(s);
                          // Group header whenever the open / not-open run changes,
                          // so the list reads "Can enter now" then "Not available now".
                          const groupStarts =
                            suggestionMode === "unowned" &&
                            (i === 0 || canEnterNow(suggestions[i - 1]) !== open);
                          const blockLabel =
                            s.entry?.reason != null
                              ? ENTRY_BLOCK_LABEL[s.entry.reason]
                              : open
                                ? "Can enter now"
                                : "Not enough cash";

                          return (
                            <li key={s.stateId}>
                              {groupStarts && (
                                <p
                                  className={`border-b border-card-border/40 bg-card-elevated/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${open ? "text-success" : "text-muted"}`}
                                >
                                  {open ? "Can enter now" : "Not available now"}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveIndex(i);
                                  setConfirming(false);
                                }}
                                aria-pressed={activeIndex === i}
                                className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-2.5 text-left transition-colors ${
                                  activeIndex === i ? "bg-primary/10" : "hover:bg-card-elevated/50"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className={`truncate text-xs font-semibold ${activeIndex === i ? "text-primary" : "text-foreground"}`}
                                    >
                                      {s.stateName}
                                    </span>
                                    {i === 0 && suggestionMode === "unowned" && open && (
                                      <span className="shrink-0 rounded bg-success/15 px-1 py-0.5 text-[9px] font-bold text-success">
                                        Best fit
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[10px] text-muted">
                                    {countryName}
                                    {s.ownedSectorId
                                      ? " · You operate here"
                                      : s.competitors.length === 0
                                        ? " · No competitors"
                                        : ` · ${s.competitors.length} competitor${s.competitors.length === 1 ? "" : "s"}`}
                                  </span>
                                </span>
                                <span className="text-right text-xs font-semibold tabular-nums text-foreground">
                                  <span
                                    title={
                                      showCountryEstimate
                                        ? `${formatUnits(room)} ${CAPACITY_UNIT_LABEL} of unmet demand`
                                        : undefined
                                    }
                                  >
                                    {showCountryEstimate
                                      ? roomPlantsFigure(
                                          room,
                                          selectedType,
                                          t("fundedAdvice.unknown")
                                        )
                                      : ""}
                                  </span>
                                  <span className="block text-[9px] font-normal text-muted">
                                    {sharedRoom
                                      ? showCountryEstimate
                                        ? `new ${facilityPlural(selectedType)}, shared across ${countryName}`
                                        : "shared above"
                                      : `new ${facilityPlural(selectedType)}`}
                                  </span>
                                  {open && showCountryEstimate && (room ?? 0) <= 0 && (
                                    <span className="mt-0.5 block text-[9px] font-normal leading-snug text-warning">
                                      You can still build here
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`text-right text-xs tabular-nums ${open ? "text-foreground" : "text-error"}`}
                                >
                                  {s.foundingTotalAnchor != null
                                    ? formatTreasuryAmount(s.foundingTotalAnchor)
                                    : "Not quoted"}
                                  <span className="block text-[9px] font-normal">{blockLabel}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {plantsMode && !confirming && activeSuggestion && (
                    <div className="sticky bottom-0 -mx-4 border-t border-card-border bg-card/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {activeSuggestion.stateName}
                          </p>
                          <p className="text-[11px] text-muted">
                            {activeSuggestion.buildDemand
                              ? t("fundedAdvice.allOutputRoom")
                              : "Room to build"}
                            :{" "}
                            {activeDemandUnits == null
                              ? t("fundedAdvice.unknown")
                              : roomInPlantsLabel(activeDemandUnits, { sectorType: selectedType })}
                            {" · "}
                            {activeSuggestion.foundingTotalAnchor != null
                              ? formatTreasuryAmount(activeSuggestion.foundingTotalAnchor)
                              : "Price unavailable"}
                          </p>
                          {activeBlockMessage && !activeSuggestion.ownedSectorId && (
                            <p className="text-[11px] text-error">{activeBlockMessage}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirming(true)}
                          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                        >
                          Review {facilitySingular(selectedType)}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Toggle tabs */}
                  <div className={`${plantsMode ? "hidden" : "flex"} gap-1.5 flex-wrap`}>
                    {suggestions.map((s, i) => (
                      <button
                        key={s.stateId}
                        type="button"
                        onClick={() => setActiveIndex(i)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                          activeIndex === i
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-card-border text-muted hover:text-foreground hover:border-muted"
                        } ${!s.canAfford ? "opacity-50" : ""}`}
                        title={!s.canAfford ? "Insufficient capital" : s.stateName}
                      >
                        {i + 1}. {s.stateName}
                        {!s.canAfford && " *"}
                      </button>
                    ))}
                  </div>

                  {activeSuggestion && (!plantsMode || confirming) && (
                    <div className="rounded-xl border border-card-border bg-card-elevated/30 p-4 space-y-3">
                      {/* State header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground text-sm">
                            {activeSuggestion.stateName}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            {OPERATING_SECTOR_TYPE_LABELS[selectedType]}
                          </p>
                        </div>
                        {activeSuggestion.ownedSectorId ? (
                          <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold bg-success/15 text-success border border-success/20">
                            You operate here
                          </span>
                        ) : (
                          <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium bg-muted/10 text-muted border border-card-border">
                            Not entered
                          </span>
                        )}
                      </div>

                      <FundedBuildDemand
                        rows={activeSuggestion.buildDemand}
                        unitsPerFacility={foundingQuote?.starterUnits}
                      />
                      {/* Stats row — plants */}
                      {plantsMode && foundingQuote && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
                            <p
                              className="text-body-sm font-medium text-muted"
                              title="What buyers want and are not getting, less plants already under construction. The same figure the state market page shows. It does not limit what you can build."
                            >
                              {suggestions.some((s) => s.buildDemand)
                                ? t("fundedAdvice.allOutputRoom")
                                : "Room to build"}
                            </p>
                            <p
                              className="text-sm font-bold text-foreground tabular-nums"
                              title={`${formatUnits(activeDemandUnits)} ${CAPACITY_UNIT_LABEL} of unmet demand`}
                            >
                              {roomPlantsFigure(
                                activeDemandUnits,
                                selectedType,
                                t("fundedAdvice.unknown")
                              )}
                            </p>
                            <p className="text-[10px] text-muted">
                              {activeSuggestion.roomScope === "country" || countrySharedDemand
                                ? `new ${facilityPlural(selectedType)}, shared across the country`
                                : `new ${facilityPlural(selectedType)}`}
                            </p>
                          </div>
                          <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
                            <p className="text-body-sm font-medium text-muted">
                              Your first {facilitySingular(selectedType)}
                            </p>
                            <p className="text-sm font-bold text-success tabular-nums">1</p>
                            <p
                              className="text-[10px] text-muted"
                              title={`${formatUnits(foundingQuote.starterUnits)} ${CAPACITY_UNIT_LABEL} at full run`}
                            >
                              {facilitySingular(selectedType)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
                            <p className="text-body-sm font-medium text-muted">Comes online</p>
                            <p className="text-sm font-bold text-foreground tabular-nums">
                              {foundingQuote.foundingBuildTurns}
                            </p>
                            <p className="text-[10px] text-muted">
                              turn{foundingQuote.foundingBuildTurns === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Player corp mode: total competitor revenue */}
                      {suggestionMode === "playerCorp" &&
                        activeSuggestion.totalCompetitorRevenue > 0 && (
                          <div className="rounded-lg bg-background/60 px-3 py-2 flex items-center justify-between">
                            <span
                              className="text-body-sm font-medium text-muted"
                              title={marketCurrencyTitle}
                            >
                              Total competitor revenue
                            </span>
                            <span className="text-sm font-bold text-foreground">
                              {formatMarketAmount(
                                Math.round(activeSuggestion.totalCompetitorRevenue / 24)
                              )}
                              /turn
                            </span>
                          </div>
                        )}

                      {/* Competitors */}
                      {activeSuggestion.competitors.length > 0 && (
                        <div>
                          <p className="text-body-sm font-medium text-muted mb-1.5">
                            Competing in this market
                          </p>
                          <div className="space-y-1">
                            {activeSuggestion.competitors.map((c) => (
                              <div
                                key={c.corpId}
                                className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 bg-background/40"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <CorporationLogo
                                    logoUrl={c.logoUrl}
                                    name={c.name}
                                    size="h-6 w-6"
                                    className="rounded"
                                  />
                                  <Link
                                    href={
                                      c.sequentialId != null
                                        ? `/corporation/${c.sequentialId}`
                                        : `/corporation/${c.corpId}`
                                    }
                                    onClick={onClose}
                                    className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate"
                                  >
                                    {c.name}
                                  </Link>
                                </div>
                                <span className="text-xs text-muted shrink-0">
                                  {formatMarketAmount(Math.round(c.revenue / 24))}/turn
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeSuggestion.competitors.length === 0 && (
                        <p className="text-[11px] text-success">
                          {t("fundedAdvice.noLocalCompetitors")}
                        </p>
                      )}

                      {/* CTA — plants: quote the charge, then send them to build */}
                      {plantsMode && foundingQuote && (
                        <div className="pt-1">
                          {activeSuggestion.ownedSectorId ? (
                            <Link
                              href={`/corporation/${corpId}/sector/${activeSuggestion.ownedSectorId}?build=1`}
                              onClick={onClose}
                              className="block w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                            >
                              You already have {facilityPlural(selectedType)} here. Build more
                              capacity.
                            </Link>
                          ) : (
                            <div className="space-y-2 rounded-lg border border-card-border bg-background/60 p-3">
                              <p className="text-xs font-semibold text-foreground">
                                {selectedFacilityAction} your first {facilitySingular(selectedType)}{" "}
                                in {activeSuggestion.stateName}
                              </p>
                              <div className="space-y-0.5 text-xs text-muted">
                                <div className="flex justify-between gap-3">
                                  <span>Entry fee (land, permits, licences)</span>
                                  <span className="tabular-nums">
                                    {formatTreasuryAmount(foundingQuote.foundingFeeAnchor)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <span>First {facilitySingular(selectedType)}</span>
                                  <span className="tabular-nums">
                                    {activeSuggestion.starterBuildCostAnchor != null
                                      ? formatTreasuryAmount(
                                          activeSuggestion.starterBuildCostAnchor
                                        )
                                      : "n/a"}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-3 border-t border-card-border pt-0.5 font-semibold text-foreground">
                                  <span>You pay now</span>
                                  <span className="tabular-nums">
                                    {activeSuggestion.foundingTotalAnchor != null
                                      ? formatTreasuryAmount(activeSuggestion.foundingTotalAnchor)
                                      : "n/a"}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <span>Delivery</span>
                                  <span className="tabular-nums">
                                    {foundingQuote.foundingBuildTurns} turn
                                    {foundingQuote.foundingBuildTurns === 1 ? "" : "s"}
                                  </span>
                                </div>
                              </div>

                              {/* The same demand check the build dialog runs:
                                  is there unmet demand for what this plant will
                                  make? A plant larger than the untapped demand
                                  is not blocked — you can take sales off the
                                  incumbents — but it will run at a low fill
                                  rate while you do, and that is the single most
                                  common way a new corp loses money quietly. */}
                              {(() => {
                                const headroom = activeDemandUnits ?? 0;
                                const enough = headroom >= foundingQuote.starterUnits;
                                return (
                                  <p
                                    className={`rounded-md border px-2 py-1.5 text-[11px] leading-snug ${
                                      enough
                                        ? "border-success/30 bg-success/10 text-success"
                                        : "border-warning/30 bg-warning/10 text-warning"
                                    }`}
                                  >
                                    {activeSuggestion.buildDemand && activeDemandUnits == null
                                      ? t("fundedAdvice.someUnknown")
                                      : enough
                                        ? t(
                                            activeSuggestion.buildDemand
                                              ? "fundedAdvice.foundingRoom"
                                              : "foundingShareRoom",
                                            {
                                              state: activeSuggestion.stateName,
                                              plants: roomInPlantsLabel(headroom, {
                                                sectorType: selectedType,
                                              }),
                                            }
                                          )
                                        : t(
                                            activeSuggestion.buildDemand
                                              ? "fundedAdvice.foundingLimited"
                                              : "foundingShareLimited",
                                            {
                                              state: activeSuggestion.stateName,
                                              plants: roomInPlantsLabel(headroom, {
                                                sectorType: selectedType,
                                              }),
                                            }
                                          )}
                                  </p>
                                );
                              })()}

                              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-body-xs">
                                <p className="font-semibold text-warning">{t("buildRiskTitle")}</p>
                                <p className="mt-1 text-muted">{t("buildRisk")}</p>
                              </div>

                              {activeBlockMessage && (
                                <p className="rounded-md border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] text-error">
                                  {activeBlockMessage}
                                </p>
                              )}

                              {foundingError && (
                                <p className="rounded-md border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] text-error">
                                  {foundingError}
                                </p>
                              )}

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirming(false)}
                                  className="flex-1 rounded-lg border border-card-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-card-elevated"
                                >
                                  Back
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleFoundFirstPlant()}
                                  disabled={foundingBusy || !activeCanEnter}
                                  className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold text-white transition-colors ${
                                    activeCanEnter
                                      ? "bg-primary hover:bg-primary/90"
                                      : "bg-primary/40"
                                  } disabled:cursor-not-allowed`}
                                >
                                  {foundingBusy ? "Starting..." : `${selectedFacilityAction} it`}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
