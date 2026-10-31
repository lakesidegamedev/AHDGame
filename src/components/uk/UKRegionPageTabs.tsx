"use client";

import dynamic from "next/dynamic";
import { RegionTabNav, type SuperTabId } from "@/components/state/RegionTabNav";
import { countryUrl } from "@/lib/urls";
import { RegionReferendumCampaign } from "./RegionReferendumCampaign";
import { OverviewTab } from "@/components/state/StatePageTabsOverview";
import { TabFallback } from "@/components/state/TabFallback";

// Every tab below the default Overview is its own chunk, the same way the
// country-region shell does it. Importing them statically here shipped all of
// them on a first paint that renders one, and only for the UK branch of a page
// most visitors reach as a US state.
const UKRegionPageTabsPolitics = dynamic(
  () => import("./UKRegionPageTabsPolitics").then((m) => ({ default: m.UKRegionPageTabsPolitics })),
  { loading: TabFallback }
);
const RegionPartiesTab = dynamic(
  () =>
    import("@/components/region/RegionPartiesTab").then((m) => ({ default: m.RegionPartiesTab })),
  { loading: TabFallback }
);
const StateElections = dynamic(
  () => import("@/components/StateElections").then((m) => ({ default: m.StateElections })),
  { loading: TabFallback }
);
const StateEconomy = dynamic(
  () => import("@/components/state/StateEconomy").then((m) => ({ default: m.StateEconomy })),
  { loading: TabFallback }
);
const StateBudgetSection = dynamic(
  () =>
    import("@/components/budget/StateBudgetSection").then((m) => ({
      default: m.StateBudgetSection,
    })),
  { loading: TabFallback }
);
const ResourcesTab = dynamic(
  () =>
    import("@/components/state/StatePageTabsResources").then((m) => ({ default: m.ResourcesTab })),
  { loading: TabFallback }
);
const RegionMetricsTab = dynamic(
  () =>
    import("@/components/state/RegionMetricsTab").then((m) => ({ default: m.RegionMetricsTab })),
  { loading: TabFallback }
);
const DemographicsAndTurnoutTab = dynamic(
  () =>
    import("@/components/state/StatePageTabsDemographicsAndTurnout").then((m) => ({
      default: m.DemographicsAndTurnoutTab,
    })),
  { loading: TabFallback }
);
const UKRegionPageTabsMetrics = dynamic(
  () => import("./UKRegionPageTabsMetrics").then((m) => ({ default: m.UKRegionPageTabsMetrics })),
  { loading: TabFallback }
);
const LawsTab = dynamic(
  () => import("@/components/state/StatePageTabsLaws").then((m) => ({ default: m.LawsTab })),
  { loading: TabFallback }
);
const AdminTab = dynamic(
  () => import("@/components/state/StatePageTabsAdmin").then((m) => ({ default: m.AdminTab })),
  { loading: TabFallback }
);
import type { StateOverviewResult } from "@/lib/states/overview/types";
import type { ActiveModifier } from "@/lib/utils/approvalModifiers";
import type { UKRegion } from "@/lib/constants/uk";
import type { State, StateDemographics, DemographicCategory } from "@/lib/db/types";
import type {
  PartyOrgDisplay,
  SerializedPlayer,
  NPPDisplaySimple,
} from "@/components/state/StatePageTabsTypes";
import type { RegionCensus } from "@/lib/seeds/regionCensusData";
import type { SerializedMP } from "@/app/uk/region/[regionId]/UKRegionClient";
import type { BucketProfileSection } from "@/lib/demographics/bucketProfile";

interface UKRegionPageTabsProps {
  region: UKRegion;
  state:
    | (Pick<
        State,
        | "_id"
        | "name"
        | "population"
        | "gdp"
        | "houseDistricts"
        | "cachedEconomicLean"
        | "cachedSocialLean"
      > & {
        population: number;
        gdp: number;
        houseDistricts: number;
      })
    | null;
  demographics: (Omit<StateDemographics, "lastUpdated"> & { lastUpdated: string | null }) | null;
  categories: DemographicCategory[];
  censusData: RegionCensus | null;
  partyOrg: PartyOrgDisplay[];
  calculatedLeans: { economicLean: number; socialLean: number } | null;
  turnoutData?: {
    stateId: string;
    /** census dimension → bucket → cell (see `buildRegionTurnoutResponse`). */
    turnout: Record<string, Record<string, { baseline: number; modifier: number; actual: number }>>;
    lastUpdated: string | null;
    lastDecayApplied: string | null;
  } | null;
  /** Per-bucket electorate profile for the Demographics tab (server-derived). */
  bucketProfile?: BucketProfileSection[] | null;
  mps?: SerializedMP[];
  players?: SerializedPlayer[];
  npps?: NPPDisplaySimple[];
  isAdmin?: boolean;
  overview?: StateOverviewResult;
  viewerPartyId?: string | null;
  regionalConditionsOverviewEnabled?: boolean;
  approvalModifiersForOverview?: ActiveModifier[];
  regionGovernmentApproval?: number | null;
  regionApprovalBase?: number | null;
}

