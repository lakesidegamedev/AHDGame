"use client";

import {
  LegislatureRowsSkeleton,
  LegislaturePageShell,
  LegislaturePageTabs,
} from "./components/shared/LegislaturePageShell";

import { filterLegislatureBills } from "./components/shared/legislaturePresentation";

import { useState, useEffect } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import {
  mapSnapElectionViewerState,
  type ExecutiveGovernmentResponse,
} from "@/lib/government/executiveViewerState";
import { TariffsTab } from "@/components/legislature/TariffsTab";
import { SubsidiesTab } from "@/components/legislature/SubsidiesTab";
import { LeaderCard } from "@/components/legislature/LeaderCard";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { BillsList } from "@/components/bills/BillsList";
import { BillListControls, type BillVoteFilter } from "@/components/bills/BillListControls";
import { LegislatureMembersTab } from "./components/shared/LegislatureMembersTab";
import LegislatureHeader from "./components/shared/LegislatureHeader";
import {
  useLegislatureData,
  type BillsData,
  type LeadersData,
} from "./components/shared/useLegislatureData";
import { PMSnapElectionButton } from "@/components/parliamentary/PMSnapElectionButton";
import { AdminSnapElectionButton } from "@/components/parliamentary/AdminSnapElectionButton";
import { ProposeLegislationModal } from "./ProposeLegislationModal";
import { BundestagspraesidentPanel } from "./BundestagspraesidentPanel";
import GovernmentVotePanel from "@/components/uk/GovernmentVotePanel";
import type {
  AppointmentVotePayload,
  NoConfidenceVotePayload,
} from "@/types/parliamentaryGovernment";

const REICHSTAG_HERO = {
  image:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Berlin_reichstag_west_panorama_2.jpg/1280px-Berlin_reichstag_west_panorama_2.jpg",
  alt: "The Reichstag building in Berlin, seat of the German Bundestag, seen from the west.",
};

// The Bundesrat is shown for completeness — it is appointed by Land governments
// (each Land's coalition delegates 3-6 votes) and not part of the player legislative
// loop. Disabling the option here matches UK's Lords pattern (UKParliamentPage.tsx).
// Defensive `activeChamber === "bundesrat"` branches downstream remain in place
// to handle programmatic state mutation; they render the same placeholder UI.
const CHAMBER_OPTIONS = [
  { key: "bundestag", label: "Bundestag" },
  {
    key: "bundesrat",
    label: "Bundesrat",
    disabled: true,
    title:
      "The Bundesrat is appointed by Land governments and is not part of the player legislative loop.",
  },
];

type PageTab = "composition" | "bills" | "leadership" | "tariffs" | "subsidies";

// ─── Bills Tab ────────────────────────────────────────────────────────────────

