"use client";
import type { ReactNode } from "react";
import type { LegacyProposeBillModalViewContext } from "./ProposeBillModal";

import { EuropeanTreatyProvisionEditor } from "@/components/bills/EuropeanTreatyProvisionEditor";

import { ladderBounds } from "@/lib/legislature/policyLadder";

import { reserveManpowerLabel } from "@/lib/military/manpower";
import { BILL_PROPOSE_ACTION_COST, MAX_PROVISIONS } from "@shared/constants/legislation";

import { getEconomicPositionName, getSocialPositionName } from "@/lib/utils/politics";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { formatLocalAmount } from "@/lib/utils/formatters";
import { PolicyEffectIndicators } from "@/components/legislation/PolicyEffectIndicators";
import { LawProvisionComparison } from "@/components/bills/LawProvisionComparison";
import { TaxRateSliderControl } from "@/components/legislation/TaxRateSliderControl";
import { TariffProvisionEditor } from "@/components/bills/TariffProvisionEditor";
import { EmbargoProvisionEditor } from "@/components/bills/EmbargoProvisionEditor";
import { SubsidySectorSelect } from "@/components/bills/SubsidySectorSelect";
import { NationalizationProvisionEditor } from "@/components/bills/NationalizationProvisionEditor";
import { BillAutoFailWarningBanner } from "@/components/bills/BillAutoFailWarning";

import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";

