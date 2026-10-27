import { Metadata } from "next";
import type { CountryId, CountryStatus } from "@/lib/constants/countries";
import { getAllCountryAccess } from "@/lib/countryAccess";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { resolveCountryAvailability } from "@/lib/countryAvailability";
import { WORLD_ROADMAP_COUNTRIES } from "@/lib/worldCountryRegistry";
import type { NationRow } from "./components/NationsTable";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { getNationWorldSnapshots } from "@/lib/world/nationWorldSnapshots";
import { publicPageMetadata } from "@/lib/siteMetadata";
import { loadWorldEntityMapSnapshot } from "@/lib/world/worldEntityMapLoader";
import { loadBlocMapData } from "@/lib/world/blocMembership";
import { loadLegacyServiceSnapshots } from "@/lib/world/succession/legacyServiceSnapshot";
import WorldClient from "./WorldClient";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";

export const metadata: Metadata = publicPageMetadata({
  title: "World | A House Divided",
  description:
    "Choose a country to play in the US, UK, Soviet Union, or East Germany. Each country has its own political system, elections, legislature, and economic layer tied to the shared hourly simulation.",
  pathname: "/world",
});

export type CountryAccessMap = Record<
  CountryId,
  {
    enabledForPlayers: boolean;
    status: CountryStatus;
    economyPreview: boolean;
    registered: boolean;
    econOnly: boolean;
  }
>;

export default async function WorldPage() {
  const db = await getDb();
  // Stage 1: everything that only needs the database handle, plus the preset
  // that the rest of the page's loaders are keyed on.
  const [countryAccess, gameState] = await Promise.all([
    getAllCountryAccess(),
    getGameStateCollection(db).then((col) =>
      col.findOne({ _id: "current" }, { projection: { conflictsEnabled: 1, preset: 1 } })
    ),
  ]);
  const preset = gameState?.preset ?? DEFAULT_SEED_PRESET;
  // Stage 2: four independent loaders. They used to run one after another (and
  // `loadLegacyServiceSnapshots` was awaited inside JSX, after everything else),
  // which put ~14 round trips of latency on a page whose map is already the
  // client's slowest surface.
  const [nationSnapshots, worldEntities, blocMapData, legacyFinances] = await Promise.all([
    getNationWorldSnapshots(db, preset),
    loadWorldEntityMapSnapshot(db, preset),
    // Bloc mode colours the globe from live membership, so the roll has to come
    // down with the page rather than being re-derived from a static table.
    loadBlocMapData(db, preset),
    loadLegacyServiceSnapshots(db, preset),
  ]);
  // Availability depends on the full country registry. Resolve it here so the
  // client table receives plain values instead of shipping that registry.
  const rows: NationRow[] = (Object.keys(countryAccess) as CountryId[]).map((id) => {
    const config = COUNTRY_CLIENT_CONFIGS[id];
    return {
      id,
      availability: resolveCountryAvailability(id, countryAccess[id]),
      snapshot: nationSnapshots[id],
      governmentTypeLabel: config.governmentTypeLabel,
      executiveTitle: config.executiveTitle,
    };
  });
  return (
    <WorldClient
      rows={rows}
      roadmap={WORLD_ROADMAP_COUNTRIES}
      countryAccess={countryAccess}
      conflictsEnabled={!!gameState?.conflictsEnabled}
      worldEntities={worldEntities}
      blocMapData={blocMapData}
      legacyFinances={legacyFinances}
    />
  );
}
