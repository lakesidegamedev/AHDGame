"use client";

import FederationFinances from "./components/FederationFinances";
import type { LegacyServiceSnapshot } from "@/lib/world/succession/legacyServiceSnapshot";
import Link from "next/link";
import {
  TIER_ORDER,
  TIER_LABELS,
  TIER_COLORS,
  TIER_STROKES,
} from "@/components/landing/countryTiers";
import dynamic from "next/dynamic";

// The globe is the heaviest client surface on this page: d3-geo, topojson,
// polygon-clipping, four geometry fetches and the SVG path build. Deferring its
// chunk lets the nation tables, headings and filters paint first instead of
// waiting on the map's module graph.
const WorldMapSVG = dynamic(() => import("./components/WorldMapSVG"), {
  loading: () => <div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-card" />,
});
import { NationsTable, PlannedNationsTable, type NationRow } from "./components/NationsTable";
import type { WorldRoadmapCountry } from "@/lib/worldCountryRegistry";
import type { CountryAccessMap } from "./page";
import { WorldMetricFilterProvider } from "./WorldMetricFilterContext";
import type { WorldEntityMapSnapshot } from "@/lib/world/worldEntityMap";
import type { BlocMapData } from "@/lib/world/blocMembership";

interface WorldClientProps {
  /** Server-resolved availability and labels, one entry per registered nation. */
  rows: NationRow[];
  roadmap: WorldRoadmapCountry[];
  legacyFinances?: LegacyServiceSnapshot[];
  countryAccess: CountryAccessMap;
  /** Gates the Conflicts entry; mirrors the World navbar link. */
  conflictsEnabled: boolean;
  worldEntities: WorldEntityMapSnapshot;
  /** entityId → bloc, for the globe's Blocs mode. */
  blocMapData: BlocMapData;
}

/** The other world pages, each a heading, one link and a line on what is there. */
interface WorldLink {
  heading: string;
  title: string;
  description: string;
  href: string;
}

const MAIN_HEADING = "text-heading-lg font-semibold tracking-tight text-foreground";
const ASIDE_HEADING = "text-body-lg font-semibold text-foreground";

export default function WorldClient({
  rows: allRows,
  roadmap,
  countryAccess,
  conflictsEnabled,
  worldEntities,
  blocMapData,
  legacyFinances = [],
}: WorldClientProps) {
  // Nations you can play, then nations you can only browse, then nations that
  // are not in the game yet.
  const playableRows = allRows.filter((row) => row.availability.accessMode === "full");
  const econOnlyRows = allRows
    .filter((row) => row.availability.accessMode === "econ-only")
    .sort((a, b) => a.availability.sortOrder - b.availability.sortOrder);
  const hiddenRows = allRows.filter((row) => row.availability.accessMode === "hidden");
  const openRows = [...playableRows, ...econOnlyRows];

  const links: WorldLink[] = [
    {
      heading: "World events",
      title: "Global crises",
      description: "Active world events affecting nations, economies, and metrics.",
      href: "/world/crises",
    },
    ...(conflictsEnabled
      ? [
          {
            heading: "World affairs",
            title: "Conflicts",
            description: "Rivalries, blocs, and confrontations between nations.",
            href: "/world/conflicts",
          },
        ]
      : []),
    {
      heading: "World trade",
      title: "Balance of trade",
      description: "Surplus and deficit between nations by country, commodity, and pair.",
      href: "/world/trade",
    },
    {
      heading: "Hall of fame",
      title: "Every player, ranked",
      description:
        "Legacy score across every life you have played, for the current iteration or all time.",
      href: "/world/legacy",
    },
  ];

  return (
    <WorldMetricFilterProvider>
      <div className="min-h-screen bg-background pb-20">
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="max-w-2xl">
            <h1 className="text-display font-bold tracking-tight text-foreground sm:text-[2.25rem] sm:leading-tight">
              World
            </h1>
            <p className="mt-2 text-body-lg text-muted">
              This page lists every nation in the game, with world events, trade, and the all-time
              rankings.
            </p>
          </header>

          {/* Map */}
          <section className="mt-8 space-y-4" aria-label="World map">
            <WorldMapSVG
              countryAccess={countryAccess}
              worldEntities={worldEntities}
              blocMapData={blocMapData}
            />
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-body-sm text-muted">
              {TIER_ORDER.map((tier) => (
                <div key={tier} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={{
                      backgroundColor: TIER_COLORS[tier],
                      borderColor:
                        tier === "background" ? TIER_STROKES.economic : TIER_STROKES[tier],
                    }}
                  />
                  <span>{TIER_LABELS[tier]}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-body-sm text-muted">
              Light borders identify background nations with aggregate data. Tap or click to inspect
              them.
            </p>
          </section>

          <FederationFinances snapshots={legacyFinances} />

          <div className="mt-12 grid gap-x-12 gap-y-12 xl:grid-cols-3">
            <div className="min-w-0 space-y-12 xl:col-span-2">
              {openRows.length > 0 && (
                <section>
                  <h2 className={MAIN_HEADING}>Nations</h2>
                  <p className="mt-2 max-w-2xl text-body text-muted">
                    Choose a nation to play. Econ-only nations are open to browse, not to play. Read
                    their politics, their legislature, and their economy to see what you are
                    investing in.
                  </p>
                  <div className="mt-4">
                    <NationsTable rows={openRows} />
                  </div>
                </section>
              )}

              {(hiddenRows.length > 0 || roadmap.length > 0) && (
                <section>
                  <h2 className={MAIN_HEADING}>Planned nations</h2>
                  <p className="mt-2 max-w-2xl text-body text-muted">
                    Not open yet. Each is in development or planned, with its own electoral system
                    and regional politics.
                  </p>
                  <div className="mt-4">
                    <PlannedNationsTable hidden={hiddenRows} roadmap={roadmap} />
                  </div>
                </section>
              )}
            </div>

            <aside className="min-w-0 space-y-10" aria-label="More of the world">
              {links.map((link) => (
                <section key={link.href}>
                  <h2 className={ASIDE_HEADING}>{link.heading}</h2>
                  <Link
                    href={link.href}
                    className="mt-1 inline-block text-body font-medium text-foreground underline decoration-card-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {link.title}
                  </Link>
                  <p className="mt-1 text-body-sm text-muted">{link.description}</p>
                </section>
              ))}
            </aside>
          </div>
        </main>
      </div>
    </WorldMetricFilterProvider>
  );
}