function BillsTab({
  bills,
  loading,
  activeChamber,
  countryId,
  onProposed,
}: {
  bills: BillsData | null;
  loading: boolean;
  activeChamber: string;
  countryId: CountryId;
  onProposed: () => void;
}) {
  const isBundestag = activeChamber === "bundestag";
  const [showModal, setShowModal] = useState(false);
  const [voteFilter, setVoteFilter] = useState<BillVoteFilter>("all");

  if (loading) {
    return <LegislatureRowsSkeleton kind="bills" />;
  }

  if (!isBundestag) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Bundesrat legislation is not player-managed.
        </p>
        <p className="mt-1 text-xs text-muted">
          The Bundesrat is appointed by state governments, so active federal bills are proposed and
          voted through the Bundestag flow.
        </p>
      </div>
    );
  }

  if (!bills) {
    return <p className="text-center text-sm text-muted py-12">Bills data unavailable.</p>;
  }

  const {
    bills: billList,
    canPropose,
    hasActiveBill,
    adminOverride,
    blockedProvisions,
    proposalWarnings,
  } = bills;
  const filtered = filterLegislatureBills(billList, voteFilter);

  return (
    <div className="space-y-4">
      {(canPropose || hasActiveBill) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {adminOverride
                ? "Admin — propose a Bundestag bill"
                : "You are a seated MdB — propose a bill"}
            </p>
            <p className="text-xs text-muted">
              Opens to a vote among seated Bundestag members immediately.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Propose bill
          </button>
        </div>
      )}

      <BillListControls
        voteFilter={voteFilter}
        onVoteFilterChange={setVoteFilter}
        showVoteFilter={canPropose}
      />

      <BillsList bills={filtered} onVoted={onProposed} />

      <p className="text-xs text-muted">
        {filtered.length} bill{filtered.length !== 1 ? "s" : ""} total
      </p>

      {showModal && (
        <ProposeLegislationModal
          hasActiveBill={!canPropose && Boolean(hasActiveBill)}
          adminOverride={adminOverride}
          countryId={countryId}
          blockedProvisions={blockedProvisions}
          proposalWarning={proposalWarnings?.bundestag ?? null}
          chambers={[{ value: "bundestag", label: "Bundestag" }]}
          domesticOnlyLabel="German-headquartered corporations only"
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            onProposed();
          }}
        />
      )}
    </div>
  );
}

// ─── Leadership Tab ───────────────────────────────────────────────────────────

