"use client";
import { useState, useEffect, useMemo, type ReactNode } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getMessageStyle } from "@/lib/utils/formatters";
import { CardSkeleton, Skeleton } from "@/components/ui";
import { PartyLogo } from "@/components/PartyLogo";

import { AgendaBannerWithEdit } from "@/components/party-hub/AgendaBannerWithEdit";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";

import { partyUrl, regionPartyApiUrl, regionPartyUrl, regionUrl } from "@/lib/urls";

import {
  PARTY_PAGE_TITLE_CLASS,
  PARTY_VALUE_CLASS,
  PartyStat,
  PartyStatsRow,
  PartySwatch,
  partyTabClass,
  regimeStatusLabel,
} from "@/components/party/partyPageStyles";
import { getStateLeanLabel } from "@/lib/utils/politics";

import { UK_REGIONS } from "@/lib/constants/uk";
import {
  STATE_PS_CAP_DEFAULT,
  STATE_PASSIVE_PS_PER_TURN,
} from "@/lib/politicalStrength/strengthConstants";

import { PartyPageSkeleton } from "@/app/country/[code]/parties/[id]/PartyPageSkeleton";

import { resolveScopeSwitcherRegionId } from "@/app/country/[code]/parties/[id]/resolveScopeSwitcherRegion";
import { useStatePartyData } from "@/app/country/[code]/region/[id]/party/[partyId]/components/useStatePartyData";
import { useStatePartyTreasuryActions } from "@/app/country/[code]/region/[id]/party/[partyId]/components/useStatePartyTreasuryActions";
import {
  getOrgLabel,
  fmt as stateFmt,
} from "@/app/country/[code]/region/[id]/party/[partyId]/components/helpers";
import type { MainTab as StateMainTab } from "@/app/country/[code]/region/[id]/party/[partyId]/components/types";
import type { StatePartyAnalyticsPayload } from "@/lib/partyAnalytics";

import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

export type PartyHubScope =
  | { kind: "national"; countryCode: string; partyId: string }
  | {
      kind: "state";
      countryCode: string;
      partyId: string;
      stateId: string;
      regionId: string;
    };

export // The state-scope body is the only path that pulls the office-title table and
// every country's cabinet positions in, and the national hub never renders it.
// It loads on demand for the state hub, behind a card skeleton so the panel
// below the tab bar keeps its height.
const StatePartyHubBody = dynamic(
  () =>
    import("../../region/[id]/party/[partyId]/components/StatePartyHubBody").then((m) => ({
      default: m.StatePartyHubBody,
    })),
  {
    loading: () => (
      <CardSkeleton className="min-h-[320px] space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardSkeleton>
    ),
  }
);

export interface ScopeSwitcherProps {
  scope: PartyHubScope;
  countryCode: string;
  partyId: string;
  regionId: string | null;
  regionLabel: string;
}

