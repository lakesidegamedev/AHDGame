"use client";
import { resolveCreditStanding } from "@/lib/corporations/creditStanding";
import type { ReactNode } from "react";
import type { CorporationDetailPageViewContext } from "./page";

import Link from "next/link";
import { ContractOpportunityBanner } from "@/components/governmentContracts/ContractOpportunityBanner";

import BackButton from "@/components/BackButton";

import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { CorporationMasthead } from "@/components/corporation/CorporationMasthead";
import { ParentDirectionNote } from "@/components/corporation/ParentDirectionNote";

import { HostileTakeoverCard } from "@/components/corporation/HostileTakeoverCard";
import { SubsidiaryManagementCard } from "@/components/corporation/SubsidiaryManagementCard";
import { PrivatizationVotePanel } from "@/components/corporation/PrivatizationVotePanel";
import { ManagePrivateShareholdersPanel } from "@/components/corporation/ManagePrivateShareholdersPanel";
import IndexCommitteePanel from "@/components/corporation/IndexCommitteePanel";
import { NationalizationStatusCard } from "@/components/corporation/NationalizationStatusCard";
import { CorpLedgerProvider } from "@/components/corporation/ledger/LedgerContext";
import { SwitchToCeoCharacterNotice } from "@/components/corporation/SwitchToCeoCharacterNotice";
import { NoticeStrip } from "@/components/corporation/ledger/NoticeStrip";

import BondMaturityNotice from "@/components/corporation/BondMaturityNotice";
import PrivateNotListedNotice from "@/components/corporation/PrivateNotListedNotice";

import { getLegalStructureForCorp } from "@/lib/corporations/legalStructure";

import { SuperTabNav } from "@/components/nav/SuperTabNav";
import {
  CORP_LEGACY_TAB_MAP,
  corpTabIdFor,
  isCeoOfficeBlocked,
} from "@/components/corporation/CorporationTabGroups";

import { AutopilotCard } from "@/components/corporation/AutopilotCard";
import {
  corpIncomeBasis,
  scaleToPeriod,
} from "@/components/corporation/financials/financialsModel";
import {
  SectorsTab,
  SharesTab,
  CreditRatingTab,
  BondsTab,
  ChartsTab,
  SnapshotTab,
  CeoOfficeTab,
  OverviewTab,
  TechTab,
  CommoditiesTab,
  SupplyChainTab,
  DealsTab,
  CorporationContractsTab,
  DefenceContractsTab,
  SupplyAgreementsSection,
  DefaultedBondCrisisModal,
} from "@/components/corporation/CorporationPageTabs";
import { EditorialStancePanel } from "@/components/corporation/EditorialStancePanel";

