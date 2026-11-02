/**
 * The phone dock as plain data: tabs, sheets, which tab is lit. No React, so the
 * web dock (useMobileDockModel) and GET /api/mobile-dock share one source of truth
 * for the tabs, the sheet sections and the visibility rules.
 */
import { type CountryId } from "@/lib/constants/countriesCore";
import { countryUrl, regionUrl } from "@/lib/urls";
import type { DesktopNavLink, DesktopNavMenu } from "./desktopNavModel";
import { makeDesktopLink, type NavTranslator } from "./dockMenus";
import type { PixelNavIconName } from "./PixelNavIcon";

export type DockSheetKey = "state" | "nation" | "more";

export type DockIconSpec =
  | { kind: "pixel"; name: PixelNavIconName }
  /** The nation tab shows the country's flag on the web; the API sends the flag pixel icon. */
  | { kind: "flag"; country: CountryId }
  /** The four-square More icon. */
  | { kind: "grid" };

export interface DockTabSpec {
  id: string;
  label: string;
  icon: DockIconSpec;
  href?: string;
  sheet?: DockSheetKey;
  /** Lit for the current pathname. Always false when no pathname is given. */
  active: boolean;
  /** Path prefixes that light this tab, for clients that track the URL themselves. */
  activePrefixes: string[];
}

export interface DockSectionSpec {
  id: string;
  /** Section heading; omitted when the sheet holds one section. */
  title?: string;
  menu: DesktopNavMenu;
  shortcutsLabel: string;
}

export interface DockSheetSpec {
  title: string;
  /** Nations the player can switch to. Present only when there is more than one. */
  switchCountries?: { country: CountryId; label: string; href: string; current: boolean }[];
  switchLabel: string;
  sections: DockSectionSpec[];
}

export interface MobileDockSpec {
  tabs: DockTabSpec[];
  sheets: Partial<Record<DockSheetKey, DockSheetSpec>>;
}

/** The More tab's four-square icon as an 11x11 bitmap. */
export const DOCK_MORE_ICON_GRID: readonly string[] = [
  "00000000000",
  "01111011110",
  "01111011110",
  "01111011110",
  "01111011110",
  "00000000000",
  "01111011110",
  "01111011110",
  "01111011110",
  "01111011110",
  "00000000000",
];

type MenuKey = "state" | "nation" | "world" | "help" | "staff";

export interface MobileDockInput {
  t: NavTranslator;
  /** Current path; leave empty when the caller tracks the URL itself. */
  pathname: string;
  pageCountry: CountryId;
  countryName: (id: CountryId) => string;
  homeState?: { id: string; name: string; countryId: string };
  myCorporationId?: number | null;
  isImperialMode: boolean;
  singleplayer: boolean;
  unreadCount: number;
  profileDisplayName: string;
  switchableCountries: CountryId[];
  /** The navbar's menus, already in the player's saved order. */
  menus: Partial<Record<MenuKey, DesktopNavMenu>>;
}

function pathActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0]!;
  return !!pathname && (pathname === base || pathname.startsWith(base + "/"));
}

/**
 * Tabs follow phone traffic: company (or the market without one), home state,
 * nation, Actions, then More. Every destination the standard phone menu offers
 * stays reachable from a sheet.
 */