export function ScopeSwitcher({
  scope,
  countryCode,
  partyId,
  regionId,
  regionLabel,
}: ScopeSwitcherProps) {
  const nationalHref = partyUrl(countryCode, partyId);
  const regionHref = regionId ? regionPartyUrl(countryCode, regionId, partyId) : null;
  const isNational = scope.kind === "national";

  return (
    <div className="mt-4 inline-flex rounded-lg border border-card-border p-1">
      <Link
        href={nationalHref}
        aria-current={isNational ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
          isNational ? "bg-card-elevated text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        National
      </Link>
      {regionHref ? (
        <Link
          href={regionHref}
          aria-current={!isNational ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
            !isNational ? "bg-card-elevated text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {regionLabel}
        </Link>
      ) : (
        <span className="cursor-not-allowed rounded-md px-3 py-1.5 text-body-sm font-medium text-muted/50">
          {regionLabel}
        </span>
      )}
    </div>
  );
}

export interface PartyHubChromeProps {
  scope: PartyHubScope;
  countryCode: string;
  partyId: string;
  switcherRegionId: string | null;
  switcherRegionLabel: string;
  breadcrumb?: ReactNode;
  backLink?: ReactNode;
  /** Plain words after the abbreviation, naming which office this hub is. */
  headerContext: string;
  title: string;
  partyColor: string;
  partyAbbreviation: string;
  logoPartyId: string;
  logoUrl?: string | null;
  countryId: CountryId | string;
  regimeStatus?: "ruling" | "approved" | "banned" | null;
  /** Extra plain words for the identity line, such as the party tier. */
  tierLabel?: string | null;
  headerExtra?: ReactNode;
  headerActions?: ReactNode;
  modViewBanner?: ReactNode;
  statsStrip: ReactNode;
  msg: string;
  defunctBanner?: ReactNode;
  agendaBanner: ReactNode;
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}

export function PartyHubChrome({
  scope,
  countryCode,
  partyId,
  switcherRegionId,
  switcherRegionLabel,
  breadcrumb,
  backLink,
  headerContext,
  title,
  partyColor,
  partyAbbreviation,
  logoPartyId,
  logoUrl,
  countryId,
  regimeStatus,
  tierLabel,
  headerExtra,
  headerActions,
  modViewBanner,
  statsStrip,
  msg,
  defunctBanner,
  agendaBanner,
  tabs,
  activeTab,
  onTabChange,
  children,
}: PartyHubChromeProps) {
  const regimeLabel = regimeStatusLabel(regimeStatus);

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        {breadcrumb}
        {backLink}

        <header className="mb-10 overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="px-4 py-6 sm:px-7 sm:py-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <PartyLogo
                  partyId={logoPartyId}
                  partyColor={partyColor}
                  logoUrl={logoUrl}
                  size="h-16 w-16"
                  className="shrink-0"
                  countryId={countryId as CountryId}
                />
                <div className="min-w-0">
                  <h1 className={PARTY_PAGE_TITLE_CLASS}>{title}</h1>
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body text-muted">
                    <PartySwatch color={partyColor} />
                    <span className="font-medium text-foreground">{partyAbbreviation}</span>
                    <span aria-hidden>·</span>
                    <span>{headerContext}</span>
                    {regimeLabel ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          <span className="sr-only">Regime status: </span>
                          {regimeLabel}
                        </span>
                      </>
                    ) : null}
                    {tierLabel ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{tierLabel}</span>
                      </>
                    ) : null}
                  </p>
                  <ScopeSwitcher
                    scope={scope}
                    countryCode={countryCode}
                    partyId={partyId}
                    regionId={switcherRegionId}
                    regionLabel={switcherRegionLabel}
                  />
                  {headerExtra}
                </div>
              </div>
              {headerActions ? (
                <div className="flex shrink-0 items-center gap-3">{headerActions}</div>
              ) : null}
            </div>
          </div>
          {modViewBanner}
          {statsStrip}
          {/* Scrolls sideways when the tabs outrun the width; visible scrollbar
              plus the faded right edge make off-screen tabs discoverable. */}
          <nav
            aria-label="Party sections"
            className="flex gap-6 overflow-x-auto border-t border-card-border px-4 [mask-image:linear-gradient(to_right,black_calc(100%_-_2.5rem),transparent)] after:block after:w-6 after:shrink-0 after:content-[''] sm:px-7"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-pressed={activeTab === t.id}
                className={partyTabClass(activeTab === t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {msg ? (
          <div className={`mb-4 rounded-lg p-3 text-sm ${getMessageStyle(msg)}`}>{msg}</div>
        ) : null}
        {defunctBanner}
        <div className="mb-8 empty:hidden">{agendaBanner}</div>

        {children}
      </main>
    </div>
  );
}

export function StatePartyHub({ scope }: { scope: Extract<PartyHubScope, { kind: "state" }> }) {
  const { countryCode: code, partyId, regionId } = scope;
  const countryCode = code.toUpperCase();
  const stateId = scope.stateId.toUpperCase();
  const searchParams = useSearchParams();

  const {
    user,
    stateParty,
    currentTurn,
    loading,
    loadError,
    fetchUser,
    fetchStateParty,
    taxRate,
    setTaxRate,
    gotvPercent,
    setGotvPercent,
    gotvCategory,
    setGotvCategory,
    gotvGroup,
    setGotvGroup,
    suppressionPercent,
    setSuppressionPercent,
    suppressionCategory,
    setSuppressionCategory,
    suppressionGroup,
    setSuppressionGroup,
    transferReserveAmount,
    setTransferReserveAmount,
    memberSupportReserveAmount,
    setMemberSupportReserveAmount,
    nppRecruitmentReserveAmount,
    setNppRecruitmentReserveAmount,
    treasuryPreset,
    setTreasuryPreset,
    psInvestmentBudget,
    setPsInvestmentBudget,
  } = useStatePartyData(countryCode, stateId, partyId);

  const [activeTab, setActiveTab] = useState<StateMainTab>("overview");
  const [nppSubtab, setNppSubtab] = useState<"recruitment" | "management">("recruitment");
  const [actionMessage, setMsg] = useState("");
  const msg = loadError
    ? "✗ Could not load state party data. Check your connection and refresh."
    : actionMessage;
  const [analyticsData, setAnalyticsData] = useState<StatePartyAnalyticsPayload | null>(null);

  const treasury = useStatePartyTreasuryActions({
    countryCode,
    stateId,
    partyId,
    countryId: stateParty?.countryId,
    taxRate,
    gotvPercent,
    gotvCategory,
    gotvGroup,
    suppressionPercent,
    suppressionCategory,
    suppressionGroup,
    transferReserveAmount,
    memberSupportReserveAmount,
    nppRecruitmentReserveAmount,
    treasuryPreset,
    psInvestmentBudget,
    fetchStateParty,
    fetchUser,
    setMsg,
  });

  const hasCharEarly = !!user?.character?.id;
  const isChairEarly =
    hasCharEarly && !!stateParty?.chair?.id && stateParty.chair.id === user?.character?.id;
  const isViceChairEarly =
    hasCharEarly && !!stateParty?.viceChair?.id && stateParty.viceChair.id === user?.character?.id;
  const isNatChairEarly =
    hasCharEarly &&
    !!stateParty?.nationalChairId &&
    stateParty.nationalChairId === user?.character?.id;
  const isNatViceChairEarly =
    hasCharEarly &&
    !!stateParty?.nationalViceChairId &&
    stateParty.nationalViceChairId === user?.character?.id;
  const isMemberEarly =
    hasCharEarly &&
    user?.character?.party === stateParty?.partyId &&
    user?.character?.homeState === stateId.toUpperCase();
  const canInfluenceEarly = user?.isAdmin || isChairEarly || isViceChairEarly;
  const canViewExtendedTabsEarly =
    user?.isAdmin || isMemberEarly || isNatChairEarly || isNatViceChairEarly;

  useEffect(() => {
    if (!canViewExtendedTabsEarly) return;
    let cancelled = false;
    async function loadAnalytics() {
      try {
        const response = await fetch(
          `${regionPartyApiUrl(countryCode, stateId, partyId)}/analytics`
        );
        if (!response.ok) return;
        const body = (await response.json()) as StatePartyAnalyticsPayload;
        if (!cancelled) setAnalyticsData(body);
      } catch {
        if (!cancelled) setAnalyticsData(null);
      }
    }
    loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [canViewExtendedTabsEarly, countryCode, stateId, partyId]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam || !stateParty) return;
    const allowedTabs = canViewExtendedTabsEarly
      ? new Set<StateMainTab>([
          "overview",
          "analytics",
          "whip-room",
          "slate",
          "elections",
          "treasury",
          "members",
          "discussion",
        ])
      : new Set<StateMainTab>(["overview", "members"]);
    if (canViewExtendedTabsEarly && canInfluenceEarly) allowedTabs.add("actions");
    if (canViewExtendedTabsEarly && user?.isAdmin) allowedTabs.add("admin");
    const subParam = searchParams.get("sub");
    queueMicrotask(() => {
      if (allowedTabs.has(tabParam as StateMainTab)) {
        setActiveTab(tabParam as StateMainTab);
      }
      if (tabParam === "actions" && subParam) {
        const allowedNppSubTabs = new Set(["recruitment", "management"]);
        if (allowedNppSubTabs.has(subParam)) {
          setNppSubtab(subParam as "recruitment" | "management");
        }
      }
    });
  }, [searchParams, stateParty, canInfluenceEarly, canViewExtendedTabsEarly, user?.isAdmin]);

  const switcherRegionId = useMemo(
    () =>
      resolveScopeSwitcherRegionId(
        scope,
        partyId,
        user?.character?.homeState,
        user?.character?.party,
        [regionId]
      ),
    [scope, partyId, user?.character?.homeState, user?.character?.party, regionId]
  );

  const regionLabel =
    COUNTRY_CLIENT_CONFIGS[(stateParty?.countryId ?? countryCode) as CountryId]?.regionLabel ??
    "Region";

  if (loading) return <PartyPageSkeleton />;
  if (!stateParty) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">
          {loadError
            ? "Could not load this state party. Check your connection and refresh."
            : "State party not found."}
        </div>
      </div>
    );
  }

  const hasChar = !!user?.character?.id;
  const isChair = hasChar && !!stateParty?.chair?.id && stateParty.chair.id === user?.character?.id;
  const isViceChair =
    hasChar && !!stateParty?.viceChair?.id && stateParty.viceChair.id === user?.character?.id;
  const isTreasurer =
    hasChar && !!stateParty?.treasurer?.id && stateParty.treasurer.id === user?.character?.id;
  const isNatChair =
    hasChar && !!stateParty?.nationalChairId && stateParty.nationalChairId === user?.character?.id;
  const isNatViceChair =
    hasChar &&
    !!stateParty?.nationalViceChairId &&
    stateParty.nationalViceChairId === user?.character?.id;
  const isMember =
    hasChar &&
    user?.character?.party === stateParty?.partyId &&
    user?.character?.homeState === stateId.toUpperCase();
  const canManageLead = user?.isAdmin || isNatChair;
  const canManageTreas = user?.isAdmin || isNatChair || isChair || isViceChair || isTreasurer;
  const canManageTreasuryPlan =
    user?.isAdmin ||
    isTreasurer ||
    (!stateParty?.treasurer?.id && (isNatChair || isChair || isViceChair));
  const canChangeTax = canManageTreas;
  const canInfluence = user?.isAdmin || isChair || isViceChair;
  const isStateCampaigner =
    hasChar && !!user?.character?.id && stateParty?.campaigner?.id === user?.character?.id;
  const isNatCampaigner =
    hasChar &&
    !!user?.character?.id &&
    !!stateParty?.nationalCampaignerIds?.includes(user?.character?.id ?? "");
  const canBuildOrg =
    user?.isAdmin ||
    isChair ||
    isViceChair ||
    isNatChair ||
    isNatViceChair ||
    isStateCampaigner ||
    isNatCampaigner;
  const canAssignCampaigner = !!(user?.isAdmin || isChair || isNatChair);
  const canManageSlate = user?.isAdmin || isNatChair || isNatViceChair || isChair || isViceChair;
  const canViewExtendedTabs = user?.isAdmin || isMember || isNatChair || isNatViceChair;

  const regionAdjective = (() => {
    if (!countryHasFeature("ukUi", countryCode)) return stateParty.stateName;
    const region = UK_REGIONS.find((r) => r.id === stateId);
    return region?.adjective ?? stateParty.stateName;
  })();

  const orgLabel = getOrgLabel(stateParty.organization);
  const leanLabel = getStateLeanLabel(stateParty.politicalLean);

  const MAIN_TABS: { id: StateMainTab; label: string }[] = canViewExtendedTabs
    ? [
        { id: "overview", label: "Overview" },
        { id: "analytics", label: "Analytics" },
        ...(canInfluence ? [{ id: "whip-room" as StateMainTab, label: "Whip room" }] : []),
        { id: "slate", label: "Slate" },
        ...(canInfluence ? [{ id: "actions" as StateMainTab, label: "NPPs" }] : []),
        { id: "elections", label: "Elections" },
        { id: "treasury", label: "Treasury" },
        { id: "members", label: `Members (${stateParty.memberCount})` },
        { id: "discussion", label: "Discussion" },
        ...(user?.isAdmin ? [{ id: "admin" as StateMainTab, label: "Admin" }] : []),
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "members", label: `Members (${stateParty.memberCount})` },
      ];

  return (
    <PartyHubChrome
      scope={scope}
      countryCode={countryCode}
      partyId={partyId}
      switcherRegionId={switcherRegionId}
      switcherRegionLabel={regionLabel}
      breadcrumb={
        <div className="mb-6 flex flex-wrap items-center gap-2 text-body text-muted">
          <Link href={regionUrl(countryCode, regionId)} className="hover:text-foreground">
            {stateParty.stateName}
          </Link>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link
            href={partyUrl(stateParty.countryId ?? countryCode, stateParty.partyId)}
            className="hover:text-foreground"
          >
            {stateParty.partyName}
          </Link>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground">
            {regionAdjective} {stateParty.partyName}
          </span>
        </div>
      }
      headerContext={`${regionAdjective} party`}
      title={`${regionAdjective} ${stateParty.partyName}`}
      partyColor={stateParty.partyColor}
      partyAbbreviation={stateParty.partyAbbreviation}
      logoPartyId={stateParty.partyId}
      logoUrl={stateParty.partyLogoUrl}
      countryId={stateParty.countryId}
      regimeStatus={stateParty.regimeStatus}
      tierLabel={isMember ? "Member" : null}
      headerExtra={
        <p className="mt-3 text-body text-muted">
          {stateParty.stateName} electorate:{" "}
          <span className="font-medium text-foreground">{leanLabel.label}</span>
        </p>
      }
      statsStrip={
        <PartyStatsRow>
          <PartyStat label="Organization" detail={orgLabel.label}>
            <span className={PARTY_VALUE_CLASS}>{stateParty.organization.toFixed(1)}%</span>
          </PartyStat>
          <PartyStat label="Treasury">
            <span className={`block truncate ${PARTY_VALUE_CLASS}`}>
              {stateFmt(stateParty.treasury, stateParty.countryId)}
            </span>
          </PartyStat>
          <PartyStat
            label="Political strength"
            detail={
              stateParty.politicalStrength < (stateParty.effectivePsCap ?? STATE_PS_CAP_DEFAULT)
                ? `~+${STATE_PASSIVE_PS_PER_TURN} per turn`
                : "at cap"
            }
          >
            <span className={PARTY_VALUE_CLASS}>{stateParty.politicalStrength.toFixed(1)}</span>
            <span className="ml-1 text-body-sm text-muted">
              of {stateParty.effectivePsCap ?? STATE_PS_CAP_DEFAULT}
            </span>
          </PartyStat>
          <PartyStat label="Members">
            <span className={PARTY_VALUE_CLASS}>{stateParty.memberCount}</span>
          </PartyStat>
          {/* This is the ELECTORATE's partisan lean, not the party's. Labelled
              "Lean" on a party page it read as "this party leans Republican",
              which on a Democratic party page is exactly backwards. */}
          <PartyStat label={`${stateParty.stateName} electorate`}>
            <span className="text-body-lg font-semibold text-foreground">{leanLabel.label}</span>
          </PartyStat>
        </PartyStatsRow>
      }
      msg={msg}
      agendaBanner={
        <AgendaBannerWithEdit
          countryCode={countryCode}
          partyId={stateParty.partyId}
          partyAbbreviation={stateParty.partyAbbreviation}
          partyColor={stateParty.partyColor}
          canEdit={!!(isNatChair || isNatViceChair || user?.isAdmin)}
        />
      }
      tabs={MAIN_TABS}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        setActiveTab(tabId as StateMainTab);
        if (tabId !== "actions") setNppSubtab("recruitment");
      }}
    >
      <StatePartyHubBody
        countryCode={countryCode}
        stateId={stateId}
        partyId={partyId}
        activeTab={activeTab}
        nppSubtab={nppSubtab}
        setNppSubtab={setNppSubtab}
        stateParty={stateParty}
        user={user}
        currentTurn={currentTurn}
        analyticsData={analyticsData}
        fetchStateParty={fetchStateParty}
        treasury={treasury}
        msg={msg}
        canInfluence={canInfluence}
        canViewExtendedTabs={canViewExtendedTabs}
        canBuildOrg={canBuildOrg}
        canAssignCampaigner={canAssignCampaigner}
        canManageLead={canManageLead}
        canManageTreas={canManageTreas}
        canManageTreasuryPlan={!!canManageTreasuryPlan}
        canChangeTax={canChangeTax}
        canManageSlate={canManageSlate}
        isMember={isMember}
        taxRate={taxRate}
        setTaxRate={setTaxRate}
        gotvPercent={gotvPercent}
        setGotvPercent={setGotvPercent}
        gotvCategory={gotvCategory}
        setGotvCategory={setGotvCategory}
        gotvGroup={gotvGroup}
        setGotvGroup={setGotvGroup}
        suppressionPercent={suppressionPercent}
        setSuppressionPercent={setSuppressionPercent}
        suppressionCategory={suppressionCategory}
        setSuppressionCategory={setSuppressionCategory}
        suppressionGroup={suppressionGroup}
        setSuppressionGroup={setSuppressionGroup}
        transferReserveAmount={transferReserveAmount}
        setTransferReserveAmount={setTransferReserveAmount}
        memberSupportReserveAmount={memberSupportReserveAmount}
        setMemberSupportReserveAmount={setMemberSupportReserveAmount}
        nppRecruitmentReserveAmount={nppRecruitmentReserveAmount}
        setNppRecruitmentReserveAmount={setNppRecruitmentReserveAmount}
        treasuryPreset={treasuryPreset}
        setTreasuryPreset={setTreasuryPreset}
        psInvestmentBudget={psInvestmentBudget}
        setPsInvestmentBudget={setPsInvestmentBudget}
      />
    </PartyHubChrome>
  );
}
