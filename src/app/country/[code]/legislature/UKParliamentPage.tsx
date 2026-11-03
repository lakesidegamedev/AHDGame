"use client";

import {
  LegislatureRowsSkeleton,
  LegislaturePageShell,
  LegislaturePageTabs,
} from "./components/shared/LegislaturePageShell";

import {
  legislatureCompositionData,
  LEGISLATURE_STATUS_FILTERS,
  filterLegislatureBills,
} from "./components/shared/legislaturePresentation";

import { useState, useEffect, useMemo } from "react";
import { useUKParliamentPageState } from "./useUKParliamentPageState";
import { LegislatureCompositionSection } from "@/components/legislature/LegislatureCompositionSection";
import { useToast } from "@/contexts/ToastContext";
import { TariffsTab } from "@/components/legislature/TariffsTab";
import { SubsidiesTab } from "@/components/legislature/SubsidiesTab";
import { LeaderCard } from "@/components/legislature/LeaderCard";
import { BillsList } from "@/components/bills/BillsList";
import { BillListControls, type BillVoteFilter } from "@/components/bills/BillListControls";
import type { CountryId } from "@/lib/constants/countriesCore";
import LegislatureHeader from "./components/shared/LegislatureHeader";
import {
  useLegislatureData,
  type MembersData,
  type BillsData,
  type LeadersData,
} from "./components/shared/useLegislatureData";
import GovernmentVotePanel from "@/components/uk/GovernmentVotePanel";
import { useImperialPossessive } from "@/hooks/useImperialPossessive";
import AppointPMModal from "@/components/uk/AppointPMModal";
import { PMSnapElectionButton } from "@/components/parliamentary/PMSnapElectionButton";
import { AdminSnapElectionButton } from "@/components/parliamentary/AdminSnapElectionButton";
import type { LegislatureBillStatusFilter } from "@/lib/legislature/billStatusFilters";
import type {
  AppointmentVotePayload,
  NoConfidenceVotePayload,
} from "@/types/parliamentaryGovernment";
import { ProposeLegislationModal } from "./ProposeLegislationModal";
import { CommonsVacancyPanel } from "@/components/uk/CommonsVacancyPanel";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { ExecutiveGovernmentResponse } from "@/lib/government/executiveViewerState";
import { apiErrorText } from "@/lib/errors/catalog";

const COMMONS_HERO = {
  image:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/PalaceOfWestminsterAtNight.jpg/1280px-PalaceOfWestminsterAtNight.jpg",
  alt: "The Palace of Westminster at night, seen from the south bank of the River Thames.",
};

type PageTab = "composition" | "bills" | "leadership" | "vacancies" | "tariffs" | "subsidies";

// ─── Composition Tab ──────────────────────────────────────────────────────────

type GovernmentData = {
  status: "pending" | "formed";
  formationType: "majority" | "coalition" | "minority" | "admin" | null;
  lostMajority: boolean;
  pmName: string | null;
  pmCharacterId: string | null;
  governingPartyId: string | null;
  coalitionPartyIds: string[] | null;
} | null;

function CompositionTab({
  members,
  loading,
  countryId,
  government,
}: {
  members: MembersData | null;
  loading: boolean;
  countryId: CountryId;
  government: GovernmentData;
}) {
  const governmentContext = useMemo(() => {
    if (!government || government.status !== "formed" || !members) return undefined;

    const governingParties = new Set<string>();
    if (government.governingPartyId) governingParties.add(government.governingPartyId);
    if (government.coalitionPartyIds) {
      government.coalitionPartyIds.forEach((id) => governingParties.add(id));
    }

    const oppositionParties = members.composition
      .filter((c) => !governingParties.has(c.partyId))
      .sort((a, b) => b.seats - a.seats);

    return {
      governingParties,
      officialOpposition: oppositionParties[0]?.partyId,
      additionalOpposition: oppositionParties.slice(1, 3).map((p) => p.partyId),
    };
  }, [government, members]);

  if (loading) {
    return <LegislatureRowsSkeleton kind="members" />;
  }

  if (!members) {
    return <p className="text-center text-sm text-muted py-12">Composition data unavailable.</p>;
  }

  const compositionData = legislatureCompositionData(members, countryId, { includeAvatars: true });

  return (
    <LegislatureCompositionSection
      data={compositionData}
      chamberLabel="House of Commons"
      showSeatsColumn={true}
      regionLabel="Constituency"
      searchPlaceholder="Search MPs..."
      countryId={countryId}
      parliamentChartVariant="westminster"
      governmentContext={governmentContext}
    />
  );
}

