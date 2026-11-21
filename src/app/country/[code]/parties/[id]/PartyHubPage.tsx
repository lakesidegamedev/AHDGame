"use client";
import type { PartyHubScope } from "@/app/country/[code]/parties/[id]/StatePartyHub";
import { PartyHubChrome, StatePartyHub } from "@/app/country/[code]/parties/[id]/StatePartyHub";
export type { PartyHubScope } from "@/app/country/[code]/parties/[id]/StatePartyHub";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/observability/fetchJson";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button, CardSkeleton, Skeleton } from "@/components/ui";

import { NationalPartyCommitteeRoster } from "./components/NationalPartyCommitteeRoster";
import { NationalPartyOfficerRow } from "./components/NationalPartyOfficerRow";
import { NationalPartyIdentityStatus } from "./components/NationalPartyIdentityStatus";
import { RegimeOffersInbox } from "@/components/parties/RegimeOffersInbox";
import { AgendaBannerWithEdit } from "@/components/party-hub/AgendaBannerWithEdit";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { parseCountryParam } from "@/lib/db/partyLookup";
import { partyApiUrl, partyUrl } from "@/lib/urls";
import { PlainPositionLabel } from "@/components/party/PlainPositionLabel";
import { PartySwitchElectionWarning } from "@/components/party/PartySwitchElectionWarning";
import {
  PARTY_SECTION_HEADING_CLASS,
  PARTY_VALUE_CLASS,
  PartyStat,
  PartyStatsRow,
} from "@/components/party/partyPageStyles";

import type { PartyAnalyticsPayload } from "@/lib/partyAnalytics/types";

import type {
  UserData as NationalUserData,
  PartyData,
  NationalElectionsState,
  CommitteeData,
} from "./components/types";
import { POSITIONS, fmt as nationalFmt } from "./components/helpers";
import { PartyPageSkeleton } from "./PartyPageSkeleton";
import { usePartyHubLoaders } from "./usePartyHubLoaders";
import { resolveTreasuryPermissions } from "./treasuryPermissions";
import { getNationalCommitteeName } from "@/lib/parties/partyRoleLabels";
import { resolveScopeSwitcherRegionId } from "./resolveScopeSwitcherRegion";

import { apiErrorText } from "@/lib/errors/catalog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

export function PartyHubPage({ scope }: { scope: PartyHubScope }) {
  if (scope.kind === "national") {
    return <NationalPartyHub key={`${scope.countryCode}:${scope.partyId}`} scope={scope} />;
  }
  return <StatePartyHub scope={scope} />;
}

const PanelFallback = () => (
  <CardSkeleton className="min-h-[240px] space-y-4">
    <Skeleton className="h-5 w-36" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
  </CardSkeleton>
);

