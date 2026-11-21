"use client";
import type { ReactNode } from "react";
import type { LegacyProposeLegislationModalViewContext } from "./ProposeLegislationModal";

import { EuropeanTreatyProvisionEditor } from "@/components/bills/EuropeanTreatyProvisionEditor";

import { ladderBounds } from "@/lib/legislature/policyLadder";
import { Slider } from "@/components/ui";

import { BILL_PROPOSE_ACTION_COST, MAX_PROVISIONS } from "@shared/constants/legislation";

import { TariffProvisionEditor } from "@/components/bills/TariffProvisionEditor";
import { EmbargoProvisionEditor } from "@/components/bills/EmbargoProvisionEditor";
import { SubsidySectorSelect } from "@/components/bills/SubsidySectorSelect";
import { CentralBankProvisionEditor } from "@/components/bills/CentralBankProvisionEditor";
import { EconomicSystemReformEditor } from "@/components/bills/EconomicSystemReformEditor";

import { NationalizationProvisionEditor } from "@/components/bills/NationalizationProvisionEditor";
import { BillAutoFailWarningBanner } from "@/components/bills/BillAutoFailWarning";

import { PolicyEffectIndicators } from "@/components/legislation/PolicyEffectIndicators";
import {
  BillFiscalImpactStrip,
  LawProvisionComparison,
} from "@/components/bills/LawProvisionComparison";

import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";

import { TaxRateSliderControl } from "@/components/legislation/TaxRateSliderControl";

