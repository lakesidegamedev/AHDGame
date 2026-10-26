"use client";

import {
  LegislatureRowsSkeleton,
  LegislaturePageShell,
  LegislaturePageTabs,
} from "./components/shared/LegislaturePageShell";

import {
  LEGISLATURE_STATUS_FILTERS,
  filterLegislatureBills,
} from "./components/shared/legislaturePresentation";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BillsList } from "@/components/bills/BillsList";
import { BillListControls, type BillVoteFilter } from "@/components/bills/BillListControls";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { LegislatureMembersTab } from "./components/shared/LegislatureMembersTab";
import { TariffsTab } from "@/components/legislature/TariffsTab";
import { SubsidiesTab } from "@/components/legislature/SubsidiesTab";
import LegislatureHeader from "./components/shared/LegislatureHeader";
import { useLegislatureData, type LeadersData } from "./components/shared/useLegislatureData";
import type { LegislatureBillStatusFilter } from "@/lib/legislature/billStatusFilters";
import { ProposeLegislationModal } from "./ProposeLegislationModal";
import { ParliamentaryGovernmentActions } from "@/app/country/[code]/executive/components/ParliamentaryGovernmentActions";
import { fetchJson } from "@/lib/observability/fetchJson";
import type {
  AppointmentVotePayload,
  NoConfidenceVotePayload,
} from "@/types/parliamentaryGovernment";

type PageTab = "composition" | "bills" | "leadership" | "tariffs" | "subsidies";

/** The two contested Supreme Soviet chambers (D8). */
type RuChamberKey = "sovietOfTheUnion" | "sovietOfNationalities";

/**
 * Government-formation state for the Leadership tab, sourced from
 * `/api/country/ru/executive`. `hosName` is the legislature-appointed
 * Chairman of the Presidium (spec §2.3) — null when the office is vacant.
 */
type GovernmentData = {
  status: "pending" | "formed";
  pmName: string | null;
  formationType: string | null;
  hosName?: string | null;
} | null;

// ─── Bills Tab ────────────────────────────────────────────────────────────────

