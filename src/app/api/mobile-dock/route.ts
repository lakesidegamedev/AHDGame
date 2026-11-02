import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, unauthorized } from "@/lib/api/errors";
import { GET as getClientNav } from "@/app/api/client-nav/route";
import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countriesCore";
import { getCountryDisplayName } from "@/lib/country/countryDisplayNames";
import { loadCountryNameOverrides } from "@/lib/country/countryIdentity";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getReferendumCollection } from "@/lib/db/collections/referendum";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import type { Election } from "@/lib/db/types";
import { experimentalDesktopLayout } from "@/lib/navigation/desktopNavigationLayout";
import {
  applySavedOrder,
  navCustomization as parseNavCustomization,
  navGroupKey,
} from "@/lib/navigation/navCustomization";
import { mobileDockPayload } from "@/lib/navigation/mobileDockPayload";
import {
  buildDesktopMenus,
  stateLegislatureLabelFor,
  type DesktopMenuKey,
  type NavTranslator,
} from "@/components/navbar/dockMenus";
import type { DesktopNavMenu } from "@/components/navbar/desktopNavModel";
import { buildMobileDock } from "@/components/navbar/mobileDockBuilder";
import { buildNationalDetailsSections } from "@/components/navbar/nationDetailsSections";
import { viewerIsSingleplayerOwner, visibleStaffNavItems } from "@/components/navbar/staffNavItems";

const NO_STORE = { "Cache-Control": "no-store" };
const MENU_KEYS: DesktopMenuKey[] = ["state", "nation", "world", "help", "staff"];

interface DockNav {
  user: {
    singleplayer?: boolean;
    isAdmin?: boolean;
    isModerator?: boolean;
    username?: string;
    experimentalFeatures?: boolean;
    desktopNavigationLayout?: unknown;
    navCustomization?: unknown;
  } | null;
  hasCharacter: boolean;
  characterCountryId: string | null;
  characterName: string | null;
  unreadCount: number;
  myCorporationId: number | null;
  myCorporationHasGroup: boolean;
  myUnionId: string | null;
  homeState: { id: string; name: string; countryId: string } | null;
  currentParty: { id: string; name: string; countryId: string } | null;
  activeElection: { id: string; seatId?: string; label: string } | null;
  cabinetOffice: { positionId: string; positionName: string; countryCode: string } | null;
  justiceOffice: { countryCode: string; seatNumber: number } | null;
  governorOffice: { stateId: string; stateName: string; countryCode: string } | null;
  isImperialMode: boolean;
  wikiDisabled: boolean;
  conflictsEnabled: boolean;
  settlementCrisisLive: boolean;
  unionsEnabled: boolean;
  pendingCharterCount: number;
}