import MinimumWageFloorNote from "@/components/legislation/MinimumWageFloorNote";
export function renderLegacyProposeLegislationModalView(
  context: LegacyProposeLegislationModalViewContext
): ReactNode {
  const {
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
  } = context;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 py-8">
      <div className="my-auto w-full max-w-lg space-y-5 rounded-2xl border border-card-border bg-card p-6 shadow-modal">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Propose legislation</h2>
            <p className="text-xs text-muted">
              Costs {BILL_PROPOSE_ACTION_COST} action points and {npiCost} national influence.
            </p>
          </div>
          {adminOverride && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
              Admin
            </span>
          )}
          <button
            onClick={onClose}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedProposalWarning && (
            <BillAutoFailWarningBanner warning={selectedProposalWarning} />
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. National Health Service Reform Act"
              className="w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Summary *</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Briefly describe what this bill does…"
              className="w-full resize-none rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Category *</label>
              <select
                value={cat}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm capitalize text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Originating chamber
              </label>
              <select
                value={billChamber}
                disabled={!chamberSelectable}
                onChange={(e) => setBillChamber(e.target.value)}
                className="w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-default disabled:opacity-100"
              >
                {chambers.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {isCustomCat ? (
            /* ── Custom (flavor) bill: no provisions, no in-game effect ── */
            <p className="rounded-lg border border-card-border bg-card/50 px-3 py-2 text-xs text-muted">
              Custom bills have no in-game effect — for flavor / roleplay only. Just give it a title
              and summary.
            </p>
          ) : isNatCat ? (
            <NationalizationProvisionEditor
              countryCode={countryId}
              value={natRows}
              onChange={setNatRows}
            />
          ) : isTradeCat ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Restriction type
                </label>
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
            <div className="space-y-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs text-muted">Subsidy provisions</label>
                {subsidyProvisions.length < MAX_PROVISIONS && (
                  <button
                    type="button"
                    onClick={() => setSubsidyProvisions((prev) => [...prev, { ...EMPTY_SUBSIDY }])}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add provision
                  </button>
                )}
              </div>
              {subsidyProvisions.map((sp, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-card-border bg-background/50 p-3"
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
                      className="flex-1 rounded-lg border border-card-border bg-card px-2 py-1.5 text-sm"
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
                        className="text-xs text-muted hover:text-red-400"
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
                    className="w-full rounded-lg border border-card-border bg-card px-2 py-1.5 text-sm"
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
                      className="w-full rounded-lg border border-card-border bg-card px-2 py-1.5 text-sm"
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
                    placeholder="Strategy filter (optional)"
                    className="w-full rounded-lg border border-card-border bg-card px-2 py-1.5 text-sm"
                  />
                  {sp.type === "subsidy" && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
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
                      <span className="text-xs text-muted">{domesticOnlyLabel}</span>
                    </label>
                  )}
                  {sp.type === "subsidy" && (
                    <p className="text-xs text-emerald-400/80">
                      +7.5% profit margin to qualifying sectors
                    </p>
                  )}
                </div>
              ))}

              {/* Union-law provision (v3 Phase 7b) — optional, additive to subsidy provisions above.
                  Inclusion is an explicit checkbox (code-review fix #15) — bias=0 is a valid,
                  legislatable reset to neutral, not just "don't propose one". */}
              <div className="space-y-2 rounded-lg border border-dashed border-purple-500/35 bg-purple-500/5 p-3">
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Provisions ({rows.length}/{maxPolicyRows})
                </label>
                <button
                  type="button"
                  onClick={addRow}
                  disabled={rows.length >= maxPolicyRows}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  + Add provision
                </button>
              </div>
              {hasStandaloneProvision && rows.some((r) => !r.legislationTypeId) && (
                <p className="text-[11px] leading-snug text-muted">
                  {rows.every((r) => !r.legislationTypeId)
                    ? "This bill carries no policy provision. It will be proposed with only the provision selected below, which is a complete statute on its own."
                    : "Provisions left blank will be dropped from this bill."}
                </p>
              )}
              {rows.length === 0 && (
                <p className="rounded-lg border border-dashed border-card-border bg-background/40 p-3 text-[11px] leading-snug text-muted">
                  {hasStandaloneProvision
                    ? "No policy provisions. This bill carries only the provision selected below."
                    : "This bill has no provisions. Add one, or select a provision below, before proposing it."}
                </p>
              )}
              {rows.map((row, idx) => {
                const lt = legislationTypes.find((t) => t._id === row.legislationTypeId);
                const options = lt?.policyOptions ?? [];
                const selectedOption = options.find((o) => o.id === row.policyOptionId);
                return (
                  <div
                    key={idx}
                    className="space-y-2 rounded-lg border border-card-border bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-medium text-muted">
                        Provision {idx + 1}
                      </span>
                      {(rows.length > 1 || hasStandaloneProvision) && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <select
                      className="w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground"
                      value={row.legislationTypeId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const nextLt = legislationTypes.find((t) => t._id === nextId);
                        const first = nextLt?.policyOptions?.[0];
                        // Tax-slider laws start at the live current rate (submit
                        // stays blocked until the player moves it a full step).
                        const slider = nextLt?.taxSliderEstimate;
                        updateRow(idx, {
                          legislationTypeId: nextId,
                          policyOptionId: slider ? `rate:${slider.currentRate}` : (first?.id ?? ""),
                          effectDirection: first?.effectDirection ?? 0,
                          economic: first?.economic ?? 0,
                          social: first?.social ?? 0,
                          proposedRate: slider ? slider.currentRate : undefined,
                        });
                      }}
                    >
                      <option value="">Select policy type…</option>
                      {filteredTypes.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                          {t.eraNew ? " — New this era" : ""}
                        </option>
                      ))}
                    </select>
                    {lt?.taxSliderEstimate ? (
                      <TaxRateSliderControl
                        slider={lt.taxSliderEstimate}
                        proposedRate={row.proposedRate ?? lt.taxSliderEstimate.currentRate}
                        currencyCode={COUNTRY_CURRENCY_MAP[countryId]}
                        onChange={(rate) =>
                          updateRow(idx, {
                            proposedRate: rate,
                            policyOptionId: `rate:${rate}`,
                            effectDirection: rate > lt.taxSliderEstimate!.currentRate ? 1 : -1,
                          })
                        }
                      />
                    ) : lt && options.length > 0 ? (
                      <select
                        className="w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground"
                        value={row.policyOptionId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const opt = options.find((o) => o.id === nextId);
                          updateRow(idx, {
                            policyOptionId: nextId,
                            effectDirection: opt?.effectDirection ?? 0,
                            economic: opt?.economic ?? 0,
                            social: opt?.social ?? 0,
                          });
                        }}
                      >
                        <option value="">Select policy option…</option>
                        {options.map((option, optIdx) => {
                          const isBlocked = blockedProvisionKeys.has(
                            `${row.legislationTypeId}:${option.id}`
                          );
                          const isCurrentLevel = currentPolicies[row.legislationTypeId] === optIdx;
                          const disableReason = isCurrentLevel
                            ? " (current law)"
                            : isBlocked
                              ? " (active bill exists)"
                              : "";
                          return (
                            <option
                              key={option.id}
                              value={option.id}
                              disabled={isBlocked || isCurrentLevel}
                            >
                              {option.name}
                              {disableReason}
                            </option>
                          );
                        })}
                      </select>
                    ) : lt ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted">
                          Direction:{" "}
                          {row.effectDirection === -1
                            ? "Left / Reduce"
                            : row.effectDirection === 1
                              ? "Right / Increase"
                              : "Neutral / Center"}
                        </label>
                        <Slider
                          min={-1}
                          max={1}
                          step={1}
                          value={row.effectDirection}
                          onChange={(e) =>
                            updateRow(idx, { effectDirection: Number(e.target.value) })
                          }
                          variant="primary"
                        />
                        <div className="mt-0.5 flex justify-between text-[10px] text-muted">
                          <span>Left / Reduce</span>
                          <span>Neutral</span>
                          <span>Right / Increase</span>
                        </div>
                      </div>
                    ) : null}
                    {lt && (
                      <div className="space-y-1 rounded-lg border border-card-border bg-background/50 p-3">
                        {(() => {
                          // New-gen catalog laws: the law's flavor line always shows,
                          // with the selected level's explanation stacked under it.
                          // Legacy types keep the single winner-takes-all line.
                          const isNewGen = Boolean(lt.politicalMetricTargets?.length);
                          if (isNewGen) {
                            return (
                              <div className="space-y-1">
                                {lt.description && (
                                  <p className="text-xs italic text-muted/80">{lt.description}</p>
                                )}
                                {selectedOption?.explanation && (
                                  <p className="text-xs text-muted">{selectedOption.explanation}</p>
                                )}
                              </div>
                            );
                          }
                          const explanation =
                            selectedOption?.explanation ?? lt.explanation ?? lt.description;
                          return (
                            <>
                              {explanation ? (
                                <p className="text-xs italic text-muted/80">{explanation}</p>
                              ) : null}
                              <MinimumWageFloorNote kaitz={selectedOption?.wageFloorKaitz} />
                            </>
                          );
                        })()}
                        {/* New-gen laws: Current law → Proposed comparison with
                            per-level fiscal estimates + metric deltas vs enacted. */}
                        <LawProvisionComparison
                          countryId={countryId}
                          lt={lt}
                          currentIndex={currentPolicies[row.legislationTypeId]}
                          proposedIndex={options.findIndex((o) => o.id === row.policyOptionId)}
                        />
                        {/* Tax-slider laws skip the archetype panel — approval
                            flows through the metrics/economy channels instead. */}
                        {!lt.taxSliderEstimate && (
                          <PolicyEffectIndicators
                            effectTargetsWeighted={lt.effectTargetsWeighted}
                            effectDirection={row.effectDirection}
                            bucketApprovals={selectedOption?.bucketApprovals}
                            policyDomain={lt.policyDomain}
                            currentPolicyIndex={
                              currentPolicies[row.legislationTypeId] ??
                              ladderBounds(options.length).centerIndex
                            }
                            proposedPolicyIndex={options.findIndex(
                              (o) => o.id === row.policyOptionId
                            )}
                            billCountry={countryId}
                            policyOptions={options}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Bill-level fiscal roll-up across the new-gen provisions. */}
              <BillFiscalImpactStrip
                countryId={countryId}
                rows={rows.map((row) => {
                  const lt = legislationTypes.find((t) => t._id === row.legislationTypeId);
                  return {
                    lt,
                    currentIndex: currentPolicies[row.legislationTypeId],
                    proposedIndex: (lt?.policyOptions ?? []).findIndex(
                      (o) => o.id === row.policyOptionId
                    ),
                  };
                })}
              />
            </div>
          )}
          {canProposeEuro && (
            <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={includeEuroAdoption}
                onChange={(event) => setIncludeEuroAdoption(event.target.checked)}
              />
              Vote to participate in euro adoption
            </label>
          )}
          {/* Central bank independence — economy bills only. */}
          {canDecideTreaty && (
            <EuropeanTreatyProvisionEditor action={treatyAction} onChange={setTreatyAction} />
          )}
          {canReformEconomicSystem && (
            <EconomicSystemReformEditor
              include={includeEconomicReform}
              onIncludeChange={setIncludeEconomicReform}
              target={economicReformTarget}
              onTargetChange={setEconomicReformTarget}
            />
          )}
          {isCentralBankCat && (
            <CentralBankProvisionEditor
              include={includeCbIndependence}
              onIncludeChange={setIncludeCbIndependence}
              action={cbIndependenceAction}
              onActionChange={setCbIndependenceAction}
            />
          )}
          {/* Electoral law — social bills only. Each axis is opt-in on its own:
              a bill touching the franchise must not silently reset the
              registration regime, which is what the server enforces too. */}
          {isElectoralCat && (
            <div className="rounded-lg border border-dashed border-sky-500/35 bg-sky-500/5 p-3 space-y-3">
              <p className="text-xs font-medium text-muted">Electoral law (optional)</p>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeVotingAge}
                    onChange={(e) => updateElectoralLaw("includeVotingAge", e.target.checked)}
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
                      updateElectoralLaw("votingAge", Number((e.target as HTMLInputElement).value))
                    }
                    className="flex-1 accent-sky-500 disabled:opacity-40"
                  />
                  <span className="min-w-[48px] rounded-md border border-card-border bg-card-elevated px-2 py-1 text-right font-mono text-xs">
                    {votingAge}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeRegAccess}
                    onChange={(e) => updateElectoralLaw("includeRegAccess", e.target.checked)}
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
                      updateElectoralLaw(
                        "registrationAccess",
                        Number((e.target as HTMLInputElement).value)
                      )
                    }
                    className="flex-1 accent-sky-500 disabled:opacity-40"
                  />
                  <span className="min-w-[48px] rounded-md border border-card-border bg-card-elevated px-2 py-1 text-right font-mono text-xs">
                    {registrationAccess}
                  </span>
                </div>
              </div>
              {canProposeJapanShugiinReform && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/30 p-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeJapanShugiinReform}
                    onChange={(event) =>
                      updateElectoralLaw("includeJapanShugiinReform", event.target.checked)
                    }
                    className="mt-0.5 rounded"
                  />
                  <span>
                    Propose Japan&apos;s 1994 Shūgiin transition: 300 single-member districts and
                    200 regional party-list seats. Sitting members keep their mandates until a later
                    election.
                  </span>
                </label>
              )}
              <p className="text-[11px] italic text-muted/60">
                {!includeVotingAge && !includeRegAccess && !includeJapanShugiinReform
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
                      includeJapanShugiinReform ? "Japan Shugiin reform requires passage." : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
              </p>
            </div>
          )}
          {submitBlockedByActiveBill && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              You already have a bill being voted on — it must resolve before you can propose
              another.
            </div>
          )}
          <div className="rounded-lg border border-card-border bg-card/50 px-3 py-2 text-xs text-muted">
            {adminOverride ? (
              <span>Cost waived (admin).</span>
            ) : (
              <span>
                Cost: {BILL_PROPOSE_ACTION_COST} actions + {npiCost} national influence
              </span>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-card-border bg-card py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Proposing…" : "Propose bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
