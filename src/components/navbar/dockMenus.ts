import type { CountryId } from "@/lib/constants/countriesCore";
import { UK_NATIONS, UK_REGIONS } from "@/lib/constants/uk";
import {
  cabinetOfficeUrl,
  countryUrl,
  partyUrl,
  regionElectionsUrl,
  regionLegislatureUrl,
  regionPartyUrl,
  regionUrl,
  scotusJusticeOfficeUrl,
} from "@/lib/urls";
import { rankDesktopLinks, type DesktopNavLink, type DesktopNavMenu } from "./desktopNavModel";
import {
  HELP_DISCORD_URL,
  HELP_PATREON_URL,
  HELP_SUPPORTER_WALL_URL,
  HELP_SUPPORT_EMAIL,
} from "./helpLinks";
import type { NationDetailSection } from "./nationDetailsSections";
import { visibleWorldNavItems } from "./worldNavItems";
import type { StaffNavItem } from "./staffNavItems";

export type DesktopMenuKey = "nation" | "world" | "state" | "help" | "staff";

/** The slice of a next-intl translator the nav builders use. Both the client
 *  hook and the server `getTranslations` result satisfy it. */
export interface NavTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

export function makeDesktopLink(t: NavTranslator) {
  return (
    id: string,
    label: string,
    href?: string,
    extra: Partial<DesktopNavLink> = {}
  ): DesktopNavLink => ({
    id,
    label,
    href,
    description: t.has(`desktop.descriptions.${id}`) ? t(`desktop.descriptions.${id}`) : undefined,
    ...extra,
  });
}

/** State legislature label (UK devolution-aware). */
export function stateLegislatureLabelFor(
  t: NavTranslator,
  homeState?: { id: string; countryId: string }
): string {
  if (!homeState || homeState.countryId !== "UK") return t("state.legislature");
  const nation = UK_NATIONS.find((n) => n.id === homeState.id);
  if (nation?.devolvedBody) return nation.devolvedBody;
  const region = UK_REGIONS.find((r) => r.id === homeState.id);
  const parentNation = UK_NATIONS.find((n) => n.id === region?.nationId);
  return parentNation?.devolvedBody ?? t("state.legislature");
}

export interface DesktopMenusInput {
  t: NavTranslator;
  /** Which menus to build; the navbar builds only what it can show. */
  build: (key: DesktopMenuKey) => boolean;
  showProfile: boolean;
  pageCountry: CountryId;
  userCountry: CountryId;
  countryName: (id: CountryId) => string;
  homeState?: { id: string; name: string; countryId: string };
  currentParty?: { id: string; name: string; countryId: string };
  activeElection?: { id: string; seatId?: string; label: string };
  cabinetOffice?: { positionId: string; positionName: string; countryCode: string };
  justiceOffice?: { countryCode: string; seatNumber: number };
  governorOffice?: { stateId: string; stateName: string; countryCode: string };
  myCorporationId?: number | null;
  myCorporationHasGroup?: boolean;
  myUnionId?: string | null;
  conflictsEnabled?: boolean;
  unionsEnabled?: boolean;
  settlementCrisisLive?: boolean;
  nationalDetailSections: NationDetailSection[];
  stateLegislatureLabel: string;
  staffSubItems: StaffNavItem[];
  showWiki: boolean;
  /** Web only: the quick-suggest row. Absent for the API, which has no handler to run. */
  onOpenFeedback?: () => void;
  feedbackCapturing?: boolean;
}

/**
 * The navbar menus (nation, world, state, help, staff) as plain data. One
 * source for the desktop mega menu, the phone dock sheets and the dock API.
 */