export function buildMobileDock({
  t,
  pathname,
  pageCountry,
  countryName,
  homeState,
  myCorporationId,
  isImperialMode,
  singleplayer,
  unreadCount,
  profileDisplayName,
  switchableCountries,
  menus,
}: MobileDockInput): MobileDockSpec {
  const link = makeDesktopLink(t);
  const stateHref = homeState ? regionUrl(homeState.countryId, homeState.id) : null;
  const onState = !!stateHref && pathActive(pathname, stateHref);
  const companyHref = myCorporationId ? `/corporation/${myCorporationId}` : null;
  const nationName = countryName(pageCountry);
  const nationHref = countryUrl(pageCountry);

  const tabs: DockTabSpec[] = [
    companyHref
      ? {
          id: "company",
          label: t("dock.company"),
          icon: { kind: "pixel", name: "briefcase" },
          href: companyHref,
          active: pathActive(pathname, companyHref),
          activePrefixes: [companyHref],
        }
      : {
          id: "market",
          label: t("dock.market"),
          icon: { kind: "pixel", name: "chart" },
          href: "/market",
          active: pathActive(pathname, "/market") || pathActive(pathname, "/stockmarket"),
          activePrefixes: ["/market", "/stockmarket"],
        },
  ];
  if (homeState && menus.state)
    tabs.push({
      id: "state",
      label: homeState.name,
      icon: { kind: "pixel", name: "map" },
      sheet: "state",
      active: onState,
      activePrefixes: [stateHref!.split("?")[0]!],
    });
  tabs.push({
    id: "nation",
    label: nationName,
    icon: { kind: "flag", country: pageCountry },
    sheet: "nation",
    active: !onState && pathActive(pathname, nationHref),
    activePrefixes: [nationHref.split("?")[0]!],
  });
  if (!isImperialMode)
    tabs.push({
      id: "actions",
      label: t("common.actions"),
      icon: { kind: "pixel", name: "bolt" },
      href: "/actions",
      active: pathActive(pathname, "/actions"),
      activePrefixes: ["/actions"],
    });
  tabs.push({
    id: "more",
    label: t("dock.more"),
    icon: { kind: "grid" },
    sheet: "more",
    active: false,
    activePrefixes: [],
  });

  const switchLabel = t("dock.switchCountry");
  const shortcutsLabel = t("desktop.shortcuts");
  const sheets: Partial<Record<DockSheetKey, DockSheetSpec>> = {};
  if (homeState && menus.state)
    sheets.state = {
      title: homeState.name,
      switchLabel,
      sections: [{ id: "state", menu: menus.state, shortcutsLabel }],
    };
  if (menus.nation)
    sheets.nation = {
      title: nationName,
      switchLabel,
      switchCountries:
        switchableCountries.length > 1
          ? switchableCountries.map((country) => ({
              country,
              label: countryName(country),
              href: countryUrl(country),
              current: country === pageCountry,
            }))
          : undefined,
      sections: [{ id: "nation", menu: menus.nation, shortcutsLabel }],
    };

  const youLinks: DesktopNavLink[] = [
    link(
      "notifications",
      unreadCount
        ? `${t("common.notifications")} (${unreadCount > 9 ? "9+" : unreadCount})`
        : t("common.notifications"),
      "/notifications",
      { icon: "bell" }
    ),
    link("portfolio", t("dock.portfolio"), "/portfolio", { icon: "bank" }),
    link("wallet", t("common.wallet"), "/portfolio?tab=currency", { icon: "bank" }),
    link("settings", t("common.settings"), "/settings", { icon: "gear" }),
    ...(!singleplayer
      ? [link("contests", t("common.contests"), "/contests", { icon: "star" })]
      : []),
    link("whatsNew", t("dock.whatsNew"), "/changelog", { icon: "book" }),
  ];
  sheets.more = {
    title: t("dock.everything"),
    switchLabel,
    sections: [
      {
        id: "you",
        title: t("dock.you"),
        shortcutsLabel,
        menu: {
          title: t("dock.you"),
          overview: link("profile", profileDisplayName || t("common.profile"), "/profile", {
            icon: "star",
          }),
          shortcuts: [],
          groups: [{ id: "you", label: t("common.profile"), items: youLinks }],
        },
      },
      ...(["world", "help", "staff"] as const).flatMap((key) => {
        const menu = menus[key];
        return menu ? [{ id: key, title: menu.title, menu, shortcutsLabel }] : [];
      }),
    ],
  };
  return { tabs, sheets };
}