const NppRecruitmentPanel = dynamic(
  () =>
    import("@/components/party/NppRecruitmentPanel").then((m) => ({
      default: m.NppRecruitmentPanel,
    })),
  { loading: PanelFallback }
);
const NationalPartyInfluencePanel = dynamic(
  () =>
    import("@/components/NationalPartyInfluencePanel").then((m) => ({
      default: m.NationalPartyInfluencePanel,
    })),
  { loading: PanelFallback }
);
const PartyOverviewPanel = dynamic(
  () =>
    import("./components/PartyOverviewPanel").then((m) => ({
      default: m.PartyOverviewPanel,
    })),
  { loading: PanelFallback }
);
const PartyAnalyticsTab = dynamic(
  () => import("./components/PartyAnalyticsTab").then((m) => ({ default: m.PartyAnalyticsTab })),
  { loading: PanelFallback }
);
const NationalElectionPanel = dynamic(
  () =>
    import("./components/NationalElectionPanel").then((m) => ({
      default: m.NationalElectionPanel,
    })),
  { loading: PanelFallback }
);
const NationalCommitteeElectionPanel = dynamic(
  () =>
    import("./components/NationalCommitteeElectionPanel").then((m) => ({
      default: m.NationalCommitteeElectionPanel,
    })),
  { loading: PanelFallback }
);
const StatePartyLinksTab = dynamic(
  () =>
    import("./components/StatePartyLinksTab").then((m) => ({
      default: m.StatePartyLinksTab,
    })),
  { loading: PanelFallback }
);
const TreasuryPanel = dynamic(
  () => import("./components/TreasuryPanel").then((m) => ({ default: m.TreasuryPanel })),
  { loading: PanelFallback }
);
const MembersPanel = dynamic(
  () => import("./components/MembersPanel").then((m) => ({ default: m.MembersPanel })),
  { loading: PanelFallback }
);
const NationalPartyAdminTab = dynamic(
  () =>
    import("./components/NationalPartyAdminTab").then((m) => ({
      default: m.NationalPartyAdminTab,
    })),
  { loading: PanelFallback }
);
const LeadershipPanel = dynamic(
  () =>
    import("./components/LeadershipPanel").then((m) => ({
      default: m.LeadershipPanel,
    })),
  { loading: PanelFallback }
);
const ConferencePanel = dynamic(
  () =>
    import("./components/ConferencePanel").then((m) => ({
      default: m.ConferencePanel,
    })),
  { loading: PanelFallback }
);
const ChairOfficeTab = dynamic(
  () => import("./components/ChairOfficeTab").then((m) => ({ default: m.ChairOfficeTab })),
  { loading: PanelFallback }
);
const CaucusesTab = dynamic(
  () => import("./components/CaucusesTab").then((m) => ({ default: m.CaucusesTab })),
  { loading: PanelFallback }
);
const WhipRoomTab = dynamic(
  () => import("./components/WhipRoomTab").then((m) => ({ default: m.WhipRoomTab })),
  { loading: PanelFallback }
);
const SlateTab = dynamic(
  () => import("./components/SlateTab").then((m) => ({ default: m.SlateTab })),
  { loading: PanelFallback }
);
const TreasuryTransactionLog = dynamic(
  () =>
    import("./components/TreasuryTransactionLog").then((m) => ({
      default: m.TreasuryTransactionLog,
    })),
  { loading: PanelFallback }
);
const PendingTreasuryTransactionsCard = dynamic(
  () =>
    import("./components/PendingTreasuryTransactionsCard").then((m) => ({
      default: m.PendingTreasuryTransactionsCard,
    })),
  { loading: PanelFallback }
);
const RequestFundsCard = dynamic(
  () =>
    import("./components/RequestFundsCard").then((m) => ({
      default: m.RequestFundsCard,
    })),
  { loading: PanelFallback }
);
const DisciplineWatchCard = dynamic(
  () =>
    import("./components/DisciplineWatchCard").then((m) => ({
      default: m.DisciplineWatchCard,
    })),
  { loading: PanelFallback }
);
const RecentActivityCard = dynamic(
  () =>
    import("./components/RecentActivityCard").then((m) => ({
      default: m.RecentActivityCard,
    })),
  { loading: PanelFallback }
);
const CommitteeProposalsSection = dynamic(
  () =>
    import("./components/CommitteeProposalsSection").then((m) => ({
      default: m.CommitteeProposalsSection,
    })),
  { loading: PanelFallback }
);
const DiscussionTab = dynamic(
  () => import("@/components/party/DiscussionTab").then((m) => ({ default: m.DiscussionTab })),
  { loading: PanelFallback }
);

type NationalMainTab =
  | "overview"
  | "analytics"
  | "committee"
  | "caucuses"
  | "whip-room"
  | "slate"
  | "actions"
  | "elections"
  | "treasury"
  | "members"
  | "discussion"
  | "chair-office"
  | "leadership"
  | "conference"
  | "admin";
type ElectionSubTab = "national" | "committee" | "state";
type NppSubTab = "recruitment" | "management";