// ─── Bills Tab ────────────────────────────────────────────────────────────────

function BillsTab({
  bills,
  loading,
  countryId,
  onProposed,
}: {
  bills: BillsData | null;
  loading: boolean;
  countryId: CountryId;
  onProposed: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [voteFilter, setVoteFilter] = useState<BillVoteFilter>("all");
  const [statusFilter, setStatusFilter] = useState<LegislatureBillStatusFilter>("all");

  if (loading) {
    return <LegislatureRowsSkeleton kind="bills" />;
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

  const filtered = filterLegislatureBills(billList, voteFilter, statusFilter);

  return (
    <div className="space-y-4">
      {(canPropose || hasActiveBill) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {adminOverride
                ? "Admin — propose a Commons bill"
                : "You are a seated MP — propose a bill"}
            </p>
            <p className="text-xs text-muted">Opens to a vote among seated MPs immediately.</p>
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
        statusFilter={statusFilter}
        statusFilterOptions={LEGISLATURE_STATUS_FILTERS}
        onStatusFilterChange={(filter) => setStatusFilter(filter as LegislatureBillStatusFilter)}
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
          proposalWarning={proposalWarnings?.commons ?? null}
          chambers={[{ value: "commons", label: "House of Commons" }]}
          domesticOnlyLabel="British-headquartered corporations only"
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
  government,
  activeAppointmentVotes,
  activeNoConfidenceVote,
  viewerMayAppoint,
  viewerMayProposeNoConfidence,
  noConfidenceCooldownTurns,
  viewerIsCommonsMp,
  viewerVotes,
  viewerWhippedFrom,
  viewerIsSittingPM,
  snapElectionsAllowed,
  snapElectionsUsed,
  snapElectionsRemaining,
  snapCooldownTurnsRemaining,
  onRefresh,
}: {
  leaders: LeadersData | null;
  loading: boolean;
  countryId: CountryId;
  government: GovernmentData;
  activeAppointmentVotes: AppointmentVotePayload[];
  activeNoConfidenceVote: NoConfidenceVotePayload | null;
  viewerMayAppoint: boolean;
  viewerMayProposeNoConfidence: boolean;
  noConfidenceCooldownTurns: number | null;
  viewerIsCommonsMp: boolean;
  viewerVotes: Record<string, "aye" | "nay">;
  viewerWhippedFrom: Record<string, string>;
  viewerIsSittingPM: boolean;
  snapElectionsAllowed: boolean;
  snapElectionsUsed: number;
  snapElectionsRemaining: number;
  snapCooldownTurnsRemaining: number;
  onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const imperialPossessive = useImperialPossessive(countryId);
  const [appointModalOpen, setAppointModalOpen] = useState(false);
  const [noConfirmOpen, setNoConfirmOpen] = useState(false);
  const [proposingNoConfidence, setProposingNoConfidence] = useState(false);

  async function handleProposeNoConfidence() {
    setProposingNoConfidence(true);
    setNoConfirmOpen(false);
    try {
      const res = await fetch(`/api/country/${countryId.toLowerCase()}/pm/no-confidence`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(apiErrorText(data, "Failed to propose no-confidence motion."), "error");
      } else {
        showToast("No-confidence motion proposed.", "success");
        onRefresh();
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      setProposingNoConfidence(false);
    }
  }

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
      {government?.status === "pending" && viewerMayAppoint && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Government pending formation</p>
            <p className="text-xs text-muted">
              As party or coalition chair, you may nominate a PM.
            </p>
          </div>
          <button
            onClick={() => setAppointModalOpen(true)}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Appoint prime minister
          </button>
        </div>
      )}

      {government?.status === "formed" && viewerIsSittingPM && snapElectionsAllowed && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Dissolve parliament</p>
              <p className="text-xs text-muted">
                As Prime Minister, you may call a snap election. All active legislation will fail.
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

      {government?.status === "formed" && viewerIsCommonsMp && !activeNoConfidenceVote && (
        <div className="flex items-center justify-between rounded-xl border border-warning/20 bg-warning/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Propose a no-confidence motion</p>
            <p className="text-xs text-muted">
              {noConfidenceCooldownTurns && noConfidenceCooldownTurns > 0
                ? `Cooldown: ${noConfidenceCooldownTurns} turn${noConfidenceCooldownTurns === 1 ? "" : "s"} remaining`
                : "As an elected MP you may challenge the sitting Prime Minister."}
            </p>
          </div>
          {noConfidenceCooldownTurns && noConfidenceCooldownTurns > 0 ? (
            <button
              disabled
              title={`No-confidence cooldown: ${noConfidenceCooldownTurns} turn${noConfidenceCooldownTurns === 1 ? "" : "s"} remaining`}
              className="shrink-0 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2 text-sm font-semibold text-warning/40 cursor-not-allowed opacity-50"
            >
              Propose no-confidence
            </button>
          ) : noConfirmOpen ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-warning">Are you sure?</span>
              <button
                onClick={handleProposeNoConfidence}
                disabled={proposingNoConfidence || !viewerMayProposeNoConfidence}
                className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-black hover:bg-warning/90 disabled:opacity-50 transition-colors"
              >
                {proposingNoConfidence ? "Proposing…" : "Confirm"}
              </button>
              <button
                onClick={() => setNoConfirmOpen(false)}
                className="rounded-lg border border-card-border px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setNoConfirmOpen(true)}
              disabled={!viewerMayProposeNoConfidence}
              className="shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning hover:bg-warning/20 disabled:opacity-50 transition-colors"
            >
              Propose no-confidence
            </button>
          )}
        </div>
      )}

      {activeAppointmentVotes.map((vote) => (
        <GovernmentVotePanel
          key={vote._id}
          vote={vote}
          countryCode={countryId.toLowerCase()}
          canVote={viewerIsCommonsMp}
          viewerVote={viewerVotes[vote._id] ?? null}
          myWhippedFrom={viewerWhippedFrom[vote._id] ?? null}
          onVoteCast={onRefresh}
        />
      ))}

      {activeNoConfidenceVote && (
        <GovernmentVotePanel
          vote={activeNoConfidenceVote}
          countryCode={countryId.toLowerCase()}
          canVote={viewerIsCommonsMp}
          viewerVote={viewerVotes[activeNoConfidenceVote._id] ?? null}
          myWhippedFrom={viewerWhippedFrom[activeNoConfidenceVote._id] ?? null}
          onVoteCast={onRefresh}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <LeaderCard
          title="Prime minister"
          subtitle={`Head of ${imperialPossessive} Government`}
          character={leaders.primeMinister}
        />
        <LeaderCard
          title="Leader of the opposition"
          subtitle="Leader of the largest non-governing party"
          character={leaders.oppositionLeader}
        />
      </div>
      {leaders.speaker && (
        <LeaderCard
          title="Speaker of the House"
          subtitle="Presides over Commons debates"
          character={leaders.speaker}
        />
      )}
      <div className="rounded-xl border border-card-border/40 bg-card-muted/30 p-4">
        <p className="text-xs text-muted leading-relaxed">
          The Prime Minister is the leader of the party commanding a majority in the House of
          Commons. The Opposition Leader is the chair of the largest non-governing party. Other
          parliamentary roles (Whips, Cabinet) are managed through the UK government system.
        </p>
      </div>

      <AppointPMModal
        countryCode={countryId.toLowerCase()}
        open={appointModalOpen}
        onClose={() => setAppointModalOpen(false)}
        onSuccess={() => {
          setAppointModalOpen(false);
          onRefresh();
        }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UKParliamentPage({ countryId }: { countryId: CountryId }) {
  const { members, bills, leaders, loading, error, refetch } = useLegislatureData(
    countryId,
    "commons"
  );
  const [activeTab, setActiveTab] = useState<PageTab>("bills");

  // Government formation data for Leadership tab
  const {
    government,
    activeAppointmentVotes,
    activeNoConfidenceVote,
    viewerMayAppoint,
    viewerMayProposeNoConfidence,
    noConfidenceCooldownTurns,
    viewerIsCommonsMp,
    viewerVotes,
    viewerWhippedFrom,
    viewerIsSittingPM,
    snapElectionsAllowed,
    snapElectionsUsed,
    snapElectionsRemaining,
    snapCooldownTurnsRemaining,
    syncGovernmentData,
  } = useUKParliamentPageState();

  const fetchGovernmentData = () => {
    fetchJson<ExecutiveGovernmentResponse>(`/api/country/${countryId.toLowerCase()}/executive`, {
      feature: "uk-parliament-government",
    })
      .then((data) => {
        if (!data) return;
        syncGovernmentData(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchGovernmentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId]);

  const majorityParty = members?.composition[0];
  const headerStats = {
    majorityParty: {
      name: majorityParty?.partyName ?? "—",
      color: majorityParty?.partyColor ?? "#888888",
      seats: majorityParty?.seats ?? 0,
    },
    totalSeats: members?.totalSeats ?? 0,
    leader: leaders?.primeMinister
      ? {
          label: "Prime minister",
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
    { id: "vacancies", label: "Vacancies" },
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
          title="House of Commons"
          subtitle={
            headerStats.totalSeats > 0
              ? `${headerStats.totalSeats} elected MPs · First Past the Post · United Kingdom`
              : "First past the post · United Kingdom"
          }
          heroImage={COMMONS_HERO.image}
          heroAlt={COMMONS_HERO.alt}
          stats={headerStats}
          chamberSwitcher={{
            active: "commons",
            onSwitch: () => {},
            options: [
              {
                key: "lords",
                label: "Lords",
                disabled: true,
                title: "The House of Lords is not yet implemented",
              },
              { key: "commons", label: "Commons" },
            ],
          }}
        />
      }
    >
      <LegislaturePageTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {bills?.adminOverride && (
          <div className="ml-auto pb-1">
            <AdminSnapElectionButton countryId={countryId} onDone={refetch} />
          </div>
        )}
      </LegislaturePageTabs>

      {activeTab === "composition" && (
        <CompositionTab
          members={members}
          loading={loading}
          countryId={countryId}
          government={government}
        />
      )}
      {activeTab === "bills" && (
        <BillsTab bills={bills} loading={loading} countryId={countryId} onProposed={refetch} />
      )}
      {activeTab === "leadership" && (
        <LeadershipTab
          leaders={leaders}
          loading={loading}
          countryId={countryId}
          government={government}
          activeAppointmentVotes={activeAppointmentVotes}
          activeNoConfidenceVote={activeNoConfidenceVote}
          viewerMayAppoint={viewerMayAppoint}
          viewerMayProposeNoConfidence={viewerMayProposeNoConfidence}
          noConfidenceCooldownTurns={noConfidenceCooldownTurns}
          viewerIsCommonsMp={viewerIsCommonsMp}
          viewerVotes={viewerVotes}
          viewerWhippedFrom={viewerWhippedFrom}
          viewerIsSittingPM={viewerIsSittingPM}
          snapElectionsAllowed={snapElectionsAllowed}
          snapElectionsUsed={snapElectionsUsed}
          snapElectionsRemaining={snapElectionsRemaining}
          snapCooldownTurnsRemaining={snapCooldownTurnsRemaining}
          onRefresh={() => {
            refetch();
            fetchGovernmentData();
          }}
        />
      )}
      {activeTab === "vacancies" && <CommonsVacancyPanel countryId={countryId} />}
      {activeTab === "tariffs" && <TariffsTab countryId={countryId} />}
      {activeTab === "subsidies" && <SubsidiesTab countryId={countryId} />}
    </LegislaturePageShell>
  );
}