function BillsTab({
  bills,
  loading,
  countryId,
  onProposed,
}: {
  bills: import("./components/shared/useLegislatureData").BillsData | null;
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
                ? "Admin — propose an NPC bill"
                : "You are a seated deputy — propose a bill"}
            </p>
            <p className="text-xs text-muted">
              A bill must clear both chambers of the Supreme Soviet to become law.
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
          proposalWarning={proposalWarnings?.sovietOfTheUnion ?? null}
          chambers={[
            { value: "sovietOfTheUnion", label: "Soviet of the Union" },
            { value: "sovietOfNationalities", label: "Soviet of nationalities" },
          ]}
          domesticOnlyLabel="Soviet-headquartered enterprises only"
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

function LeaderCard({
  label,
  emptyLabel,
  character,
}: {
  label: string;
  emptyLabel: string;
  character: LeadersData["primeMinister"];
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <p className="text-body-sm font-medium text-muted mb-2">{label}</p>
      {character ? (
        <div className="flex items-center gap-3">
          <Avatar
            url={character.avatarUrl}
            name={character.characterName}
            size="h-12 w-12"
            className="rounded-lg"
          />
          <Link
            href={`/character/${character.sequentialId ?? character.characterId}`}
            className="font-semibold hover:text-primary transition-colors"
          >
            {character.characterName}
          </Link>
        </div>
      ) : (
        <p className="text-sm italic text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

function LeadershipTab({
  countryId,
  leaders,
  loading,
  government,
  activeAppointmentVotes,
  activeNoConfidenceVote,
  viewerMayAppoint,
  viewerIsDeputy,
  viewerMayProposeNoConfidence,
  noConfidenceCooldownTurns,
  viewerVotes,
  viewerWhippedFrom,
}: {
  countryId: CountryId;
  leaders: LeadersData | null;
  loading: boolean;
  government: GovernmentData;
  activeAppointmentVotes: AppointmentVotePayload[];
  activeNoConfidenceVote: NoConfidenceVotePayload | null;
  viewerMayAppoint: boolean;
  viewerIsDeputy: boolean;
  viewerMayProposeNoConfidence: boolean;
  noConfidenceCooldownTurns: number | null;
  viewerVotes: Record<string, "aye" | "nay">;
  viewerWhippedFrom: Record<string, string>;
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

  return (
    <div className="space-y-6">
      <ParliamentaryGovernmentActions
        countryCode={countryId.toLowerCase()}
        governmentStatus={government?.status ?? null}
        activeAppointmentVotes={activeAppointmentVotes}
        activeNoConfidenceVote={activeNoConfidenceVote}
        viewerMayAppoint={viewerMayAppoint}
        viewerIsCommonsMp={viewerIsDeputy}
        viewerMayProposeNoConfidence={viewerMayProposeNoConfidence}
        noConfidenceCooldownTurns={noConfidenceCooldownTurns}
        viewerVotes={viewerVotes}
        viewerWhippedFrom={viewerWhippedFrom}
        executiveTitle="Premier"
        memberLabel="Supreme Soviet Deputy"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <LeaderCard
          label="Premier"
          emptyLabel="No Premier"
          character={leaders?.primeMinister ?? null}
        />
        <div className="rounded-xl border border-card-border bg-card p-5">
          <p className="text-body-sm font-medium text-muted mb-2">Chairman of the Presidium</p>
          {government?.hosName ? (
            <p className="font-semibold">{government.hosName}</p>
          ) : (
            <p className="text-sm italic text-muted">Vacant — awaiting election by the chambers</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-card-border/40 bg-card-muted/30 p-4">
        <p className="text-xs text-muted leading-relaxed">
          The Premier (Chairman of the Council of Ministers) is nominated by a qualifying party
          chair and confirmed by a vote of seated deputies of the Soviet of the Union. The Chairman
          of the Presidium — the ceremonial head of state — is elected by a joint sitting of both
          chambers; nominations open on the{" "}
          <Link
            href={`/country/${countryId.toLowerCase()}/executive`}
            className="underline hover:text-foreground transition-colors"
          >
            executive page
          </Link>{" "}
          whenever the office falls vacant. The Presidium acts for the Supreme Soviet between
          sessions.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Legislature page for the Supreme Soviet of the USSR (spec §4): both
 * contested chambers (D8) behind a chamber toggle — the Soviet of the Union
 * (population-apportioned) and the Soviet of Nationalities
 * (republic-weighted, D11) — with the shared bills/leadership machinery.
 */
export function RUSupremeSovietPage({ countryId }: { countryId: CountryId }) {
  const [chamberKey, setChamberKey] = useState<RuChamberKey>("sovietOfTheUnion");
  const { members, bills, leaders, loading, error, refetch } = useLegislatureData(
    countryId,
    chamberKey
  );
  const [activeTab, setActiveTab] = useState<PageTab>("bills");

  // Government-formation state for the Leadership tab (shared executive
  // endpoint — the legislature page and the executive hub agree on
  // appointment/no-confidence eligibility).
  const [government, setGovernment] = useState<GovernmentData>(null);
  const [activeAppointmentVotes, setActiveAppointmentVotes] = useState<AppointmentVotePayload[]>(
    []
  );
  const [activeNoConfidenceVote, setActiveNoConfidenceVote] =
    useState<NoConfidenceVotePayload | null>(null);
  const [viewerMayAppoint, setViewerMayAppoint] = useState(false);
  const [viewerIsDeputy, setViewerIsDeputy] = useState(false);
  const [viewerMayProposeNoConfidence, setViewerMayProposeNoConfidence] = useState(false);
  const [noConfidenceCooldownTurns, setNoConfidenceCooldownTurns] = useState<number | null>(null);
  const [viewerVotes, setViewerVotes] = useState<Record<string, "aye" | "nay">>({});
  const [viewerWhippedFrom, setViewerWhippedFrom] = useState<Record<string, string>>({});

  const fetchGovernmentData = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchJson<any>(`/api/country/${countryId.toLowerCase()}/executive`, {
      cache: "no-store",
      feature: "ru-supreme-soviet-government",
    })
      .then((data) => {
        if (!data) return;
        setGovernment(data.government ?? null);
        setActiveAppointmentVotes(data.activeAppointmentVotes ?? []);
        setActiveNoConfidenceVote(data.activeNoConfidenceVote ?? null);
        setViewerMayAppoint(Boolean(data.viewerMayAppoint));
        setViewerIsDeputy(Boolean(data.viewerIsCommonsMp));
        setViewerMayProposeNoConfidence(Boolean(data.viewerMayProposeNoConfidence));
        setNoConfidenceCooldownTurns(data.noConfidenceCooldownTurns ?? null);
        setViewerVotes(data.viewerVotes ?? {});
        setViewerWhippedFrom(data.viewerWhippedFrom ?? {});
      })
      .catch(() => {});
  }, [countryId]);

  useEffect(() => {
    fetchGovernmentData();
  }, [fetchGovernmentData]);

  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  const lowerChamber = config.legislature.lowerChamber;
  const upperChamber = config.legislature.upperChamber;
  const activeChamber =
    chamberKey === "sovietOfTheUnion" ? lowerChamber : (upperChamber ?? lowerChamber);

  const majorityParty = members?.composition[0];
  const headerStats = {
    majorityParty: {
      name: majorityParty?.partyName ?? "—",
      color: majorityParty?.partyColor ?? "#888888",
      seats: majorityParty?.seats ?? 0,
    },
    totalSeats: members?.totalSeats ?? activeChamber.seats,
    // `leaders.primeMinister` is the head of government (the Premier) — the
    // ceremonial Chairman of the Presidium is surfaced on the Leadership tab.
    leader: leaders?.primeMinister
      ? {
          label: "Premier",
          name: leaders.primeMinister.characterName,
          id: leaders.primeMinister.characterId,
          sequentialId: leaders.primeMinister.sequentialId,
        }
      : null,
    // The Supreme Soviet has no minority-leader office — omit the cell.
    minorityLeader: undefined,
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
          title="Supreme Soviet"
          subtitle={`${activeChamber.name} · ${activeChamber.description}`}
          heroImage="/api/images/hero/grand-kremlin-palace"
          heroAlt="The Grand Kremlin Palace, Moscow — where the Supreme Soviet convenes"
          stats={headerStats}
        />
      }
    >
      {/* Chamber toggle — both Supreme Soviet chambers are contested (D8);
            composition and bills scope to the selected chamber. */}
      <div className="mb-4 inline-flex rounded-lg border border-card-border bg-card p-1">
        {(
          [
            { key: "sovietOfTheUnion", label: lowerChamber.shortName },
            ...(upperChamber
              ? [{ key: "sovietOfNationalities", label: upperChamber.shortName }]
              : []),
          ] as { key: RuChamberKey; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setChamberKey(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              chamberKey === key ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <LegislaturePageTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      ></LegislaturePageTabs>

      {activeTab === "composition" && (
        <LegislatureMembersTab
          members={members}
          loading={loading}
          chamberLabel={activeChamber.name}
          showSeatsColumn={true}
          regionLabel="Republic"
          searchPlaceholder="Search deputies…"
          countryId={countryId}
        />
      )}
      {activeTab === "bills" && (
        <BillsTab bills={bills} loading={loading} countryId={countryId} onProposed={refetch} />
      )}
      {activeTab === "leadership" && (
        <LeadershipTab
          countryId={countryId}
          leaders={leaders}
          loading={loading}
          government={government}
          activeAppointmentVotes={activeAppointmentVotes}
          activeNoConfidenceVote={activeNoConfidenceVote}
          viewerMayAppoint={viewerMayAppoint}
          viewerIsDeputy={viewerIsDeputy}
          viewerMayProposeNoConfidence={viewerMayProposeNoConfidence}
          noConfidenceCooldownTurns={noConfidenceCooldownTurns}
          viewerVotes={viewerVotes}
          viewerWhippedFrom={viewerWhippedFrom}
        />
      )}
      {activeTab === "tariffs" && <TariffsTab countryId={countryId} />}
      {activeTab === "subsidies" && <SubsidiesTab countryId={countryId} />}
    </LegislaturePageShell>
  );
}