function NationalPartyHub({ scope }: { scope: Extract<PartyHubScope, { kind: "national" }> }) {
  const { countryCode, partyId: id } = scope;
  const searchParams = useSearchParams();
  const requestedCountry = parseCountryParam(countryCode?.toLowerCase() ?? null);
  const [user, setUser] = useState<NationalUserData | null>(null);
  const [chamberAccess, setChamberAccess] = useState<{ key: string; allowed: boolean } | null>(
    null
  );
  const [party, setParty] = useState<PartyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [electionData, setElectionData] = useState<NationalElectionsState | null>(null);
  const [committeeResult, setCommitteeResult] = useState<CommitteeData | "unavailable" | null>(
    null
  );
  const committeeData = committeeResult === "unavailable" ? null : committeeResult;
  const [currentTurn, setCurrentTurn] = useState(0);
  const [mainTabChoice, chooseMainTab] = useState<{ key: string; value: NationalMainTab } | null>(
    null
  );
  const [electionTabChoice, chooseElectionTab] = useState<{
    key: string;
    value: ElectionSubTab;
  } | null>(null);
  const [nppTabChoice, chooseNppTab] = useState<{ key: string; value: NppSubTab } | null>(null);
  const [eligibleStates, setEligibleStates] = useState<Array<{ id: string; name: string }>>([]);
  const [linkedStateIds, setLinkedStateIds] = useState<string[]>([]);
  const [analyticsData, setAnalyticsData] = useState<PartyAnalyticsPayload | null>(null);
  const [msg, setMsg] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Guards the whole confirm-then-POST window, so a double click cannot send
  // a second leave request while the first is in flight.
  const leaveInFlightRef = useRef(false);
  const tParties = useTranslations("parties");
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirmDialog();
  const [modViewEnabled, setModViewEnabled] = useState(false);
  const [modViewLoading, setModViewLoading] = useState(false);

  const backCountry =
    (party?.countryId ? parseCountryParam(party.countryId.toLowerCase()) : null)?.toLowerCase() ??
    requestedCountry?.toLowerCase() ??
    "us";
  const partiesListHref = `/country/${backCountry}/parties`;

  const {
    fetchUser,
    fetchParty,
    fetchLinkedStates,
    fetchElections,
    fetchCommittee,
    fetchEligibleStates,
    fetchAnalytics,
  } = usePartyHubLoaders({
    id,
    requestedCountry,
    modViewEnabled,
    setUser,
    setParty,
    setLinkedStateIds,
    setElectionData,
    setCommitteeResult,
    setEligibleStates,
    setAnalyticsData,
    setLoading,
    setMsg,
  });

  useEffect(() => {
    fetchUser();
    fetchParty();
    fetchElections();
    fetchCommittee();
    fetchJson<{ currentTurn?: number }>("/api/game/turn/status", {
      credentials: "same-origin",
      feature: "party-detail-turn-status",
    })
      .then((d) => {
        if (d?.currentTurn) setCurrentTurn(d.currentTurn);
      })
      .catch(() => {});
  }, [id, fetchUser, fetchParty, fetchElections, fetchCommittee]);

  const hasCharEarly = !!user?.character?.id;
  const isChairEarly = hasCharEarly && !!party?.chair?.id && user?.character?.id === party.chair.id;
  const isViceChairEarly =
    hasCharEarly && !!party?.viceChair?.id && user?.character?.id === party.viceChair.id;
  const isChairVacant = !party?.chair?.id;
  const canActAsChairEarly = isChairEarly || (isChairVacant && isViceChairEarly);
  const isInPartyEarly =
    hasCharEarly &&
    !!party &&
    user?.character?.party === id &&
    user?.character?.countryId === party.countryId;
  const canUsePartyInfluenceEarly = user?.isAdmin || isChairEarly || isViceChairEarly;
  // Committee-confirmed campaigners reach NPP Management but not
  // Recruitment or other chair/VC surfaces, so this is separate from `canUsePartyInfluence`.
  const isCampaignerEarly =
    hasCharEarly && !!party?.campaigners?.some((c) => c.id === user?.character?.id);
  const canManageNppsEarly = canUsePartyInfluenceEarly || isCampaignerEarly;
  const chamberQueryKey = JSON.stringify([requestedCountry, id, user?.character?.id]);
  const needsChamberQuery =
    !!party &&
    countryHasFeature("usUi", party.countryId) &&
    !!user?.character?.id &&
    !user.isAdmin &&
    !isChairEarly &&
    !isViceChairEarly;
  const isChamberLeaderForParty =
    needsChamberQuery && chamberAccess?.key === chamberQueryKey && chamberAccess.allowed;
  const canViewExtendedTabsEarly =
    user?.isAdmin || isInPartyEarly || modViewEnabled || isChamberLeaderForParty;

  useEffect(() => {
    if (
      !party ||
      !countryHasFeature("usUi", party.countryId) ||
      !user?.character?.id ||
      user.isAdmin ||
      isChairEarly ||
      isViceChairEarly
    ) {
      return;
    }
    let cancelled = false;
    fetch(`${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/whippable-bills`, {
      credentials: "same-origin",
    })
      .then((response) => {
        if (!cancelled) setChamberAccess({ key: chamberQueryKey, allowed: response.ok });
      })
      .catch(() => {
        if (!cancelled) setChamberAccess({ key: chamberQueryKey, allowed: false });
      });
    return () => {
      cancelled = true;
    };
  }, [
    party,
    id,
    requestedCountry,
    user?.character?.id,
    user?.isAdmin,
    isChairEarly,
    isViceChairEarly,
    chamberQueryKey,
  ]);

  useEffect(() => {
    if (canViewExtendedTabsEarly) {
      fetchAnalytics();
      fetchLinkedStates();
    }
  }, [canViewExtendedTabsEarly, fetchAnalytics, fetchLinkedStates]);

  useEffect(() => {
    if (canUsePartyInfluenceEarly) {
      fetchEligibleStates();
    }
  }, [canUsePartyInfluenceEarly, fetchEligibleStates]);

  const routeTabKey = searchParams.toString();
  const tabParam = searchParams.get("tab");
  const allowed = canViewExtendedTabsEarly
    ? new Set<NationalMainTab>([
        "overview",
        "analytics",
        "committee",
        "caucuses",
        "whip-room",
        "slate",
        "elections",
        "treasury",
        "members",
        "discussion",
      ])
    : new Set<NationalMainTab>(["overview", "members"]);
  if (canViewExtendedTabsEarly && canManageNppsEarly) allowed.add("actions");
  if (canViewExtendedTabsEarly && canActAsChairEarly) allowed.add("chair-office");
  // UK party leadership removal and conferences: national hub, UK parties only.
  if (canViewExtendedTabsEarly && countryHasFeature("ukUi", party?.countryId))
    allowed.add("leadership").add("conference");
  if (canViewExtendedTabsEarly && user?.isAdmin) allowed.add("admin");
  const candidateTab = mainTabChoice?.key === routeTabKey ? mainTabChoice.value : tabParam;
  const activeTab: NationalMainTab = allowed.has(candidateTab as NationalMainTab)
    ? (candidateTab as NationalMainTab)
    : "overview";
  const subParam = searchParams.get("sub");
  const electionSubTab: ElectionSubTab =
    electionTabChoice?.key === routeTabKey
      ? electionTabChoice.value
      : activeTab === "elections" && ["national", "committee", "state"].includes(subParam ?? "")
        ? (subParam as ElectionSubTab)
        : "national";
  const nppSubTab: NppSubTab =
    nppTabChoice?.key === routeTabKey
      ? nppTabChoice.value
      : activeTab === "actions" && ["recruitment", "management"].includes(subParam ?? "")
        ? (subParam as NppSubTab)
        : "recruitment";
  const setActiveTab = (value: NationalMainTab) => chooseMainTab({ key: routeTabKey, value });
  const setElectionSubTab = (value: ElectionSubTab) =>
    chooseElectionTab({ key: routeTabKey, value });
  const setNppSubTab = (value: NppSubTab) => chooseNppTab({ key: routeTabKey, value });

  const enableModView = useCallback(async () => {
    if (!party) return;
    setModViewLoading(true);
    try {
      const response = await fetch("/api/moderator/mod-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "party",
          targetId: id,
          targetName: party.name,
          countryId: party.countryId,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMsg(`✗ ${apiErrorText(payload, "Failed to enable Mod View")}`);
        return;
      }
      setModViewEnabled(true);
      setMsg(`✓ Mod View enabled for ${party.name}`);
    } catch {
      setMsg("✗ Failed to enable Mod View");
    } finally {
      setModViewLoading(false);
    }
  }, [id, party, setModViewLoading, setModViewEnabled, setMsg]);

  const apiPost = async (
    url: string,
    body: object,
    onOk?: (data: { pending?: boolean }) => void
  ) => {
    setMsg("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg(r.ok ? `✓ ${d.message}` : `✗ ${apiErrorText(d, "Request failed")}`);
      if (r.ok) {
        fetchParty();
        onOk?.(d);
      }
    } catch {
      setMsg("✗ Network error");
    }
  };

  // Growth frontier: a party can only be joined from a region it already
  // reaches or borders. `frontierRegions === null` means the party has no
  // presence anywhere and is open to all, mirroring the server's fail-open
  // branch. A character with no home region is also allowed through, as the
  // server does. The server remains the real gate; this only explains it.
  const viewerHomeState = user?.character?.homeState ?? null;
  const joinFrontierRegions = party?.frontierRegions ?? null;
  const canJoinFromHomeRegion =
    joinFrontierRegions == null ||
    !viewerHomeState ||
    joinFrontierRegions.includes(viewerHomeState);

  const handleJoin = async () => {
    setJoining(true);
    await apiPost(
      `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/join`,
      {},
      (data) => {
        if (data.pending) return;
        void import("@/lib/analytics/capture")
          .then(({ captureProductEvent }) => captureProductEvent("party_joined"))
          .catch(() => {});
      }
    );
    fetchUser();
    setJoining(false);
  };
  // In-page modal, not window.confirm(): native client webviews deny or never
  // show the browser dialog, which rejected unhandled (#3375).
  const handleLeave = async () => {
    if (leaveInFlightRef.current) return;
    leaveInFlightRef.current = true;
    try {
      const confirmed = await confirmDialog({
        title: tParties("leave.confirmTitle"),
        message: tParties("leave.confirmMessage"),
        confirmLabel: tParties("leave.confirm"),
        cancelLabel: tParties("leave.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      setLeaving(true);
      await apiPost(`${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/leave`, {});
      fetchUser();
    } finally {
      leaveInFlightRef.current = false;
      setLeaving(false);
    }
  };

  const switcherRegionId = useMemo(
    () =>
      resolveScopeSwitcherRegionId(
        scope,
        id,
        user?.character?.homeState,
        user?.character?.party,
        linkedStateIds
      ),
    [scope, id, user?.character?.homeState, user?.character?.party, linkedStateIds]
  );

  const regionLabel =
    COUNTRY_CLIENT_CONFIGS[(party?.countryId ?? "US") as CountryId]?.regionLabel ?? "Region";

  if (loading) return <PartyPageSkeleton />;
  if (!party) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Party not found.</div>
      </div>
    );
  }

  const hasChar = !!user?.character?.id;
  const isInParty =
    hasChar && user?.character?.party === id && user?.character?.countryId === party.countryId;
  const isChair = hasChar && !!party.chair?.id && user?.character?.id === party.chair.id;
  const isViceChair =
    hasChar && !!party.viceChair?.id && user?.character?.id === party.viceChair.id;
  const canActAsChair = isChair || (!party.chair?.id && isViceChair);
  const isActingChair = !party.chair?.id && isViceChair;
  const isTreasurer =
    hasChar && !!party.treasurer?.id && user?.character?.id === party.treasurer.id;
  const isTreasurerSeatVacant = !party.treasurer?.id;
  const { canManageTreasury, canManageTreasuryPlan, canManageTax, canManageBudgets } =
    resolveTreasuryPermissions({
      isAdmin: !!user?.isAdmin,
      isChair,
      isViceChair,
      isTreasurer,
      isTreasurerSeatVacant,
    });
  const canUsePartyInfluence = user?.isAdmin || isChair || isViceChair;
  const isCampaigner = hasChar && !!party.campaigners?.some((c) => c.id === user?.character?.id);
  const canManageNpps = canUsePartyInfluence || isCampaigner;
  // Campaigners only get the Management sub-tab, so the stored "recruitment"
  // default has to collapse to it rather than rendering an empty panel.
  const effectiveNppSubTab: NppSubTab = canUsePartyInfluence ? nppSubTab : "management";
  const canViewExtendedTabs =
    user?.isAdmin || isInParty || modViewEnabled || isChamberLeaderForParty;
  const sortedMembers = [...party.members].sort((a, b) => a.name.localeCompare(b.name));
  const candidatePositions = POSITIONS.filter((p) => electionData?.isCandidate[p]);
  const hasOpenNationalBallot =
    (electionData?.canVote || electionData?.canRun) &&
    POSITIONS.some((position) => {
      const ballot = electionData.elections[position];
      return ballot?.status === "voting" && ballot.endTurn > currentTurn;
    });

  const MAIN_TABS: { id: NationalMainTab; label: string }[] = canViewExtendedTabs
    ? [
        { id: "overview", label: "Overview" },
        { id: "analytics", label: "Analytics" },
        { id: "committee", label: party.committeeTitles?.name?.trim() || "Committee" },
        { id: "caucuses", label: "Caucuses" },
        { id: "whip-room", label: "Whip room" },
        { id: "slate", label: "Slate" },
        ...(canManageNpps ? [{ id: "actions" as NationalMainTab, label: "NPPs" }] : []),
        { id: "elections", label: "Elections" },
        { id: "treasury", label: "Treasury" },
        { id: "members", label: `Members (${party.memberCount})` },
        { id: "discussion", label: "Discussion" },
        ...(canActAsChair
          ? [
              {
                id: "chair-office" as NationalMainTab,
                label: isActingChair ? "Chair office (acting)" : "Chair office",
              },
            ]
          : []),
        ...(countryHasFeature("ukUi", party.countryId)
          ? [{ id: "leadership" as NationalMainTab, label: "Leadership" }]
          : []),
        ...(countryHasFeature("ukUi", party.countryId)
          ? [{ id: "conference" as NationalMainTab, label: "Conference" }]
          : []),
        ...(user?.isAdmin ? [{ id: "admin" as NationalMainTab, label: "Admin" }] : []),
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "members", label: `Members (${party.memberCount})` },
      ];

  return (
    <PartyHubChrome
      scope={scope}
      countryCode={backCountry}
      partyId={id}
      switcherRegionId={switcherRegionId}
      switcherRegionLabel={regionLabel}
      backLink={
        <Link
          href={partiesListHref}
          className="mb-4 inline-flex items-center gap-2 text-body font-medium text-muted transition-colors hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          All parties
        </Link>
      }
      headerContext="National headquarters"
      title={party.name}
      partyColor={party.color}
      partyAbbreviation={party.abbreviation}
      logoPartyId={party.id}
      logoUrl={party.logoUrl}
      countryId={party.countryId}
      regimeStatus={party.regimeStatus}
      tierLabel={
        (party.tier ?? (party.isDefault ? "major" : "minor")) === "major"
          ? "Major party"
          : "Minor party"
      }
      headerExtra={<NationalPartyIdentityStatus party={party} currentTurn={currentTurn} />}
      headerActions={
        user?.hasCharacter ? (
          isInParty ? (
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="h-9 rounded-lg border border-error/40 px-3.5 text-body font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              {leaving ? tParties("leave.pending") : tParties("leave.button")}
            </button>
          ) : (
            <div className="flex max-w-72 flex-col items-stretch gap-2">
              <Button
                onClick={handleJoin}
                disabled={joining || !canJoinFromHomeRegion}
                title={
                  canJoinFromHomeRegion
                    ? undefined
                    : `${party.name} is not established in or next to your home region.`
                }
              >
                {joining ? "Joining…" : "Join party"}
              </Button>
              {user.character?.party && user.character.party !== "independent" ? (
                <PartySwitchElectionWarning />
              ) : null}
            </div>
          )
        ) : null
      }
      modViewBanner={
        !user?.isAdmin && user?.isModerator && !isInParty ? (
          <div className="flex flex-col gap-3 border-t border-card-border px-4 py-4 text-body sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="font-semibold text-foreground">Moderator view</p>
              <p className="text-muted">
                Unlock member-only party tabs in read-only mode. Each unlock is written to the
                moderator audit log.
              </p>
            </div>
            {modViewEnabled ? (
              <span className="shrink-0 font-medium text-foreground">Mod view active</span>
            ) : (
              <Button
                variant="secondary"
                onClick={enableModView}
                disabled={modViewLoading}
                className="w-fit shrink-0"
              >
                {modViewLoading ? "Enabling..." : "Mod view"}
              </Button>
            )}
          </div>
        ) : null
      }
      statsStrip={
        <PartyStatsRow>
          <PartyStat
            label="Political strength"
            detail="Spent on party actions such as building organization; capped"
          >
            <span className={PARTY_VALUE_CLASS}>{(party.politicalStrength ?? 0).toFixed(1)}</span>
            <span className="ml-1 text-body-sm text-muted">of {party.effectivePsCap}</span>
          </PartyStat>
          <PartyStat label="Members">
            <span className={PARTY_VALUE_CLASS}>{party.memberCount}</span>
          </PartyStat>
          <PartyStat label="Treasury">
            <span className={`block truncate ${PARTY_VALUE_CLASS}`}>
              {nationalFmt(party.treasury, party.countryId)}
            </span>
          </PartyStat>
          <PartyStat label="Economic">
            <PlainPositionLabel
              value={party.economicPosition}
              axis="economic"
              className="text-body-lg font-semibold text-foreground"
            />
          </PartyStat>
          <PartyStat label="Social">
            <PlainPositionLabel
              value={party.socialPosition}
              axis="social"
              className="text-body-lg font-semibold text-foreground"
            />
          </PartyStat>
          <PartyStat
            label="Bonus actions"
            detail="Extra actions for members, from their influence and how close they are to the party"
          >
            <span className={PARTY_VALUE_CLASS}>+{party.totalBonusActions}</span>
            <span className="ml-1 text-body-sm text-muted">per turn</span>
          </PartyStat>
        </PartyStatsRow>
      }
      msg={msg}
      defunctBanner={
        party.isDefunct ? (
          <div className="mb-4 rounded-lg border border-error/40 bg-error/10 p-3 text-body-sm text-error">
            This party has been dissolved
            {party.defunctAtTurn ? ` (turn ${party.defunctAtTurn})` : ""} and is no longer active.
          </div>
        ) : null
      }
      agendaBanner={
        <AgendaBannerWithEdit
          countryCode={countryCode}
          partyId={id}
          partyAbbreviation={party.abbreviation}
          partyColor={party.color}
          canEdit={!!(isChair || isViceChair || user?.isAdmin)}
        />
      }
      tabs={MAIN_TABS}
      activeTab={activeTab}
      onTabChange={(tabId) => setActiveTab(tabId as NationalMainTab)}
    >
      {activeTab === "overview" && (
        <div className="space-y-12">
          {hasOpenNationalBallot && (
            <Link
              href={`${partyUrl(backCountry, party.id)}?tab=elections`}
              className="inline-block text-body-sm font-semibold text-primary underline"
            >
              View open national ballots
            </Link>
          )}
          <PartyOverviewPanel party={party} committeeResult={committeeResult} />
          <RegimeOffersInbox countryCode={backCountry} partySequentialId={String(party.id)} />
          {canViewExtendedTabs && (
            <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
              <DisciplineWatchCard countryCode={backCountry} partyId={String(party.id)} />
              <RecentActivityCard countryCode={backCountry} partyId={String(party.id)} />
            </div>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <PartyAnalyticsTab
          countryCode={backCountry}
          partyId={String(party.id)}
          initialData={analyticsData}
        />
      )}

      {activeTab === "caucuses" && (
        <CaucusesTab
          countryCode={backCountry}
          partyId={String(party.id)}
          viewerCharacterId={user?.character?.id ?? null}
          currentTurn={currentTurn}
          isNationalParty={true}
          viewerInParty={isInParty}
          eligibleStates={eligibleStates}
          initialSelectedSlug={searchParams.get("caucus")}
        />
      )}

      {activeTab === "whip-room" && (
        <WhipRoomTab
          countryId={party.countryId}
          partyId={String(party.id)}
          partyColor={party.color}
          canUsePartyInfluence={!!canUsePartyInfluence || isChamberLeaderForParty}
          eligibleStates={eligibleStates}
        />
      )}

      {activeTab === "slate" && (
        <SlateTab
          countryCode={backCountry}
          countryId={party.countryId}
          partyId={String(party.id)}
          partyColor={party.color}
          canManageSlate={!!canUsePartyInfluence}
          partyMembers={party.members}
          initialSelectedState={searchParams.get("state")}
        />
      )}

      {activeTab === "committee" && (
        <div className="space-y-12">
          <NationalPartyOfficerRow party={party} />
          <NationalPartyCommitteeRoster
            countryId={party.countryId}
            committeeResult={committeeResult}
            committeeTitles={party.committeeTitles}
            showSeatNumbers
          />
          <CommitteeProposalsSection
            country={backCountry}
            countryCode={countryCode}
            partyId={id}
            characterId={user?.character?.id ?? null}
            isChair={isChair}
            isDefaultParty={party.isDefault}
          />
        </div>
      )}

      {activeTab === "actions" && (
        <div className="space-y-8">
          <section aria-labelledby="party-resources-title">
            <h2 id="party-resources-title" className={PARTY_SECTION_HEADING_CLASS}>
              Party resources
            </h2>
            <dl className="mt-4 grid max-w-2xl gap-6 sm:grid-cols-2">
              <div>
                <dt className="text-body-sm text-muted">Treasury</dt>
                <dd className={PARTY_VALUE_CLASS}>
                  {nationalFmt(party.treasury, party.countryId)}
                </dd>
              </div>
              <div>
                <dt className="text-body-sm text-muted">Action points</dt>
                <dd className={PARTY_VALUE_CLASS}>
                  {party.nppActionPoints} / {party.nppActionPointCap}
                </dd>
                <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-border" aria-hidden>
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-all duration-300"
                    style={{
                      width: `${party.nppActionPointCap > 0 ? Math.min(100, (party.nppActionPoints / party.nppActionPointCap) * 100) : 0}%`,
                    }}
                  />
                </dd>
                <dd className="mt-1.5 text-body-sm text-muted">
                  +{party.nppActionPointRegen} per turn, spent on NPP recruitment and management
                </dd>
              </div>
            </dl>
          </section>
          <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-card-border p-1">
            {(
              (canUsePartyInfluence ? ["recruitment", "management"] : ["management"]) as NppSubTab[]
            ).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setNppSubTab(sub)}
                className={`whitespace-nowrap rounded-md px-4 py-1.5 text-body font-medium transition-colors ${
                  effectiveNppSubTab === sub
                    ? "bg-card-elevated text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {sub === "recruitment" ? "Recruitment" : "Management"}
              </button>
            ))}
          </div>
          {effectiveNppSubTab === "recruitment" ? (
            <NppRecruitmentPanel partyId={party.id} countryId={party.countryId} isNational={true} />
          ) : (
            <NationalPartyInfluencePanel
              partyId={party.id}
              partyColor={party.color}
              country={backCountry}
              onPartyRefresh={fetchParty}
            />
          )}
        </div>
      )}

      {activeTab === "elections" && (
        <div className="space-y-6">
          <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-card-border p-1">
            {(["national", "committee", "state"] as ElectionSubTab[]).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setElectionSubTab(sub)}
                className={`whitespace-nowrap rounded-md px-4 py-1.5 text-body font-medium transition-colors ${
                  electionSubTab === sub
                    ? "bg-card-elevated text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {sub === "national"
                  ? "National leadership"
                  : sub === "committee"
                    ? getNationalCommitteeName(party.countryId, party.committeeTitles)
                    : `${COUNTRY_CLIENT_CONFIGS[(party?.countryId ?? "US") as CountryId]?.regionLabelPlural ?? "State parties"}`}
              </button>
            ))}
          </div>
          {electionSubTab === "national" && (
            <>
              <p className="text-body-sm text-muted">
                Each election runs 96 turns. Members may vote and change their vote anytime before
                it closes. Ties broken by earliest declaration.
              </p>
              {!electionData ? (
                <div className="text-body text-muted">Loading elections…</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {POSITIONS.map((pos) => (
                    <NationalElectionPanel
                      key={pos}
                      election={electionData.elections[pos]}
                      position={pos}
                      partyColor={party.color}
                      partyId={id}
                      country={backCountry}
                      leadershipTitles={party.leadershipTitles}
                      canVote={electionData.canVote}
                      canRun={electionData.canRun}
                      runCooldownUntil={electionData.runCooldownUntil}
                      electionMethod={electionData.leadershipElectionMethod}
                      userVote={electionData.userVotes[pos]}
                      isCandidate={electionData.isCandidate[pos]}
                      isCandidateElsewhere={
                        candidatePositions.length > 0 && !candidatePositions.includes(pos)
                      }
                      currentTurn={currentTurn}
                      onRefresh={fetchElections}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {electionSubTab === "committee" && (
            <NationalCommitteeElectionPanel
              election={committeeData?.election ?? null}
              partyColor={party.color}
              partyId={id}
              country={backCountry}
              canVote={committeeData?.canVote ?? false}
              canRun={committeeData?.canRun ?? false}
              runCooldownUntil={committeeData?.runCooldownUntil ?? null}
              userVotes={committeeData?.userVotes ?? []}
              isCandidate={committeeData?.isCandidate ?? false}
              currentTurn={currentTurn}
              onRefresh={fetchCommittee}
            />
          )}
          {electionSubTab === "state" && (
            <StatePartyLinksTab
              partyId={id}
              partyColor={party.color}
              countryId={party.countryId}
              canManage={canUsePartyInfluence}
              canSpendPs={canUsePartyInfluence}
              nationalPoliticalStrength={party.politicalStrength ?? 0}
              nationalTreasury={party.treasury ?? 0}
              onNationalPsSpent={fetchParty}
            />
          )}
        </div>
      )}

      {activeTab === "treasury" && (
        <div className="space-y-6">
          <TreasuryPanel
            party={party}
            partyId={id}
            countryId={party.countryId}
            modViewEnabled={modViewEnabled}
            canManageTreasury={canManageTreasury}
            canManageTreasuryPlan={!!canManageTreasuryPlan}
            canManageTax={!!canManageTax}
            canManageBudgets={!!canManageBudgets}
            isInParty={isInParty}
            isAdmin={!!user?.isAdmin}
            sortedMembers={sortedMembers}
            onPartyRefresh={fetchParty}
            onUserRefresh={fetchUser}
            user={user}
          />
          {isInParty && (
            <RequestFundsCard party={party} countryCode={backCountry} onRequested={fetchParty} />
          )}
          <PendingTreasuryTransactionsCard
            countryCode={backCountry}
            partyId={String(party.id)}
            onActed={fetchParty}
          />
          <TreasuryTransactionLog countryCode={backCountry} partyId={String(party.id)} />
        </div>
      )}

      {activeTab === "members" && <MembersPanel party={party} />}

      {activeTab === "discussion" && (
        <DiscussionTab
          apiBasePath={`${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/discussion`}
          isModerator={!!(user?.isModerator || user?.isAdmin)}
        />
      )}

      {activeTab === "chair-office" && canActAsChair && (
        <>
          {isActingChair && (
            <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-body text-warning">
              <strong>Acting chair.</strong> The chair seat is vacant; you have inherited chair
              authority as Vice-Chair. This access reverts once a new chair is elected or
              admin-appointed.
            </div>
          )}
          <ChairOfficeTab
            party={party}
            countryId={backCountry}
            characterId={user?.character?.id ?? ""}
            committeeMembers={committeeData?.committeeMembers}
            onUpdate={fetchParty}
          />
        </>
      )}

      {activeTab === "leadership" && countryHasFeature("ukUi", party.countryId) && (
        <LeadershipPanel
          countryCode={backCountry}
          partyId={id}
          leadershipTitles={party.leadershipTitles}
        />
      )}

      {activeTab === "conference" && countryHasFeature("ukUi", party.countryId) && (
        <ConferencePanel countryCode={backCountry} partyId={id} />
      )}

      {activeTab === "admin" && user?.isAdmin && (
        <NationalPartyAdminTab party={party} onUpdate={fetchParty} />
      )}
      {confirmDialogNode}
    </PartyHubChrome>
  );
}