export function buildDesktopMenus({
  t,
  build: buildMenu,
  showProfile,
  pageCountry,
  userCountry,
  countryName,
  homeState,
  currentParty,
  activeElection,
  cabinetOffice,
  justiceOffice,
  governorOffice,
  myCorporationId,
  myCorporationHasGroup,
  myUnionId,
  conflictsEnabled,
  unionsEnabled,
  settlementCrisisLive,
  nationalDetailSections,
  stateLegislatureLabel,
  staffSubItems,
  showWiki,
  onOpenFeedback,
  feedbackCapturing,
}: DesktopMenusInput): Partial<Record<DesktopMenuKey, DesktopNavMenu>> {
  const desktopLink = makeDesktopLink(t);
  const desktopMenus: Partial<Record<DesktopMenuKey, DesktopNavMenu>> = {};
  if (buildMenu("nation") && showProfile) {
    const map = nationalDetailSections
      .flatMap((section) => section.items)
      .find((item) => item.id === "map");
    desktopMenus.nation = {
      title: countryName(pageCountry as CountryId),
      overview: desktopLink(
        "overview",
        countryName(pageCountry as CountryId),
        countryUrl(pageCountry as CountryId)
      ),
      groups: nationalDetailSections
        .filter((section) => section.title !== "Other")
        .map((section) => ({
          id: section.title,
          label: t(section.titleKey),
          items: rankDesktopLinks(
            section.items.map((item) =>
              desktopLink(item.id, item.labelKey ? t(item.labelKey) : item.label, item.href)
            )
          ),
        })),
      shortcuts: rankDesktopLinks([
        ...(currentParty
          ? [
              desktopLink(
                "myParty",
                currentParty.name,
                partyUrl(currentParty.countryId ?? pageCountry, currentParty.id)
              ),
            ]
          : []),
        ...(map ? [desktopLink("map", t("menus.nation.map"), map.href)] : []),
        ...(cabinetOffice
          ? [
              desktopLink(
                "cabinetOffice",
                t("menus.nation.cabinetOffice"),
                cabinetOfficeUrl(cabinetOffice.countryCode, cabinetOffice.positionId)
              ),
            ]
          : []),
        ...(justiceOffice
          ? [
              desktopLink(
                "justiceOffice",
                t("menus.nation.justiceOffice"),
                scotusJusticeOfficeUrl(justiceOffice.countryCode)
              ),
            ]
          : []),
        ...(userCountry === "US"
          ? [
              desktopLink(
                "politicalOperations",
                t("menus.nation.myPoliticalOperations"),
                "/political-operations"
              ),
            ]
          : []),
        ...(userCountry !== pageCountry
          ? [
              desktopLink(
                "homeNation",
                `${t("menus.nation.homeNation")} · ${countryName(userCountry as CountryId)}`,
                countryUrl(userCountry as CountryId)
              ),
            ]
          : []),
      ]),
    };
  }
  if (buildMenu("world")) {
    const markets = new Set(["stockMarket", "banking", "forex", "trade", "imf"]);
    const industry = new Set(["sectors", "governmentContracts", "unions", "news"]);
    const desktopWorldItems = visibleWorldNavItems({
      countryId: pageCountry,
      myCorporationId,
      myCorporationHasGroup,
      myUnionId,
      conflictsEnabled,
      unionsEnabled,
      settlementCrisisLive,
    });
    const links = desktopWorldItems.map((item) =>
      desktopLink(item.id, t(item.labelKey), item.href, { parentId: item.parentId })
    );
    const personal = new Set(
      desktopWorldItems.filter((item) => item.section === "corporate").map((item) => item.id)
    );
    desktopMenus.world = {
      title: t("common.world"),
      overview: desktopLink("nations", t("menus.world.nations"), "/world"),
      groups: [
        {
          id: "markets",
          label: t("desktop.groups.markets"),
          items: rankDesktopLinks(links.filter((item) => markets.has(item.id))),
        },
        {
          id: "industry",
          label: t("desktop.groups.industry"),
          items: rankDesktopLinks(links.filter((item) => industry.has(item.id))),
        },
        {
          id: "diplomacy",
          label: t("desktop.groups.diplomacy"),
          items: rankDesktopLinks(
            links.filter(
              (item) => !personal.has(item.id) && !markets.has(item.id) && !industry.has(item.id)
            )
          ),
        },
      ].filter((group) => group.items.length > 0),
      shortcuts: rankDesktopLinks(links.filter((item) => personal.has(item.id))),
    };
  }
  if (buildMenu("state") && homeState) {
    const region = regionUrl(homeState.countryId, homeState.id);
    desktopMenus.state = {
      title: homeState.name,
      overview: desktopLink("overview", homeState.name, region),
      groups: [
        {
          id: "politics",
          label: t("menus.nation.sections.politics"),
          items: [
            ...(currentParty
              ? [
                  desktopLink(
                    "stateParty",
                    `${homeState.name} · ${currentParty.name}`,
                    regionPartyUrl(homeState.countryId, homeState.id, currentParty.id)
                  ),
                ]
              : []),
            desktopLink(
              "elections",
              t("state.elections"),
              regionElectionsUrl(homeState.countryId, homeState.id)
            ),
          ],
        },
        {
          id: "government",
          label: t("menus.nation.sections.government"),
          items: [
            desktopLink(
              "legislature",
              stateLegislatureLabel,
              regionLegislatureUrl(homeState.countryId, homeState.id)
            ),
          ],
        },
        {
          id: "economy",
          label: t("menus.nation.sections.economy"),
          items: [desktopLink("economy", t("state.economy"), `${region}?tab=economy`)],
        },
      ],
      shortcuts: rankDesktopLinks([
        ...(activeElection
          ? [
              desktopLink(
                "activeElection",
                t("state.myElection"),
                `/elections/${activeElection.seatId ?? activeElection.id}`
              ),
            ]
          : []),
        ...(governorOffice && governorOffice.stateId === homeState.id
          ? [desktopLink("governorOffice", t("state.governorOffice"), `${region}/office`)]
          : []),
        ...(cabinetOffice
          ? [
              desktopLink(
                "cabinetOffice",
                `${t("menus.nation.cabinetOffice")} · ${cabinetOffice.positionName}`,
                cabinetOfficeUrl(cabinetOffice.countryCode, cabinetOffice.positionId)
              ),
            ]
          : []),
      ]),
    };
  }
  if (buildMenu("help")) {
    desktopMenus.help = {
      title: t("common.help"),
      overview: desktopLink(
        "guides",
        showWiki ? t("help.wikiGuides") : t("help.guides"),
        showWiki ? "https://wiki.ahousedividedgame.com" : "/guides",
        { external: showWiki }
      ),
      groups: [
        {
          id: "resources",
          label: t("help.resources"),
          items: [
            desktopLink(
              "guides",
              showWiki ? t("help.wikiGuides") : t("help.guides"),
              showWiki ? "https://wiki.ahousedividedgame.com" : "/guides",
              { external: showWiki }
            ),
            desktopLink("about", t("help.about"), "/about"),
            desktopLink("suggestions", t("help.suggestions"), "/feedback"),
          ],
        },
        {
          id: "community",
          label: t("help.community"),
          items: [
            desktopLink("discord", "Discord", HELP_DISCORD_URL, { external: true }),
            desktopLink("patreon", t("help.patreon"), HELP_PATREON_URL, { external: true }),
            desktopLink("supporters", t("help.supporterWall"), HELP_SUPPORTER_WALL_URL, {
              external: true,
            }),
          ],
        },
        {
          id: "support",
          label: t("desktop.groups.support"),
          items: [
            desktopLink("support", t("help.emailSupport"), HELP_SUPPORT_EMAIL, { external: true }),
            ...(onOpenFeedback
              ? [
                  desktopLink(
                    "feedback",
                    feedbackCapturing ? t("common.capturingScreenshot") : t("common.quickSuggest"),
                    undefined,
                    { onSelect: onOpenFeedback, disabled: feedbackCapturing }
                  ),
                ]
              : []),
            desktopLink("privacy", t("help.privacy"), "/privacy"),
            desktopLink("terms", t("help.terms"), "/terms"),
          ],
        },
      ],
      shortcuts: [],
    };
  }
  if (buildMenu("staff") && staffSubItems.length > 0) {
    const items = staffSubItems.map((item) =>
      desktopLink(item.labelKey, t(item.labelKey), item.href, { external: item.external })
    );
    desktopMenus.staff = {
      title: t("common.staff"),
      overview: items[0]!,
      groups: [{ id: "staff", label: t("common.staff"), items }],
      shortcuts: [],
    };
  }
  return desktopMenus;
}
