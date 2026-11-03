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

import { useState } from "react";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { LegislatureMembersTab } from "./components/shared/LegislatureMembersTab";
import { BillsList } from "@/components/bills/BillsList";
import { BillListControls, type BillVoteFilter } from "@/components/bills/BillListControls";
import { ProposeLegislationModal } from "./ProposeLegislationModal";
import type { LegislatureBillStatusFilter } from "@/lib/legislature/billStatusFilters";
import LegislatureHeader from "./components/shared/LegislatureHeader";
import { NgChamberLeadershipPanel } from "./NgChamberLeadershipPanel";
import { useLegislatureData, type BillsData } from "./components/shared/useLegislatureData";

const NATIONAL_ASSEMBLY_HERO = {
  image: "/api/images/hero/national-assembly",
  alt: "The National Assembly Complex, Abuja",
};

type ChamberKey = "house" | "senate";
type PageTab = "composition" | "bills" | "leadership";

// ─── Bills Tab ────────────────────────────────────────────────────────────────

function BillsTab({
  bills,
  loading,
  countryId,
  activeChamber,
  chamberShortName,
  onProposed,
}: {
  bills: BillsData | null;
  loading: boolean;
  countryId: CountryId;
  activeChamber: ChamberKey;
  chamberShortName: string;
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
                ? "Admin — propose a bill"
                : "You are a seated member — propose a bill"}
            </p>
            <p className="text-xs text-muted">Opens to a vote among seated members immediately.</p>
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
          proposalWarning={proposalWarnings?.[activeChamber] ?? null}
          chambers={[{ value: activeChamber, label: chamberShortName }]}
          domesticOnlyLabel="Nigeria-headquartered corporations only"
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

function LeadershipTab({ countryId }: { countryId: CountryId }) {
  return (
    <div className="space-y-6">
      <NgChamberLeadershipPanel countryId={countryId} />
      <div className="rounded-xl border border-card-border/40 bg-card-muted/30 p-4">
        <p className="text-xs text-muted leading-relaxed">
          Presiding officers are elected by the members of their respective chambers. When an
          election is open, seated members can declare and vote here.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NGAssemblyPage({ countryId }: { countryId: CountryId }) {
  const [activeChamber, setActiveChamber] = useState<ChamberKey>("house");
  const [activeTab, setActiveTab] = useState<PageTab>("composition");
  const { members, bills, loading, error, refetch } = useLegislatureData(countryId, activeChamber);

  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  const lower = config.legislature.lowerChamber;
  const upper = config.legislature.upperChamber!;
  const chamberConfig = activeChamber === "house" ? lower : upper;

  const majorityParty = members?.composition[0];
  const headerStats = {
    majorityParty: {
      name: majorityParty?.partyName ?? "—",
      color: majorityParty?.partyColor ?? "#888888",
      seats: majorityParty?.seats ?? 0,
    },
    totalSeats: members?.totalSeats ?? chamberConfig.seats,
    leader: null,
    minorityLeader: null,
  };

  const TABS: { id: PageTab; label: string }[] = [
    { id: "composition", label: "Composition" },
    { id: "bills", label: "Bills" },
    { id: "leadership", label: "Leadership" },
  ];

  return (
    <LegislaturePageShell
      loading={loading}
      error={error}
      onRetry={refetch}
      header={
        <LegislatureHeader
          countryId={countryId}
          title={config.legislature.name}
          subtitle={`${chamberConfig.seats.toLocaleString("en-US")} seats · ${chamberConfig.description}`}
          heroImage={NATIONAL_ASSEMBLY_HERO.image}
          heroAlt={NATIONAL_ASSEMBLY_HERO.alt}
          stats={headerStats}
          chamberSwitcher={{
            active: activeChamber,
            onSwitch: (chamber) => {
              setActiveChamber(chamber as ChamberKey);
              setActiveTab("composition");
            },
            options: [
              { key: "house", label: lower.shortName },
              { key: "senate", label: upper.shortName },
            ],
          }}
        />
      }
    >
      <LegislaturePageTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      ></LegislaturePageTabs>

      {activeTab === "composition" && (
        <LegislatureMembersTab
          members={members}
          loading={loading}
          compositionOptions={{
            memberId: (m) => m.characterId || `npp-${m.party}-${m.constituency}`,
          }}
          chamberLabel={chamberConfig.name}
          showSeatsColumn={true}
          regionLabel="Zone"
          searchPlaceholder="Search parties…"
          countryId={countryId}
        />
      )}
      {activeTab === "bills" && (
        <BillsTab
          bills={bills}
          loading={loading}
          countryId={countryId}
          activeChamber={activeChamber}
          chamberShortName={chamberConfig.shortName}
          onProposed={refetch}
        />
      )}
      {activeTab === "leadership" && <LeadershipTab countryId={countryId} />}
    </LegislaturePageShell>
  );
}