import MinimumWageFloorNote from "@/components/legislation/MinimumWageFloorNote";
export function renderLegacyProposeBillModalView(
  context: LegacyProposeBillModalViewContext
): ReactNode {
  const {
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
  } = context;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto py-8">
      <div
        className="w-full max-w-lg rounded-2xl border border-card-border bg-card p-6 space-y-5 shadow-modal my-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Propose a bill"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Propose legislation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error"
          >
            {error}
          </div>
        )}

        {selectedProposalWarning && <BillAutoFailWarningBanner warning={selectedProposalWarning} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bill-title" className="block text-xs text-muted mb-1">
              Bill title
            </label>
            <input
              id="bill-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Infrastructure Investment Act"
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label htmlFor="bill-summary" className="block text-xs text-muted mb-1">
              Summary
            </label>
            <textarea
              id="bill-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description of what this bill does..."
              rows={3}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bill-category" className="block text-xs text-muted mb-1">
                Category
              </label>
              <select
                id="bill-category"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm capitalize"
                required
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
              {categoriesError && (
                <div className="mt-1">
                  <SupplementaryLoadError
                    message="Failed to load bill categories."
                    onRetry={loadNationalTypes}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Originating chamber</label>
              <select
                value={billChamber}
                onChange={(e) => setBillChamber(e.target.value as "house" | "senate" | "joint")}
                className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
                disabled={!adminOverride && !!myChamber}
              >
                {/* Non-admins can only propose to their chamber or joint */}
                {(adminOverride || !myChamber || myChamber === "house") && (
                  <option value="house">House</option>
                )}
                {(adminOverride || !myChamber || myChamber === "senate") && (
                  <option value="senate">Senate</option>
                )}
                <option value="joint">Joint</option>
              </select>
              {!adminOverride && myChamber && (
                <p className="text-[10px] text-muted mt-1">
                  As a {myChamber === "house" ? "Representative" : "Senator"}, you can propose{" "}
                  {myChamber === "house" ? "House" : "Senate"} or Joint bills.
                </p>
              )}
            </div>
          </div>

          <div>
            {canDecideTreaty && (
              <EuropeanTreatyProvisionEditor action={treatyAction} onChange={setTreatyAction} />
            )}
            {isCustomCat ? (
              /* ── Custom (flavor) bill: no provisions, no in-game effect ── */
              <p className="rounded-lg border border-card-border bg-card/50 px-3 py-2 text-xs text-muted">
                Custom bills have no in-game effect — for flavor / roleplay only. Just give it a
                title and summary.
              </p>
            ) : isNatCat ? (
              /* ── State-ownership (nationalization) provision editor ── */
              <NationalizationProvisionEditor
                countryCode={countryId}
                value={natRows}
                onChange={setNatRows}
              />
            ) : isTradeCat ? (
              /* ── Trade restriction editor: tariff or embargo ── */
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">Restriction type</label>
                  <div
                    role="tablist"
                    aria-label="Trade restriction type"
                    className="inline-flex rounded-lg border border-card-border bg-card p-1"
                  >
                    {(["tariff", "embargo"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        role="tab"
                        aria-selected={tradeSubType === st}
                        onClick={() => setTradeSubType(st)}
                        className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                          tradeSubType === st
                            ? "bg-primary/15 text-foreground"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                {tradeSubType === "embargo" ? (
                  <EmbargoProvisionEditor
                    value={embargoRows}
                    onChange={setEmbargoRows}
                    countryId={countryId}
                    enabledCountryIds={enabledCountryIds}
                  />
                ) : (
                  <TariffProvisionEditor
                    value={tariffRows}
                    onChange={setTariffRows}
                    countryId={countryId}
                    enabledCountryIds={enabledCountryIds}
                  />
                )}
              </div>
            ) : isSubsidyCat ? (
              /* ── Subsidy provision builder ── */
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-muted">Subsidy provisions</label>
                  {subsidyProvisions.length < MAX_PROVISIONS && (
                    <button
                      type="button"
                      onClick={() =>
                        setSubsidyProvisions((prev) => [
                          ...prev,
                          {
                            type: "subsidy",
                            scopeType: "economy_wide",
                            targetSectorType: "",
                            targetStrategyId: "",
                            domesticOnly: false,
                          },
                        ])
                      }
                      className="text-xs text-primary hover:underline"
                    >
                      + Add provision
                    </button>
                  )}
                </div>
                {subsidyProvisions.map((sp, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-card-border bg-background/50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={sp.type}
                        onChange={(e) =>
                          setSubsidyProvisions((prev) => {
                            const next = [...prev];
                            next[i] = {
                              ...next[i],
                              type: e.target.value as "subsidy" | "end_subsidy",
                            };
                            return next;
                          })
                        }
                        className="flex-1 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="subsidy">Grant subsidy</option>
                        <option value="end_subsidy">End subsidy</option>
                      </select>
                      {subsidyProvisions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSubsidyProvisions((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-muted hover:text-red-400 text-xs"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <select
                      value={sp.scopeType}
                      onChange={(e) =>
                        setSubsidyProvisions((prev) => {
                          const next = [...prev];
                          next[i] = {
                            ...next[i],
                            scopeType: e.target.value as "economy_wide" | "sector",
                            targetSectorType: "",
                          };
                          return next;
                        })
                      }
                      className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="economy_wide">Economy-wide</option>
                      <option value="sector">Specific sector</option>
                    </select>
                    {sp.scopeType === "sector" && (
                      <SubsidySectorSelect
                        value={sp.targetSectorType}
                        onChange={(value) =>
                          setSubsidyProvisions((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], targetSectorType: value };
                            return next;
                          })
                        }
                        className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
                      />
                    )}
                    <input
                      type="text"
                      value={sp.targetStrategyId}
                      onChange={(e) =>
                        setSubsidyProvisions((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], targetStrategyId: e.target.value };
                          return next;
                        })
                      }
                      placeholder="Strategy filter (optional, e.g. wind)"
                      className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
                    />
                    {sp.type === "subsidy" && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sp.domesticOnly}
                          onChange={(e) =>
                            setSubsidyProvisions((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], domesticOnly: e.target.checked };
                              return next;
                            })
                          }
                          className="rounded"
                        />
                        <span className="text-muted text-xs">Domestic corporations only</span>
                      </label>
                    )}
                    {sp.type === "subsidy" && (
                      <p className="text-xs text-emerald-400/80">
                        +7.5% profit margin to qualifying sectors
                      </p>
                    )}
                  </div>
                ))}

                {/* Union-law provision (v3 Phase 7b) — optional, additive to subsidy provisions above. Explicit checkbox controls inclusion (code-review fix #15) so bias=0 can be a real, legislatable reset to neutral. */}
                <div className="rounded-lg border border-dashed border-purple-500/35 bg-purple-500/5 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnionLaw}
                      onChange={(e) => setIncludeUnionLaw(e.target.checked)}
                      className="rounded"
                    />
                    Include union-law provision
                  </label>
                  {/* Union ban (player suggestion #93): bias law vs ban/repeal action. */}
                  <select
                    value={unionLawAction}
                    disabled={!includeUnionLaw}
                    onChange={(e) =>
                      setUnionLawAction(e.target.value as "bias" | "ban" | "repeal_ban")
                    }
                    className="w-full rounded-md border border-card-border bg-card-elevated px-2 py-1.5 text-xs disabled:opacity-40"
                  >
                    <option value="bias">Set union-law bias (slider)</option>
                    <option value="ban">Ban unions nationally</option>
                    <option value="repeal_ban">Repeal the union ban</option>
                  </select>
                  <div className="flex items-center justify-between text-body-sm font-medium text-muted">
                    <span>← Right-to-work</span>
                    <span>Neutral (0)</span>
                    <span>Collective bargaining →</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="union-law-bias"
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={unionLawBias}
                      disabled={!includeUnionLaw || unionLawAction !== "bias"}
                      onInput={(e) => setUnionLawBias(Number((e.target as HTMLInputElement).value))}
                      className="flex-1 accent-purple-500 disabled:opacity-40"
                    />
                    <span className="min-w-[64px] rounded-md border border-card-border bg-card-elevated px-2 py-1 text-right font-mono text-xs">
                      {unionLawBias}
                    </span>
                  </div>
                  <p className="text-[11px] italic text-muted/60">
                    {!includeUnionLaw
                      ? "No union-law provision will be included in this bill."
                      : unionLawAction === "ban"
                        ? "Outlaws unions nationally — player unions suspend, unionization decays to zero, and strikes end. Existing bias is preserved for a future repeal."
                        : unionLawAction === "repeal_ban"
                          ? "Lifts the national union ban — suspended unions and normal unionization drift resume."
                          : unionLawBias === 0
                            ? "Explicit reset to neutral — clears any existing union-law bias."
                            : unionLawBias > 0
                              ? `Collective-bargaining strength +${unionLawBias} — biases unionization upward nationally.`
                              : `Right-to-work strength ${unionLawBias} — biases unionization downward nationally.`}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-muted">Provisions (type + policy)</label>
                  {provisions.length < maxPolicyProvisions && (
                    <button
                      type="button"
                      onClick={addProvision}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add provision
                    </button>
                  )}
                </div>
                {typesError && (
                  <div className="mb-2">
                    <SupplementaryLoadError
                      message="Failed to load bill types for this category."
                      onRetry={loadLegislationTypes}
                    />
                  </div>
                )}
                {policiesError && (
                  <div className="mb-2">
                    <SupplementaryLoadError
                      message="Failed to load current policy levels. Approval previews may be off."
                      onRetry={loadCurrentPolicies}
                    />
                  </div>
                )}
                <div className="space-y-3">
                  {provisions.map((p, i) => {
                    const type = legislationTypes.find((t) => t._id === p.legislationTypeId);
                    const options = type?.policyOptions ?? [];
                    return (
                      <div
                        key={i}
                        className="rounded-lg border border-card-border bg-background/50 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted">Provision {i + 1}</span>
                          {provisions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeProvision(i)}
                              className="text-xs text-red-400 hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <select
                            value={p.legislationTypeId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setProvision(i, {
                                legislationTypeId: id,
                                policyOptionId: "",
                                effectDirection: 0,
                              });
                            }}
                            className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
                            required
                          >
                            <option value="">Select type…</option>
                            {legislationTypes.map((lt) => (
                              <option key={lt._id} value={lt._id}>
                                {lt.name}
                                {lt.eraNew ? " — New this era" : ""}
                              </option>
                            ))}
                          </select>
                          {p.legislationTypeId && type?.taxSliderEstimate && (
                            <TaxRateSliderControl
                              slider={type.taxSliderEstimate}
                              proposedRate={p.proposedRate ?? type.taxSliderEstimate.currentRate}
                              currencyCode={COUNTRY_CURRENCY_MAP[countryId]}
                              onChange={(rate) =>
                                setProvision(i, {
                                  proposedRate: rate,
                                  policyOptionId: `rate:${rate}`,
                                  effectDirection:
                                    rate > type.taxSliderEstimate!.currentRate ? 1 : -1,
                                })
                              }
                            />
                          )}
                          {p.legislationTypeId &&
                            !type?.taxSliderEstimate &&
                            (options.length > 0 ? (
                              <select
                                value={p.policyOptionId}
                                onChange={(e) => {
                                  const opt = options.find((o) => o.id === e.target.value);
                                  setProvision(i, {
                                    policyOptionId: e.target.value,
                                    effectDirection: opt?.effectDirection ?? 0,
                                    economic: opt?.economic ?? 0,
                                    social: opt?.social ?? 0,
                                  });
                                }}
                                className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
                              >
                                {options.map((opt, optIdx) => {
                                  const econ = opt.economic ?? 0;
                                  const soc = opt.social ?? 0;
                                  const posLabel = [
                                    econ !== 0 && `${getEconomicPositionName(econ)} econ`,
                                    soc !== 0 && `${getSocialPositionName(soc)} social`,
                                  ]
                                    .filter(Boolean)
                                    .join(", ");
                                  const estimate = type?.estimates?.[optIdx];
                                  const netLabel =
                                    estimate && (estimate.cost !== 0 || estimate.revenue !== 0)
                                      ? ` · net ${formatLocalAmount(estimate.net, COUNTRY_CURRENCY_MAP[countryId])}/yr`
                                      : "";
                                  // Reserve-forces laws set the nation's replacement manpower:
                                  // show each level's effect on the pool before the bill is filed.
                                  const manpowerLabel = reserveManpowerLabel(
                                    countryId,
                                    p.legislationTypeId,
                                    optIdx,
                                    type?.countryScope
                                  );
                                  const suffix =
                                    (posLabel ? ` — ${posLabel}` : "") + netLabel + manpowerLabel;
                                  const isBlocked = blockedProvisionKeys.has(
                                    `${p.legislationTypeId}:${opt.id}`
                                  );
                                  const isCurrentLevel =
                                    currentPolicies[p.legislationTypeId] === optIdx;
                                  const disableReason = isCurrentLevel
                                    ? " (current law)"
                                    : isBlocked
                                      ? " (active bill exists)"
                                      : "";
                                  return (
                                    <option
                                      key={opt.id}
                                      value={opt.id}
                                      disabled={isBlocked || isCurrentLevel}
                                    >
                                      {opt.name}
                                      {suffix}
                                      {disableReason}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <select
                                value={p.effectDirection}
                                onChange={(e) =>
                                  setProvision(i, {
                                    effectDirection: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
                              >
                                <option value={-1}>Decrease</option>
                                <option value={0}>Neutral</option>
                                <option value={1}>Increase</option>
                              </select>
                            ))}
                        </div>
                        {/* Explanation text below provision */}
                        {p.legislationTypeId && (
                          <div className="text-xs pt-1 border-t border-card-border/50 mt-2">
                            {(() => {
                              const selectedOpt = options.find((o) => o.id === p.policyOptionId);
                              // New-gen catalog laws: flavor line + selected level's
                              // explanation stacked. Legacy: winner-takes-all line.
                              if (type?.politicalMetricTargets?.length) {
                                return (
                                  <div className="space-y-1">
                                    {type.description && (
                                      <p className="italic text-muted/80">{type.description}</p>
                                    )}
                                    {selectedOpt?.explanation && (
                                      <p className="text-muted">{selectedOpt.explanation}</p>
                                    )}
                                  </div>
                                );
                              }
                              const explanation =
                                selectedOpt?.explanation ?? type?.explanation ?? type?.description;
                              return (
                                <>
                                  {explanation ? (
                                    <span className="italic text-muted/80">{explanation}</span>
                                  ) : null}
                                  <MinimumWageFloorNote kaitz={selectedOpt?.wageFloorKaitz} />
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {/* New-gen laws: Current law → Proposed comparison with
                            per-level fiscal estimates + metric deltas vs enacted. */}
                        {p.legislationTypeId && type && (
                          <div className="pt-2">
                            <LawProvisionComparison
                              countryId={countryId}
                              lt={type}
                              currentIndex={currentPolicies[p.legislationTypeId]}
                              proposedIndex={options.findIndex((o) => o.id === p.policyOptionId)}
                            />
                          </div>
                        )}
                        {/* Effect indicators — tax-slider laws skip the archetype
                            panel; approval flows through metrics/economy channels. */}
                        {p.legislationTypeId && !type?.taxSliderEstimate && (
                          <PolicyEffectIndicators
                            effectTargetsWeighted={type?.effectTargetsWeighted}
                            effectDirection={p.effectDirection}
                            bucketApprovals={
                              options.find((o) => o.id === p.policyOptionId)?.bucketApprovals
                            }
                            policyDomain={type?.policyDomain}
                            currentPolicyIndex={
                              currentPolicies[p.legislationTypeId] ??
                              ladderBounds(options.length).centerIndex
                            }
                            proposedPolicyIndex={options.findIndex(
                              (o) => o.id === p.policyOptionId
                            )}
                            policyOptions={options}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Electoral law — social bills only. Two independent axes, each
                    with its own checkbox: an electoral bill that touches one must
                    not silently reset the other, which is the rule the server
                    enforces too. */}
                {isElectoralCat && (
                  <div className="mt-3 rounded-lg border border-dashed border-sky-500/35 bg-sky-500/5 p-3 space-y-3">
                    <p className="text-xs font-medium text-muted">Electoral law (optional)</p>

                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeVotingAge}
                          onChange={(e) => setIncludeVotingAge(e.target.checked)}
                          className="rounded"
                        />
                        Set the voting age
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={16}
                          max={25}
                          step={1}
                          value={votingAge}
                          disabled={!includeVotingAge}
                          onInput={(e) =>
                            setVotingAge(Number((e.target as HTMLInputElement).value))
                          }
                          className="flex-1 accent-sky-500 disabled:opacity-40"
                        />
                        <span className="min-w-[48px] rounded-md border border-card-border bg-card-elevated px-2 py-1 text-right font-mono text-xs">
                          {votingAge}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeRegAccess}
                          onChange={(e) => setIncludeRegAccess(e.target.checked)}
                          className="rounded"
                        />
                        Set registration access
                      </label>
                      <div className="flex items-center justify-between text-body-sm font-medium text-muted">
                        <span>&larr; Restricted</span>
                        <span>Neutral (0)</span>
                        <span>Automatic &rarr;</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={1}
                          value={registrationAccess}
                          disabled={!includeRegAccess}
                          onInput={(e) =>
                            setRegistrationAccess(Number((e.target as HTMLInputElement).value))
                          }
                          className="flex-1 accent-sky-500 disabled:opacity-40"
                        />
                        <span className="min-w-[48px] rounded-md border border-card-border bg-card-elevated px-2 py-1 text-right font-mono text-xs">
                          {registrationAccess}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] italic text-muted/60">
                      {!includeVotingAge && !includeRegAccess
                        ? "No electoral-law provision will be included in this bill."
                        : [
                            includeVotingAge ? `Voting age set to ${votingAge}.` : null,
                            includeRegAccess
                              ? registrationAccess === 0
                                ? "Registration access reset to neutral."
                                : registrationAccess > 0
                                  ? `Registration access +${registrationAccess} — voters reach the rolls faster and fewer lapse.`
                                  : `Registration access ${registrationAccess} — the rolls grow slower and lapse faster.`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-lg border border-card-border bg-card/50 px-3 py-2 text-xs text-muted">
            {adminOverride ? (
              <span>Cost waived (admin).</span>
            ) : (
              <>
                <span>
                  Cost: {BILL_PROPOSE_ACTION_COST} actions + {totalCost} national influence
                </span>
                <span className="block mt-0.5 text-muted/80">
                  1st provision: 5 NPI; 2nd: 10; 3rd: 15. Refunded if bill passes.
                </span>
                {projection && projection.costAmount > 0 && (
                  <span className="mt-2 block border-t border-card-border pt-2">
                    <span className="block font-medium text-foreground">
                      Projected annual cost:{" "}
                      {formatCurrencyFaceAmount(projection.costAmount, projection.currencyCode)}{" "}
                      <span className="text-muted/80">
                        ({projection.pctOfGdp.toFixed(1)}% of GDP)
                      </span>
                    </span>
                    {projection.warning === "DEBT_CEILING_EXCEEDED" && (
                      <span className="mt-0.5 block text-red-400">
                        Warning: this would push the budget past its debt ceiling.
                      </span>
                    )}
                    {projection.warning === "HIGH_DEBT" && (
                      <span className="mt-0.5 block text-amber-400">
                        Note: this country is already carrying high debt.
                      </span>
                    )}
                  </span>
                )}
                {(nationalInfluence != null || actions != null) && (
                  <span className="block mt-0.5">
                    Balance: {actions ?? "?"} actions, {nationalInfluence?.toFixed(0) ?? "?"} NPI
                  </span>
                )}
                {!canAffordActions && (
                  <p className="text-error text-xs mt-1">
                    Not enough action points ({actions ?? 0}/{BILL_PROPOSE_ACTION_COST}).
                  </p>
                )}
                {totalCost > 0 && nationalInfluence != null && nationalInfluence < totalCost && (
                  <span className="block mt-1 text-red-400">
                    Not enough national political influence for this many provisions.
                  </span>
                )}
                {budgetError && (
                  <div className="mt-1">
                    <SupplementaryLoadError
                      message="Failed to load your action and influence balance."
                      onRetry={loadBudget}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {hasActiveBill && !adminOverride && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              You already have a bill being voted on — it must resolve before you can propose
              another.
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-card-border bg-card py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !canAfford || (hasActiveBill && !adminOverride)}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border transition-colors"
            >
              {loading ? "Proposing…" : "Propose bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