export function renderCorporationDetailPageView(
  context: CorporationDetailPageViewContext
): ReactNode {
  const {
    AdvertisingAgreementsPanel,
    BankConsoleTab,
    FinancialsTab,
    LegacyProductProjects,
    PrivateSalePanel,
    ProductStudio,
    SponsoredFundPanel,
    abandoningSectorId,
    activeTab,
    balanceSheet,
    bondDefaultModalOpen,
    bondInfo,
    bondInfoFailed,
    canTrade,
    cancelTransitionSectorId,
    ceo,
    ceoIsInactive,
    corpIsPrivate,
    corporation,
    defenceContracts,
    enableModView,
    error,
    exchange,
    exchangeLabel,
    fetchBondInfo,
    fetchCorporation,
    fetchViewerContext,
    financialFogOfWar,
    financials,
    growthUpdatingSectorId,
    handleAbandonSector,
    handleAcceptCeo,
    handleCancelTransition,
    handleDeclineCeo,
    handleGrowthChange,
    handleSectorMothball,
    handleSectorStrategyChange,
    id,
    isAdmin,
    isCeo,
    isDefenceCorp,
    isExtractionCorp,
    isModerator,
    isPendingCeo,
    modViewEnabled,
    modViewLoading,
    mothballingSectorIds,
    myAutoConvertEnabled,
    myCashOnHand,
    myCharacterId,
    myCorporation,
    myCurrencyBalances,
    myHomeCurrency,
    nationalizationStatus,
    navTabs,
    navbarRootRef,
    openTrade,
    openVotes,
    pathname,
    periodView,
    router,
    searchParams,
    sectors,
    sectorsMessage,
    setBondDefaultModalOpen,
    setMyAutoConvertEnabled,
    setPeriodView,
    setTab,
    showSupplyAgreements,
    showToast,
    strategyUpdatingSectorId,
    visibleTabs,
  } = context;

  return (
    <div className="min-h-screen bg-background pb-16" data-replay-block>
      <CorpLedgerProvider>
        {/* overflow-x-clip, not hidden: hidden makes a scroll container and stops the
          sticky tab bar from sticking. */}
        <main
          ref={navbarRootRef}
          className="mx-auto max-w-7xl space-y-6 overflow-x-clip px-4 py-6 sm:px-6"
        >
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
            {corporation.isPrivate ? (
              <span>Private corporation</span>
            ) : (
              <>
                <Link
                  href={`/stockmarket/${exchange}?tab=stocks`}
                  className="hover:text-foreground transition-colors"
                >
                  {exchangeLabel}
                </Link>
                <span aria-hidden>/</span>
                <Link
                  href={`/stockmarket/${exchange}?tab=stocks`}
                  className="hover:text-foreground transition-colors"
                >
                  Corporations
                </Link>
              </>
            )}
            <span aria-hidden>/</span>
            <span className="text-foreground font-medium truncate">{corporation.name}</span>
          </nav>

          <CorporationMasthead
            corporation={corporation}
            ceo={ceo}
            isCeo={isCeo}
            corpId={id}
            exchangeLabel={exchangeLabel}
            bookValuePerShare={
              balanceSheet && corporation.totalShares > 0
                ? balanceSheet.equity.bookValue / corporation.totalShares
                : null
            }
            creditRating={
              resolveCreditStanding(corporation, bondInfo?.creditRating).rating ?? undefined
            }
            // Retained income after dividends, from the shared basis. Realized figures are already net of payout, so netting `dividendDistribution` again shows a loss on a profitable corp.
            retainedDaily={financials != null ? corpIncomeBasis(financials).retained : null}
            revenueGrowth={
              financials != null
                ? {
                    pct: financials.currentGrowthRate,
                    realized: financials.growthRateIsRealized === true,
                  }
                : null
            }
            netIncomeDaily={financials != null ? corpIncomeBasis(financials).netIncome : null}
            effectiveDividendRate={
              financials?.dividendPolicyRate ?? financials?.effectiveDividendRate ?? null
            }
            periodView={periodView}
            financialFogOfWar={financialFogOfWar}
            ceoIsInactive={ceoIsInactive}
            onRefresh={fetchCorporation}
            onTrade={canTrade ? openTrade : undefined}
            showBanner
          />

          {corporation.canDirectAsParent && corporation.parentCorporation && (
            <ParentDirectionNote
              corpId={id}
              parent={corporation.parentCorporation}
              onRefresh={fetchCorporation}
            />
          )}

          {isCeo &&
            activeTab === "overview" &&
            corporation.countryId &&
            (isDefenceCorp ||
              (corporation.type === "extraction" && corporation.contractIssuanceEnabled)) && (
              <ContractOpportunityBanner
                corporationId={corporation._id}
                countryId={corporation.countryId}
                type={
                  isDefenceCorp && corporation.type === "extraction"
                    ? "all"
                    : isDefenceCorp
                      ? "defence"
                      : "extraction"
                }
              />
            )}

          <NationalizationStatusCard
            corpId={id}
            status={nationalizationStatus}
            hasExposure={
              isCeo ||
              corporation.shareholders?.some(
                (holder) =>
                  (!!myCharacterId && holder.characterId === myCharacterId) ||
                  (!!myCorporation?.id && holder.corporationId === myCorporation.id)
              ) === true
            }
          />

          {/* Bond principal is repaid in one lump on the maturity turn, and that
            debit is inside the same negative-liquid-capital test that declares a
            default. Players read the coupon as the whole cost of borrowing, so
            the notice lives here, above the tabs, rather than on the Bonds tab
            nobody opens between issuing a bond and being charged for it. */}
          <BondMaturityNotice
            bondInfo={bondInfo}
            liquidCurrencyCode={corporation.liquidCurrencyCode}
            liquidCapital={corporation.liquidCapital}
            // The detail payload has the latest realized turn, not a retained earnings average.
            recentRetainedEarningsPerTurn={
              financials &&
              typeof financials.realizedIncome === "number" &&
              Number.isFinite(financials.realizedIncome)
                ? scaleToPeriod(corpIncomeBasis(financials).retained, "turn")
                : null
            }
            corporationName={corporation.name}
            corporationId={corporation._id ?? id}
          />

          {/* Ticket #1153: a private corporation is deliberately excluded from
            every exchange snapshot, but nothing said so, so its owner read the
            absence as a listing that had failed and waited turns for it. Say it
            on the page they are already looking at, and say what changes it.
            Dismissable per corp — once the owner knows, it never nags again. */}
          {corporation.isPrivate && isCeo && (
            <PrivateNotListedNotice
              corporationId={corporation._id ?? id}
              corporationName={corporation.name}
            />
          )}

          {!isCeo &&
            corporation.viewerAccountRunsCorporation &&
            ceo?.characterId &&
            !ceo.isNpp &&
            !ceo.isImperial && (
              <SwitchToCeoCharacterNotice characterId={ceo.characterId} characterName={ceo.name} />
            )}

          {corporation.isPrivate && !isCeo && (isModerator || isAdmin) && (
            <NoticeStrip
              tone="info"
              tag="Moderator"
              action={
                modViewEnabled ? (
                  <span className="text-xs font-medium text-info">Mod view active</span>
                ) : (
                  <button
                    type="button"
                    onClick={enableModView}
                    disabled={modViewLoading}
                    className="inline-flex h-7 items-center rounded-[calc(var(--corp-rad)-2px)] border border-card-border px-2.5 text-xs font-medium text-foreground hover:bg-card-elevated disabled:opacity-50"
                  >
                    {modViewLoading ? "Enabling" : "Mod view"}
                  </button>
                )
              }
            >
              <span className="font-medium text-foreground">Moderator view.</span>{" "}
              <span className="text-muted">
                Unlock this private corporation&apos;s financial screens read-only. Each unlock is
                written to the moderator audit log.
              </span>
            </NoticeStrip>
          )}

          {corporation.isPrivate &&
            corporation.countryId &&
            (() => {
              // Surface the private-share invitation flow for close-corp legal
              // structures (e.g. S-Corp, capped at 100). Hidden for CEO-only
              // private structures and for public corps.
              const legalStructure = getLegalStructureForCorp({
                countryId:
                  corporation.countryId as import("@/lib/constants/countriesCore").CountryId,
                legalStructure: corporation.legalStructure as
                  import("@/lib/constants/legalStructures").LegalStructureId | undefined,
                isPrivate: corporation.isPrivate === true,
              });
              const cap = legalStructure.maxShareholders ?? 1;
              if (cap <= 1) return null;
              const currentCount = (corporation.shareholders ?? []).filter(
                (sh) => (sh.shares ?? 0) > 0
              ).length;
              return (
                <ManagePrivateShareholdersPanel
                  corporationId={corporation._id}
                  corporationName={corporation.name}
                  isCeo={isCeo}
                  maxShareholders={cap}
                  currentShareholderCount={currentCount}
                  viewerCharacterId={myCharacterId}
                  onChange={() => fetchCorporation()}
                />
              );
            })()}

          {/* Private-sale listings, buyer view. The shares tab is hidden from
            non-CEO viewers of a private corp (tab guards above), so without
            this panel a prospective buyer could never see open listings or
            submit an offer and the seller would never get one. CEO-only
            controls stay on the shares tab; the panel's seller actions are
            scoped to the viewer's own listings server-side (isMySelling). */}
          {corporation.isPrivate && !isCeo && myCharacterId && (
            <section className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-border pb-1.5">
                <h2 className="text-sm font-semibold text-foreground">Private sale</h2>
                <p className="text-xs text-muted">
                  Open listings from current owners. An offer escrows the funds until the seller
                  accepts.
                </p>
              </div>
              <PrivateSalePanel
                corporation={corporation}
                myCharacterId={myCharacterId}
                myCorporation={myCorporation}
                corpId={id}
                myShares={
                  corporation.shareholders.find((sh) => sh.characterId === myCharacterId)?.shares ??
                  0
                }
                onToast={showToast}
                forceOpen
              />
            </section>
          )}

          {corporation.openPrivatizationVoteId && (
            <PrivatizationVotePanel
              corporationId={corporation._id}
              voteId={corporation.openPrivatizationVoteId}
              isCeo={isCeo}
              viewerCharacterId={myCharacterId}
              viewerHoldsShares={
                !!myCharacterId &&
                corporation.shareholders.some(
                  (s) => s.characterId === myCharacterId && s.shares > 0
                )
              }
              currentTurn={corporation.currentTurn ?? 0}
              onResolved={() => fetchCorporation()}
            />
          )}

          {corporation.hostileTakeoverEligibility && (
            <HostileTakeoverCard
              corporation={corporation}
              parentCorporationId={corporation.hostileTakeoverEligibility.parentCorporationId}
              ownershipPct={corporation.hostileTakeoverEligibility.ownershipPct}
              outstandingBonds={corporation.hostileTakeoverEligibility.outstandingBonds}
              outstandingBondDebt={corporation.hostileTakeoverEligibility.outstandingBondDebt}
              parentLiquidCapital={corporation.hostileTakeoverEligibility.parentLiquidCapital}
              parentLiquidCurrencyCode={
                corporation.hostileTakeoverEligibility.parentLiquidCurrencyCode
              }
              onMerged={() => {
                const pid = corporation.hostileTakeoverEligibility?.parentCorporationId;
                if (pid) {
                  router.push(`/corporation/${pid}`);
                } else {
                  fetchCorporation();
                }
              }}
              onBondPayoff={() => {
                fetchCorporation();
              }}
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}

          {isCeo &&
            !corporation.countryOwnerId &&
            bondInfo?.bonds?.some((b) => b.defaulted) &&
            !bondDefaultModalOpen && (
              <NoticeStrip
                tone="error"
                tag="Bond default"
                action={
                  <button
                    type="button"
                    onClick={() => setBondDefaultModalOpen(true)}
                    className="inline-flex h-7 shrink-0 items-center rounded-[calc(var(--corp-rad)-2px)] border border-error bg-error px-2.5 text-xs font-medium text-background hover:bg-error/90"
                  >
                    Open resolution
                  </button>
                }
              >
                <span className="font-semibold text-error">Bond default.</span> Pay, refinance or
                dissolve from the resolution panel.
              </NoticeStrip>
            )}

          {isPendingCeo && (
            <NoticeStrip
              tone="warning"
              tag="CEO offer"
              action={
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleAcceptCeo}
                    className="inline-flex h-7 items-center rounded-[calc(var(--corp-rad)-2px)] border border-success bg-success px-2.5 text-xs font-medium text-background hover:bg-success/90"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={handleDeclineCeo}
                    className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-xs font-medium text-muted hover:text-foreground"
                  >
                    Decline
                  </button>
                </div>
              }
            >
              <span className="font-semibold text-warning">
                You have been offered the CEO seat at {corporation.name}.
              </span>{" "}
              <span className="text-muted">
                Shareholders voted you their first choice. You can hold one CEO seat at a time.
              </span>
            </NoticeStrip>
          )}

          {!!myCharacterId && isCeoOfficeBlocked(searchParams.get("tab"), isCeo) && (
            <NoticeStrip tone="warning" tag="CEO Office">
              <span className="text-muted">
                The CEO Office is only open to this corporation&apos;s CEO.
              </span>
            </NoticeStrip>
          )}

          {/* Grouped two-level tabs — the shared nav the state/region page uses.
            Twelve-plus top-level tabs used to overflow into a sideways-scrolling
            row; they are now five groups, each with its own sub-tab row. */}
          <SuperTabNav
            tabs={navTabs}
            legacyMap={CORP_LEGACY_TAB_MAP}
            defaultSuperId="overview"
            variant="folder"
            sticky
            renderContent={(superId, subId) => {
              if (superId === "bank") {
                return (
                  <BankConsoleTab
                    corporationId={id}
                    isCeo={isCeo}
                    liquidCurrencyCode={corporation.liquidCurrencyCode}
                    countryId={corporation.countryId}
                  />
                );
              }
              const tab = corpTabIdFor(visibleTabs, superId, subId) ?? "overview";
              return (
                <div className="space-y-8">
                  {tab === "overview" && (
                    <div className="space-y-6">
                      {isCeo && (
                        <AutopilotCard
                          corporation={corporation}
                          corpId={id}
                          onTabChange={setTab}
                          onRefresh={fetchCorporation}
                        />
                      )}
                      <OverviewTab
                        corporation={corporation}
                        financials={financials}
                        balanceSheet={balanceSheet}
                        bondInfo={bondInfo}
                        bondInfoFailed={bondInfoFailed}
                        onRetryBondInfo={() => void fetchBondInfo({ force: true })}
                        sectors={sectors}
                        corpId={id}
                        periodView={periodView}
                        onPeriodViewChange={setPeriodView}
                        onTabChange={setTab}
                        financialFogOfWar={financialFogOfWar}
                        isCeo={isCeo}
                        myCharacterId={myCharacterId}
                        openVotes={openVotes}
                        onTrade={canTrade ? openTrade : undefined}
                      />
                      {corporation.mediaEditorialEnabled === true &&
                        (corporation.type === "media" ||
                          corporation.secondaryType === "media" ||
                          sectors.some((sector) => sector.sectorType === "media")) && (
                          <EditorialStancePanel
                            corporationId={id}
                            stance={corporation.editorialStance}
                            isCeo={corporation.canEditEditorialStance === true}
                            onSaved={() => void fetchCorporation()}
                          />
                        )}
                    </div>
                  )}

                  {tab === "financials" && financials && (
                    <FinancialsTab
                      corporation={corporation}
                      financials={financials}
                      balanceSheet={balanceSheet}
                      bondInfo={bondInfo}
                      corpId={id}
                      periodView={periodView}
                      onPeriodViewChange={setPeriodView}
                      sectors={sectors}
                      financialFogOfWar={financialFogOfWar}
                    />
                  )}

                  {tab === "sectors" && (
                    <div className="space-y-6">
                      {isCeo && (
                        <LegacyProductProjects
                          corporationId={id}
                          currencyCode={corporation.liquidCurrencyCode}
                        />
                      )}
                      <ProductStudio corporationId={id} onUpdate={fetchCorporation} />
                      {isCeo && corporation.mediaOperatingModelsEnabled === true && (
                        <AdvertisingAgreementsPanel
                          corpId={id}
                          ownsMediaSector={sectors.some((sector) => sector.sectorType === "media")}
                        />
                      )}
                      <SectorsTab
                        sectors={sectors}
                        isCeo={isCeo}
                        corpId={id}
                        corporationType={corporation.type}
                        corporationSecondaryType={corporation.secondaryType}
                        liquidCapital={corporation.liquidCapital}
                        liquidCurrencyCode={corporation.liquidCurrencyCode}
                        countryId={corporation.countryId}
                        logisticsStrength={corporation.logisticsStrength}
                        onAbandonSector={handleAbandonSector}
                        abandoningSectorId={abandoningSectorId}
                        onMothballSector={handleSectorMothball}
                        mothballingSectorIds={mothballingSectorIds}
                        sectorsMessage={sectorsMessage}
                        onStrategyChange={handleSectorStrategyChange}
                        canChangeStrategy={isCeo || !!corporation.canDirectAsParent}
                        strategyUpdatingSectorId={strategyUpdatingSectorId}
                        onCancelTransition={handleCancelTransition}
                        cancelTransitionSectorId={cancelTransitionSectorId}
                        onGrowthChange={handleGrowthChange}
                        growthUpdatingSectorId={growthUpdatingSectorId}
                        currentTurn={corporation?.currentTurn ?? 0}
                        periodView={periodView}
                        onPeriodViewChange={setPeriodView}
                        plantsMode={corporation.plantsMode === true}
                        mediaOperatingModelsEnabled={
                          corporation.mediaOperatingModelsEnabled === true
                        }
                        canSplitRivalPlants={
                          !!myCharacterId && !isCeo && corporation.isStateOwned !== true
                        }
                        expandOnMount={searchParams.get("expand") === "1"}
                        expandSectorType={OPERATING_SECTOR_TYPES.find(
                          (t) => t === searchParams.get("sectorType")
                        )}
                        expandStateId={searchParams.get("state") ?? undefined}
                        onExpandDeepLinkConsumed={() => {
                          const p = new URLSearchParams(searchParams.toString());
                          p.delete("expand");
                          p.delete("state");
                          p.delete("sectorType");
                          const qs = p.toString();
                          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                        }}
                      />
                    </div>
                  )}

                  {tab === "supply-chain" && (
                    <SupplyChainTab corpId={id} modViewEnabled={modViewEnabled} />
                  )}

                  {tab === "commodities" && (
                    <div className="space-y-6">
                      <CommoditiesTab corpId={id} isCeo={isCeo} modViewEnabled={modViewEnabled} />
                      {showSupplyAgreements && (
                        <SupplyAgreementsSection
                          corpId={corporation._id}
                          countryId={corporation.countryId}
                        />
                      )}
                    </div>
                  )}

                  {/* Render-time guard, not just the tab-reset effect above: a ?tab=shares
            deep link on a private corp mounts SharesTab on the FIRST render with
            the redacted payload (totalShares etc. stripped for non-CEO viewers)
            and crashes before the effect can fall back. */}
                  {tab === "shares" &&
                    !(corpIsPrivate && !isCeo && !corporation.viewerIsShareholder) && (
                      <SharesTab
                        corporation={corporation}
                        myCharacterId={myCharacterId}
                        myCashOnHand={myCashOnHand}
                        myCurrencyBalances={myCurrencyBalances}
                        myHomeCurrency={myHomeCurrency}
                        autoConvertEnabled={myAutoConvertEnabled}
                        onAutoConvertChange={setMyAutoConvertEnabled}
                        isCeo={isCeo}
                        myCorporation={myCorporation}
                        corpId={id}
                        onRefresh={() => {
                          void fetchCorporation();
                          void fetchViewerContext();
                        }}
                      />
                    )}

                  {tab === "credit" &&
                    (() => {
                      const creditPanel = (
                        <CreditRatingTab
                          bondInfo={bondInfo}
                          bondLoading={!bondInfo && !bondInfoFailed && tab === "credit"}
                          corporation={corporation}
                          corpId={id}
                          modViewEnabled={modViewEnabled}
                          bondsAbove={isCeo}
                        />
                      );
                      const bondsPanel = financials ? (
                        <div id="corp-bonds" className="scroll-mt-24">
                          <BondsTab
                            bondInfo={bondInfo}
                            bondLoading={!bondInfo && !bondInfoFailed && tab === "credit"}
                            corpId={id}
                            corporation={corporation}
                            financials={financials}
                            onRefresh={() => {
                              void fetchBondInfo({ force: true });
                              void fetchCorporation();
                            }}
                          />
                        </div>
                      ) : null;

                      // The CEO is the only one who can issue bonds, so lead with the
                      // interactable issuance controls for them; everyone else sees the
                      // credit-rating readout first.
                      const panels = (
                        isCeo ? [bondsPanel, creditPanel] : [creditPanel, bondsPanel]
                      ).filter(Boolean);

                      return (
                        <div className="space-y-8">
                          {panels.map((panel, i) => (
                            <div key={i}>{panel}</div>
                          ))}
                        </div>
                      );
                    })()}

                  {tab === "charts" && (
                    <ChartsTab
                      corpId={id}
                      modViewEnabled={modViewEnabled}
                      ownerView={
                        isCeo || modViewEnabled || !!corporation.viewerIsControllingParentCeo
                      }
                    />
                  )}

                  {tab === "snapshot" && (
                    <SnapshotTab corpId={id} modViewEnabled={modViewEnabled} />
                  )}

                  {tab === "tech" && corporation.techTreesEnabled && (
                    <TechTab corporationId={id} isCeo={isCeo} />
                  )}

                  {tab === "contracts" && isExtractionCorp && (
                    <CorporationContractsTab
                      corpId={id}
                      isCeo={isCeo}
                      countryId={corporation.countryId}
                    />
                  )}

                  {tab === "defence" && isDefenceCorp && (
                    <DefenceContractsTab
                      countryId={corporation.countryId}
                      corpId={id}
                      defence={defenceContracts ?? undefined}
                      isCeo={isCeo}
                      onUpdate={fetchCorporation}
                    />
                  )}

                  {tab === "deals" && corporation.canManageAcquisitions && (
                    <DealsTab
                      corpId={id}
                      isCeo={isCeo}
                      liquidCapital={corporation.liquidCapital}
                      liquidCurrencyCode={corporation.liquidCurrencyCode}
                      countryId={corporation.countryId}
                    />
                  )}

                  {tab === "structure" && (
                    <div className="space-y-6">
                      <SubsidiaryManagementCard
                        corporation={corporation}
                        sectorOptions={Object.entries(
                          sectors.reduce<Record<string, number>>((acc, sec) => {
                            acc[sec.sectorType] = (acc[sec.sectorType] ?? 0) + 1;
                            return acc;
                          }, {})
                        ).map(([type, count]) => ({ type, count }))}
                        onChanged={() => fetchCorporation()}
                      />
                    </div>
                  )}

                  {tab === "ceo" && isCeo && financials && (
                    <div className="space-y-6">
                      <IndexCommitteePanel
                        corpId={id}
                        liquidCurrencyCode={corporation.liquidCurrencyCode}
                        countryId={corporation.countryId}
                      />
                      <SponsoredFundPanel
                        corpId={id}
                        liquidCurrencyCode={corporation.liquidCurrencyCode}
                        countryId={corporation.countryId}
                      />
                      <CeoOfficeTab
                        corporation={corporation}
                        financials={financials}
                        sectors={sectors}
                        corpId={id}
                        currentTurn={corporation.currentTurn ?? 0}
                        onRefresh={fetchCorporation}
                        myCashOnHand={myCashOnHand}
                        myCurrencyBalances={myCurrencyBalances}
                      />
                    </div>
                  )}
                </div>
              );
            }}
          />

          <BackButton />

          {isCeo && !corporation.countryOwnerId && (
            <DefaultedBondCrisisModal
              corpId={id}
              open={bondDefaultModalOpen}
              onClose={() => setBondDefaultModalOpen(false)}
              onResolved={() => {
                void fetchBondInfo({ force: true });
                void fetchCorporation();
              }}
            />
          )}
        </main>
      </CorpLedgerProvider>
    </div>
  );
}