export function UKRegionPageTabs({
  region,
  state,
  demographics,
  categories,
  censusData,
  partyOrg,
  calculatedLeans,
  turnoutData,
  bucketProfile = null,
  mps = [],
  players = [],
  npps = [],
  isAdmin = false,
  overview,
  viewerPartyId,
  regionalConditionsOverviewEnabled = false,
  approvalModifiersForOverview = [],
  regionGovernmentApproval = null,
  regionApprovalBase = null,
}: UKRegionPageTabsProps) {
  const stateForTabs = state
    ? {
        _id: state._id,
        name: state.name,
        countryId: "UK" as const,
        population: state.population,
        gdp: state.gdp,
        houseDistricts: state.houseDistricts,
        cachedEconomicLean: state.cachedEconomicLean,
        cachedSocialLean: state.cachedSocialLean,
      }
    : null;

  const renderContent = (superTab: SuperTabId, subTab: string) => {
    // ── Overview ──
    if (superTab === "overview") {
      return overview ? (
        <OverviewTab
          overview={overview}
          viewerPartyId={viewerPartyId ?? null}
          regionalConditionsOverviewEnabled={regionalConditionsOverviewEnabled}
          approvalModifiersForOverview={approvalModifiersForOverview}
          regionGovernmentApproval={regionGovernmentApproval}
          regionApprovalBase={regionApprovalBase}
        />
      ) : (
        <div className="rounded-xl border border-card-border bg-card p-6 text-sm text-muted">
          Overview data not yet available for this region. Try the Politics or Economy tab in the
          meantime.
        </div>
      );
    }

    // ── Politics ──
    if (superTab === "politics") {
      if (subTab === "officials" || subTab === "") {
        return (
          <UKRegionPageTabsPolitics
            region={region}
            state={stateForTabs}
            partyOrg={partyOrg}
            calculatedLeans={calculatedLeans}
            mps={mps}
            players={players}
            npps={npps}
          />
        );
      }
      if (subTab === "parties") {
        return (
          <RegionPartiesTab
            countryId="UK"
            regionId={region.id}
            regionName={region.name}
            partyOrg={partyOrg}
            config={{
              description:
                "Organization is each party's share of the ground game in this region. Party officers grow it with Build Organization, which spends Political Strength (PS). A party that stops building here slowly loses share.",
              emptyStateHint:
                "Party organization data will appear when the UK simulation is fully active.",
              emptyStateLink: { href: countryUrl("UK"), label: "Browse UK overview →" },
            }}
          />
        );
      }
      if (subTab === "elections") {
        return (
          <StateElections
            stateId={stateForTabs?._id ?? region.id}
            stateName={stateForTabs?.name ?? region.name}
            countryId="UK"
          />
        );
      }
    }

    // ── Economy ──
    if (superTab === "economy") {
      if (subTab === "sectors" || subTab === "") {
        return <StateEconomy stateId={stateForTabs?._id ?? region.id} countryId="UK" />;
      }
      if (subTab === "budget") {
        return (
          <StateBudgetSection
            stateId={stateForTabs?._id ?? region.id}
            countryId="UK"
            regionCode={stateForTabs?._id ?? region.id}
          />
        );
      }
      if (subTab === "resources") {
        return (
          <ResourcesTab stateId={stateForTabs?._id ?? region.id} countryId="UK" isAdmin={isAdmin} />
        );
      }
    }

    // ── Metrics ──
    // Same registry the other region pages get. UK is one of the four board
    // countries, so leaving it behind would be exactly the inconsistency the
    // promotion set out to remove.
    if (superTab === "metrics") {
      return (
        <RegionMetricsTab
          countryId="UK"
          regionId={stateForTabs?._id ?? region.id}
          regionName={stateForTabs?.name ?? region.name}
        />
      );
    }

    // ── Demographics ──
    if (superTab === "demographics") {
      if (subTab === "demographics" || subTab === "") {
        return (
          <DemographicsAndTurnoutTab
            stateId={region.id}
            demographics={demographics}
            categories={categories}
            censusData={censusData}
            turnoutData={turnoutData ?? null}
            countryId="UK"
            bucketProfile={bucketProfile}
          />
        );
      }
      // The legacy stateMetrics boards, renamed Statistics.
      if (subTab === "statistics") {
        return <UKRegionPageTabsMetrics regionId={region.id} />;
      }
    }

    // ── Governance ──
    if (superTab === "governance") {
      if (subTab === "laws" || subTab === "") {
        return stateForTabs ? <LawsTab state={stateForTabs as State} /> : null;
      }
      if (subTab === "admin" && isAdmin) {
        return stateForTabs ? (
          <AdminTab state={stateForTabs as State} players={players} npps={npps} />
        ) : null;
      }
    }

    return null;
  };

  return (
    <RegionTabNav
      isAdmin={isAdmin}
      // UK is one of the four board countries.
      hasRegistry
      renderContent={renderContent}
      preTabContent={
        <RegionReferendumCampaign countryId="UK" regionId={stateForTabs?._id ?? region.id} />
      }
    />
  );
}
