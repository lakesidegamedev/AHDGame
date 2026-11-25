"use client";
import type { ReactNode } from "react";
import type { GuidedLegislationModalViewContext } from "./GuidedLegislationModal";
import type { SubsidyScope } from "./GuidedLegislationModal";
import { OptionLeanBadges, TaxLeanBadges } from "./LegislationLeanBadges";
import { changeClass, metricDirectionClass, money } from "./guidedLegislationFormat";

import type { CountryId } from "@/lib/constants/countriesCore";

import {
  BILL_PROPOSE_ACTION_COST,
  CUSTOM_BILL_BODY_MAX_LENGTH,
  getProvisionCostTotal,
  MAX_PROVISIONS,
} from "@shared/constants/legislation";

import { type OperatingSectorType } from "@/lib/constants/corporationsClient";
import { SubsidySectorSelect } from "@/components/bills/SubsidySectorSelect";
import { EmbargoProvisionEditor } from "@/components/bills/EmbargoProvisionEditor";
import {
  toPayload as embargoToPayload,
  validateRows as validateEmbargoRows,
} from "@/components/bills/embargoProvisionTypes";

import { formatEmbargoProvisionLabel } from "@/lib/legislature/embargoProvisionLabel";

export function renderGuidedLegislationModalView(
  context: GuidedLegislationModalViewContext
): ReactNode {
  const {
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
  } = context;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 py-8">
      <div className="my-auto w-full max-w-5xl rounded-2xl border border-card-border bg-card shadow-modal">
        <header className="flex items-start justify-between border-b border-card-border p-5">
          <div>
            <h2 className="text-heading font-semibold">
              {queue ? "Queue a bill" : "Guided legislative proposal"}
            </h2>
            <p className="mt-1 text-body-sm text-muted">
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
                className="rounded-lg border border-card-border px-3 py-2 text-body font-medium hover:border-primary hover:text-primary"
              >
                Back to bill
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-heading text-muted"
            >
              ×
            </button>
          </div>
        </header>

        <div className="border-b border-card-border px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {steps.map((candidate) => {
              const className = `rounded px-2 py-1 text-body-sm ${step === candidate.id ? "bg-primary text-white" : "bg-background text-muted"}`;
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
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
              {t("activeBillProposalBlocked")}
            </div>
          ) : null}
          {loadError && !isCustomBill ? (
            <div
              role="alert"
              className="rounded-lg border border-error/40 bg-error/10 p-4 text-body text-error"
            >
              {loadError}
            </div>
          ) : null}
          {!catalog && !loadError && !isCustomBill ? (
            <p className="text-body text-muted">Loading the reviewed catalog...</p>
          ) : null}
          {catalog || step === "starting" || step === "overview" ? (
            <>
              {step === "starting" ? (
                <section className="space-y-5">
                  <div>
                    <h3 className="font-semibold">How do you want to find a law?</h3>
                    <p className="mt-1 text-body text-muted">{t("startingHelp")}</p>
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
                        className={`rounded-lg border px-4 py-2 text-body ${path === value ? "border-primary bg-primary/15 text-primary" : "border-card-border"}`}
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
                    <label className="block max-w-xl text-body text-muted">
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
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-body text-foreground"
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
                    <label className="block max-w-xl text-body text-muted">
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
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-body text-foreground"
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
                        className="rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground"
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
                          <span className="mt-2 block text-body-sm text-muted">
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
                          <span className="text-body-sm font-semibold text-primary">
                            {candidate.domain}
                          </span>
                          <span className="mt-1 block font-medium">{candidate.title}</span>
                          <span className="mt-2 block text-body-sm text-muted">
                            Current law: {candidate.currentLaw}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep("starting")}
                    className="rounded-lg border border-card-border px-4 py-2 text-body"
                  >
                    Back
                  </button>
                </section>
              ) : null}

              {step === "level" && family ? (
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold">{family.title}</h3>
                    <p className="mt-1 text-body text-muted" title={family.currentLawDescription}>
                      Current law: {family.currentLaw}. The matching level is shown but cannot be
                      proposed.
                    </p>
                    <p className="mt-2 text-body-sm text-muted">
                      Overseeing agency: {agencyName(family)}
                    </p>
                    <p
                      className="mt-1 text-body-sm text-muted"
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
                          <span className="text-body-sm font-semibold uppercase text-primary">
                            {candidate.option.choice === "leave_to_states"
                              ? "Leave it to the States"
                              : "Policy option"}
                            {current ? " · current law" : ""}
                          </span>
                          <span className="mt-1 block font-semibold">{candidate.title}</span>
                          <OptionLeanBadges
                            familyId={family.familyId}
                            choice={candidate.option.choice}
                            countryId={countryId}
                            className="mt-2"
                          />
                          <span className="mt-2 block text-body-sm text-muted">
                            {candidate.description}
                          </span>
                          <span className="mt-3 block border-t border-card-border pt-2 text-body-sm">
                            Allocation{" "}
                            {money(
                              current
                                ? candidate.currentAnnualAllocation
                                : candidate.option.annualAllocation
                            )}
                          </span>
                          <span
                            className={`block text-body-sm font-medium ${changeClass(candidate.annualAllocationDelta, true)}`}
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
                                className={`block text-body-sm font-medium ${changeClass(normalizedEffectChange(family, candidate, effect.metricId), false)}`}
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
                    className="rounded-lg border border-card-border px-4 py-2 text-body"
                  >
                    Back
                  </button>
                </section>
              ) : null}

              {step === "level" && tax && taxEstimate ? (
                <section className="space-y-5">
                  <div>
                    <h3 className="font-semibold">{tax.title}</h3>
                    <p className="mt-1 text-body text-muted">
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
                    <div className="mt-3 flex items-center justify-between text-body">
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
                  {taxRate !== "" && Number.isFinite(taxRate) && (
                    <TaxLeanBadges estimate={taxEstimate} rate={taxRate} countryId={countryId} />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("family")}
                      className="rounded-lg border border-card-border px-4 py-2 text-body"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!taxRateValid || taxRate === taxEstimate.currentRate}
                      onClick={() => setStep("review")}
                      className="rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground disabled:bg-card-border disabled:text-muted"
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
                    <p className="mt-1 text-body text-muted">
                      {subsidyAction === "subsidy"
                        ? "Choose which companies qualify for the +7.5% profit margin."
                        : "Choose the subsidy to withdraw."}
                    </p>
                  </div>
                  <div className="space-y-3 rounded-xl border border-card-border bg-background/40 p-5">
                    <label className="block text-body text-muted">
                      Coverage
                      <select
                        value={subsidyScope}
                        onChange={(event) => {
                          setSubsidyScope(event.target.value as SubsidyScope);
                          setSubsidySector("");
                        }}
                        className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-body text-foreground"
                      >
                        <option value="economy_wide">Economy-wide</option>
                        <option value="sector">Specific sector</option>
                      </select>
                    </label>
                    {subsidyScope === "sector" ? (
                      <label className="block text-body text-muted">
                        Sector
                        <SubsidySectorSelect
                          value={subsidySector}
                          onChange={(value) => setSubsidySector(value as OperatingSectorType | "")}
                          placeholderLabel="Select a sector"
                          className="mt-2 w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-body text-foreground"
                        />
                      </label>
                    ) : null}
                    {subsidyAction === "subsidy" ? (
                      <label className="flex cursor-pointer items-center gap-2 text-body">
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
                      className="rounded-lg border border-card-border px-4 py-2 text-body"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!subsidyValid}
                      onClick={() => setStep("review")}
                      className="rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground disabled:bg-card-border disabled:text-muted"
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
                    className="rounded-lg border border-error/40 bg-error/10 p-4 text-body text-error"
                  >
                    This policy level is unavailable. Return to the law list and choose another
                    provision.
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("family")}
                    className="rounded-lg border border-card-border px-4 py-2 text-body"
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
                      <p className="text-body-sm font-semibold uppercase text-primary">
                        Proposed policy
                      </p>
                      <h4 className="mt-1 font-semibold">{option.title}</h4>
                      <OptionLeanBadges
                        familyId={family.familyId}
                        choice={option.option.choice}
                        countryId={countryId}
                        className="mt-2"
                      />
                      <p className="mt-2 text-body text-muted">{option.description}</p>
                      <dl className="mt-4 grid gap-3 text-body sm:grid-cols-2">
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
                          className="text-body-sm text-muted"
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
                      <p className="mt-2 text-body text-muted">
                        {subsidyAction === "subsidy"
                          ? `Qualifying companies earn a +7.5% profit margin.${subsidyDomesticOnly ? ` ${domesticOnlyLabel}.` : ""}`
                          : "Ends the matching active subsidy."}
                      </p>
                    </div>
                  ) : tax && taxEstimate && taxRateValid ? (
                    <div className="rounded-xl border border-card-border bg-background/40 p-5">
                      <h4 className="font-semibold">{tax.title}</h4>
                      <TaxLeanBadges
                        estimate={taxEstimate}
                        rate={Number(taxRate)}
                        countryId={countryId}
                        className="mt-2"
                      />
                      <p className="mt-2 text-body">
                        Current rate {taxEstimate.currentRate}% → proposed rate {taxRate}%
                      </p>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("level")}
                      className="rounded-lg border border-card-border px-4 py-2 text-body"
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
                      className="rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground"
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
                      <p className="text-body text-muted">
                        {isCustomBill
                          ? t("noEffects")
                          : "Review the draft or add another provision without retracing the previous steps."}
                      </p>
                    </div>
                    {isCustomBill ? (
                      <button
                        type="button"
                        onClick={beginAnother}
                        className="rounded-lg border border-card-border px-4 py-2 text-body"
                      >
                        {t("changeStartingPoint")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={draft.length >= MAX_PROVISIONS}
                        onClick={beginAnother}
                        className="rounded-lg border border-card-border px-4 py-2 text-body disabled:opacity-50"
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
                            {provision.kind === "law" && (
                              <OptionLeanBadges
                                familyId={provision.family.familyId}
                                choice={provision.option.option.choice}
                                countryId={countryId}
                              />
                            )}
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
                            <p className="mt-1 text-body-sm text-muted">
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
                            className="text-body-sm text-error"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-body-sm text-muted">
                      Bill title
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-body text-foreground"
                      />
                    </label>
                    {chambers.length > 0 ? (
                      <label className="text-body-sm text-muted">
                        Originating chamber
                        <select
                          value={chamber}
                          onChange={(event) => setChamber(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-body text-foreground"
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
                  <label className="block text-body-sm text-muted">
                    {isCustomBill ? t("messageBody") : "Summary"}
                    <textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      maxLength={bodyLimit}
                      rows={isCustomBill ? 10 : 3}
                      className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-body text-foreground"
                    />
                  </label>
                  {isCustomBill ? (
                    <p className="text-body-sm text-muted" aria-live="polite">
                      {t("characterCount", {
                        count: summary.length,
                        limit: CUSTOM_BILL_BODY_MAX_LENGTH,
                      })}
                    </p>
                  ) : (
                    <p className="text-body-sm text-muted" title={catalog?.balanceNotice}>
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
                      className="rounded-lg bg-primary px-5 py-2 text-body font-semibold text-primary-foreground disabled:bg-card-border disabled:text-muted"
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