// GET /api/mobile-dock[?country=XX] — the phone dock (tabs and sheets) for the signed-in player, for the native app to draw.
// Auth: signed-in session (the same one /api/client-nav reads)
// Errors: 401 when signed out
export async function GET(request: Request) {
  try {
    // One source for who the player is and what they hold, shared with the web navbar.
    const navResponse = await getClientNav();
    if (!navResponse.ok) {
      navResponse.headers.set("Cache-Control", "no-store");
      return navResponse;
    }
    const nav = (await navResponse.json()) as DockNav;
    if (!nav.user) {
      return NextResponse.json(unauthorized().toJson(), { status: 401, headers: NO_STORE });
    }
    if (!nav.hasCharacter) {
      return NextResponse.json({ version: 1, tabs: [], sheets: {} }, { headers: NO_STORE });
    }

    const db = await getDb();
    const [enabledCountries, preset, nameOverrides, t] = await Promise.all([
      getEnabledCountryIds().catch(() => COUNTRY_ORDER),
      getGameStatePreset(db).catch(() => null),
      loadCountryNameOverrides(db).catch(() => ({})),
      getTranslations("nav"),
    ]);
    const nt = t as unknown as NavTranslator;
    const activePreset = preset ?? DEFAULT_SEED_PRESET;
    const countryName = (id: CountryId) =>
      (nameOverrides as Partial<Record<CountryId, string>>)[id] ??
      getCountryDisplayName(id, activePreset);

    const userCountry = (nav.characterCountryId ?? nav.homeState?.countryId ?? "US") as CountryId;
    const asked = new URL(request.url).searchParams.get("country")?.toUpperCase();
    const pageCountry = (
      asked && (enabledCountries as string[]).includes(asked) ? asked : userCountry
    ) as CountryId;

    const [presidentElection, referendumCount] = await Promise.all([
      db
        .collection<Election>("elections")
        .findOne(
          {
            electionType: "president",
            state: pageCountry,
            status: { $in: ["active", "upcoming"] },
          },
          { projection: { _id: 1, seatId: 1 } }
        )
        .catch(() => null),
      getReferendumCollection(db)
        .countDocuments({ countryId: pageCountry, status: "campaigning" })
        .catch(() => 0),
    ]);

    const isStaff = !!(nav.user.isAdmin || nav.user.isModerator);
    const nationalDetailSections = buildNationalDetailsSections(pageCountry, {
      activePresidentElection: presidentElection
        ? { id: presidentElection._id.toString(), seatId: presidentElection.seatId ?? undefined }
        : null,
      charters:
        nav.pendingCharterCount > 0
          ? {
              href: "/charters",
              label: nt("menus.nation.chartersMultiple", { count: nav.pendingCharterCount }),
            }
          : null,
      hasActiveReferendumCampaign: referendumCount > 0,
      unionsEnabled: nav.unionsEnabled,
    });
    const homeState = nav.homeState ?? undefined;
    const menus = buildDesktopMenus({
      t: nt,
      build: () => true,
      showProfile: true,
      pageCountry,
      userCountry,
      countryName,
      homeState,
      currentParty: nav.currentParty ?? undefined,
      activeElection: nav.activeElection ?? undefined,
      cabinetOffice: nav.cabinetOffice ?? undefined,
      justiceOffice: nav.justiceOffice ?? undefined,
      governorOffice: nav.governorOffice ?? undefined,
      myCorporationId: nav.myCorporationId,
      myCorporationHasGroup: nav.myCorporationHasGroup,
      myUnionId: nav.myUnionId,
      conflictsEnabled: nav.conflictsEnabled,
      unionsEnabled: nav.unionsEnabled,
      settlementCrisisLive: nav.settlementCrisisLive,
      nationalDetailSections,
      stateLegislatureLabel: stateLegislatureLabelFor(nt, homeState),
      staffSubItems: isStaff
        ? visibleStaffNavItems({
            isAdmin: !!nav.user.isAdmin,
            isModerator: !!nav.user.isModerator,
            isSingleplayerOwner: viewerIsSingleplayerOwner(nav.user),
          })
        : [],
      showWiki: isStaff || !nav.wikiDisabled,
    });

    // The saved group order applies to the grouped-cards layout only, as on the web.
    const custom = parseNavCustomization(nav.user.navCustomization);
    const customizable =
      experimentalDesktopLayout(nav.user.experimentalFeatures, nav.user.desktopNavigationLayout) ===
      "cards";
    const ordered: Partial<Record<DesktopMenuKey, DesktopNavMenu>> = {};
    for (const key of MENU_KEYS) {
      const menu = menus[key];
      if (!menu) continue;
      ordered[key] = customizable
        ? {
            ...menu,
            groups: menu.groups.map((group) => ({
              ...group,
              items: applySavedOrder(group.items, custom.order[navGroupKey(key, group.id)]),
            })),
          }
        : menu;
    }

    const spec = buildMobileDock({
      t: nt,
      pathname: "",
      pageCountry,
      countryName,
      homeState,
      myCorporationId: nav.myCorporationId,
      isImperialMode: nav.isImperialMode,
      singleplayer: nav.user.singleplayer === true,
      unreadCount: nav.unreadCount,
      profileDisplayName: nav.characterName ?? nav.user.username ?? "",
      switchableCountries: enabledCountries,
      menus: ordered,
    });
    return NextResponse.json(mobileDockPayload(spec), { headers: NO_STORE });
  } catch (error) {
    return handleRouteError(error);
  }
}