function LeadershipTab({
  leaders,
  loading,
  countryId,
  governmentStatus,
  viewerIsSittingPM,
  snapElectionsAllowed,
  snapElectionsUsed,
  snapElectionsRemaining,
  snapCooldownTurnsRemaining,
  activeAppointmentVotes,
  activeNoConfidenceVote,
  viewerVotes,
  viewerWhippedFrom,
  viewerIsBundestagMember,
  onRefresh,
}: {
  leaders: LeadersData | null;
  loading: boolean;
  countryId: CountryId;
  governmentStatus: string | null;
  viewerIsSittingPM: boolean;
  snapElectionsAllowed: boolean;
  snapElectionsUsed: number;
  snapElectionsRemaining: number;
  snapCooldownTurnsRemaining: number;
  activeAppointmentVotes: AppointmentVotePayload[];
  activeNoConfidenceVote: NoConfidenceVotePayload | null;
  viewerVotes: Record<string, "aye" | "nay">;
  viewerWhippedFrom: Record<string, string>;
  viewerIsBundestagMember: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-card/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!leaders) {
    return <p className="text-center text-sm text-muted py-12">Leadership data unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      {governmentStatus === "formed" && viewerIsSittingPM && snapElectionsAllowed && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Dissolve the Bundestag</p>
              <p className="text-xs text-muted">
                As Chancellor, you may call a snap election. All active legislation will fail.
              </p>
            </div>
          </div>
          <PMSnapElectionButton
            countryId={countryId}
            snapElectionsUsed={snapElectionsUsed}
            snapElectionsRemaining={snapElectionsRemaining}
            cooldownTurnsRemaining={snapCooldownTurnsRemaining}
            onTriggered={onRefresh}
          />
        </div>
      )}
      {activeAppointmentVotes.map((vote) => (
        <GovernmentVotePanel
          key={vote._id}
          vote={vote}
          countryCode={countryId.toLowerCase()}
          canVote={viewerIsBundestagMember}
          viewerVote={viewerVotes[vote._id] ?? null}
          myWhippedFrom={viewerWhippedFrom[vote._id] ?? null}
          appointmentLabel="Chancellor Appointment Vote"
          onVoteCast={onRefresh}
        />
      ))}
      {activeNoConfidenceVote && (
        <GovernmentVotePanel
          vote={activeNoConfidenceVote}
          countryCode={countryId.toLowerCase()}
          canVote={viewerIsBundestagMember}
          viewerVote={viewerVotes[activeNoConfidenceVote._id] ?? null}
          myWhippedFrom={viewerWhippedFrom[activeNoConfidenceVote._id] ?? null}
          onVoteCast={onRefresh}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <LeaderCard
          title="Chancellor"
          subtitle="Head of the federal government"
          character={leaders.primeMinister}
        />
        <LeaderCard
          title="Opposition leader"
          subtitle="Leader of the largest non-governing party"
          character={leaders.oppositionLeader}
        />
      </div>

      <BundestagspraesidentPanel />

      <div className="rounded-xl border border-card-border/40 bg-card-muted/30 p-4">
        <p className="text-xs text-muted leading-relaxed">
          The Federal Chancellor is elected by the Bundestag and leads the federal government. The
          Bundestagspräsident presides over the Bundestag and ranks second in the constitutional
          order of precedence after the Bundespräsident. The Opposition Leader heads the largest
          party not participating in the governing coalition.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DEBundestagPage({ countryId }: { countryId: CountryId }) {
  const [activeChamber, setActiveChamber] = useState("bundestag");
  const { members, bills, leaders, loading, error, refetch } = useLegislatureData(
    countryId,
    activeChamber
  );
  const [activeTab, setActiveTab] = useState<PageTab>("bills");

  const [governmentStatus, setGovernmentStatus] = useState<string | null>(null);
  const [viewerIsSittingPM, setViewerIsSittingPM] = useState(false);
  const [snapElectionsAllowed, setSnapElectionsAllowed] = useState(false);
  const [snapElectionsUsed, setSnapElectionsUsed] = useState(0);
  const [snapElectionsRemaining, setSnapElectionsRemaining] = useState(0);
  const [snapCooldownTurnsRemaining, setSnapCooldownTurnsRemaining] = useState(0);
  // The Chancellor appointment + no-confidence votes are served by the
  // /executive route; surface them on the Bundestag Leadership tab too (the
  // Bundestag elects the Chancellor) so they don't live only on the executive
  // hub.
  const [activeAppointmentVotes, setActiveAppointmentVotes] = useState<AppointmentVotePayload[]>(
    []
  );
  const [activeNoConfidenceVote, setActiveNoConfidenceVote] =
    useState<NoConfidenceVotePayload | null>(null);
  const [viewerVotes, setViewerVotes] = useState<Record<string, "aye" | "nay">>({});
  const [viewerWhippedFrom, setViewerWhippedFrom] = useState<Record<string, string>>({});
  const [viewerIsBundestagMember, setViewerIsBundestagMember] = useState(false);

  const fetchGovernmentData = () => {
    fetchJson<ExecutiveGovernmentResponse>(`/api/country/${countryId.toLowerCase()}/executive`, {
      feature: "de-bundestag-government",
    })
      .then((data) => {
        if (!data) return;
        const snap = mapSnapElectionViewerState(data);
        setGovernmentStatus(data.government?.status ?? null);
        setViewerIsSittingPM(snap.viewerIsSittingPM);
        setSnapElectionsAllowed(snap.snapElectionsAllowed);
        setSnapElectionsUsed(snap.snapElectionsUsed);
        setSnapElectionsRemaining(snap.snapElectionsRemaining);
        setSnapCooldownTurnsRemaining(snap.snapCooldownTurnsRemaining);
        setActiveAppointmentVotes(data.activeAppointmentVotes ?? []);
        setActiveNoConfidenceVote(data.activeNoConfidenceVote ?? null);
        setViewerVotes(data.viewerVotes ?? {});
        setViewerWhippedFrom(data.viewerWhippedFrom ?? {});
        setViewerIsBundestagMember(data.viewerIsCommonsMp ?? false);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchGovernmentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId]);

  const isBundestag = activeChamber === "bundestag";
  const totalSeats = isBundestag ? 630 : 69;
  const subtitle = isBundestag
    ? "630 members · Mixed-Member Proportional · Germany"
    : "69 state delegates · Germany";

  const majorityParty = members?.composition[0];
  const headerStats = {
    majorityParty: {
      name: majorityParty?.partyName ?? "—",
      color: majorityParty?.partyColor ?? "#888888",
      seats: majorityParty?.seats ?? 0,
    },
    totalSeats: members?.totalSeats ?? totalSeats,
    leader: leaders?.primeMinister
      ? {
          label: "Chancellor",
          name: leaders.primeMinister.characterName,
          id: leaders.primeMinister.characterId,
          sequentialId: leaders.primeMinister.sequentialId,
        }
      : null,
    minorityLeader: leaders?.oppositionLeader
      ? {
          label: "Opposition leader",
          name: leaders.oppositionLeader.characterName,
          id: leaders.oppositionLeader.characterId,
          sequentialId: leaders.oppositionLeader.sequentialId,
        }
      : null,
  };

  const TABS: { id: PageTab; label: string }[] = [
    { id: "bills", label: "Bills" },
    { id: "composition", label: "Composition" },
    { id: "leadership", label: "Leadership" },
    { id: "tariffs", label: "Tariffs" },
    { id: "subsidies", label: "Subsidies" },
  ];

  return (
    <LegislaturePageShell
      loading={loading}
      error={error}
      onRetry={refetch}
      header={
        <LegislatureHeader
          countryId={countryId}
          title={isBundestag ? "Bundestag" : "Bundesrat"}
          subtitle={subtitle}
          heroImage={REICHSTAG_HERO.image}
          heroAlt={REICHSTAG_HERO.alt}
          stats={headerStats}
          chamberSwitcher={{
            active: activeChamber,
            onSwitch: (chamber) => {
              setActiveChamber(chamber);
              setActiveTab("bills");
            },
            options: CHAMBER_OPTIONS,
          }}
        />
      }
    >
      <LegislaturePageTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {bills?.adminOverride && (
          <div className="ml-auto pb-1">
            <AdminSnapElectionButton
              countryId={countryId}
              onDone={() => {
                refetch();
                fetchGovernmentData();
              }}
            />
          </div>
        )}
      </LegislaturePageTabs>

      {activeTab === "composition" && (
        <LegislatureMembersTab
          members={members}
          loading={loading}
          compositionOptions={{ includeAvatars: true }}
          chamberLabel={activeChamber === "bundesrat" ? "Bundesrat" : "Bundestag"}
          showSeatsColumn={true}
          regionLabel={getCountryConfig(countryId).regionLabel}
          searchPlaceholder={`Search ${activeChamber === "bundesrat" ? "Bundesrat" : "Bundestag"} members…`}
          countryId={countryId}
        />
      )}
      {activeTab === "bills" && (
        <BillsTab
          bills={bills}
          loading={loading}
          activeChamber={activeChamber}
          countryId={countryId}
          onProposed={refetch}
        />
      )}
      {activeTab === "leadership" && (
        <LeadershipTab
          leaders={leaders}
          loading={loading}
          countryId={countryId}
          governmentStatus={governmentStatus}
          viewerIsSittingPM={viewerIsSittingPM}
          snapElectionsAllowed={snapElectionsAllowed}
          snapElectionsUsed={snapElectionsUsed}
          snapElectionsRemaining={snapElectionsRemaining}
          snapCooldownTurnsRemaining={snapCooldownTurnsRemaining}
          activeAppointmentVotes={activeAppointmentVotes}
          activeNoConfidenceVote={activeNoConfidenceVote}
          viewerVotes={viewerVotes}
          viewerWhippedFrom={viewerWhippedFrom}
          viewerIsBundestagMember={viewerIsBundestagMember}
          onRefresh={() => {
            refetch();
            fetchGovernmentData();
          }}
        />
      )}
      {activeTab === "tariffs" && <TariffsTab countryId={countryId} />}
      {activeTab === "subsidies" && <SubsidiesTab countryId={countryId} />}
    </LegislaturePageShell>
  );
}
