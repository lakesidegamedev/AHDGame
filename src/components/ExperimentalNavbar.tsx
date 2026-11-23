"use client";
import { renderExperimentalNavbarView } from "./ExperimentalNavbar.view";

/**
 * ExperimentalNavbar: the default primary navigation. The classic {@link Navbar}
 * is used when a player selects the classic interface in Settings → Appearance.
 * The name is kept for continuity.
 *
 * Visuals use themed Tailwind tokens so it inherits all 11 themes. Desktop bar:
 * logo left; text tabs + icon cluster right; underline on active tab; inline
 * expanding search, with tabs in production order (Actions · State · Nation ·
 * World · Help · Staff). Includes the avatar/profile dropdown and a mobile menu.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useTranslations } from "next-intl";

import { usePathname } from "next/navigation";
import { useCountryContext } from "@/hooks/useCountryContext";
import { useActiveCharters } from "@/hooks/useActiveCharters";
import { useActiveReferendumCampaign } from "@/hooks/useActiveReferendumCampaign";
import { useActivePresidentElection } from "@/hooks/useActivePresidentElection";

import { UniversalSearch } from "./UniversalSearch";

import { type CountryId } from "@/lib/constants/countriesCore";

import { useEnabledCountries, useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import {
  countryUrl,
  partyUrl,
  regionUrl,
  regionPartyUrl,
  regionLegislatureUrl,
  regionElectionsUrl,
  cabinetOfficeUrl,
  scotusJusticeOfficeUrl,
} from "@/lib/urls";
import {
  HELP_DISCORD_URL,
  HELP_PATREON_URL,
  HELP_SUPPORTER_WALL_URL,
  HELP_SUPPORT_EMAIL,
} from "./HelpDropdown";
import { buildNationalDetailsSections } from "@/components/navbar/nationDetailsSections";
import { visibleWorldNavItems } from "@/components/navbar/worldNavItems";
import { visibleProfileOrgItems } from "@/components/navbar/profileNavItems";
import { viewerIsSingleplayerOwner, visibleStaffNavItems } from "@/components/navbar/staffNavItems";
import {
  DropdownPanel,
  MenuLabel,
  MenuRow,
  isNavActive,
} from "@/components/navbar/experimentalNavPrimitives";
import { ExperimentalUserMenu } from "@/components/navbar/ExperimentalUserMenu";

import { useToast } from "@/contexts/ToastContext";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import {
  applySavedOrder,
  MAX_NAV_PINS,
  navCustomization as parseNavCustomization,
  navGroupKey,
  navPinKey,
  togglePin,
  type NavCustomization,
} from "@/lib/navigation/navCustomization";

import dynamic from "next/dynamic";

import { type DesktopNavLink, type DesktopNavMenu } from "@/components/navbar/desktopNavModel";
import type { DesktopNavigationLayout } from "@/lib/navigation/desktopNavigationLayout";
import type { MobileNavigationLayout } from "@/lib/navigation/mobileNavigationLayout";
import { type DockSheetKey } from "@/components/navbar/MobileDock";
import { buildCampaignNavItems } from "@/components/navbar/campaignNav";
import { useMobileDockModel } from "@/components/navbar/mobileDockModel";
import {
  buildDesktopMenus,
  stateLegislatureLabelFor,
  type DesktopMenuKey,
  type NavTranslator,
} from "@/components/navbar/dockMenus";
import { SidebarWidget } from "@/components/sidebarWidgets/SidebarWidget";
import { useSidebarWidgetData } from "@/components/sidebarWidgets/useSidebarWidgetData";
import { useWidgetSetup } from "@/components/sidebarWidgets/useWidgetSetup";
import { hasSandboxAccess } from "@/lib/sandbox/access";

import type {
  AdminCharacter,
  CharacterProfile,
  ExperimentalNavItem,
  ImperialCharacterNav,
  MobileSubKey,
  NavLinkRef,
  OpenKey,
} from "@/components/navbar/experimentalNavTypes";
import { campaignManagerHref } from "@/lib/campaignManager/links";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { announceCharacterSwitch } from "@/lib/characterSwitchSignal";

const NavCustomizeDialog = dynamic(
  () =>
    import("@/components/navbar/NavCustomizeDialog").then((module) => module.NavCustomizeDialog),
  { ssr: false }
);

const CUSTOMIZABLE_MENUS: DesktopMenuKey[] = ["state", "nation", "world", "help", "staff"];

const DesktopMegaMenu = dynamic(
  () => import("@/components/navbar/DesktopMegaMenu").then((module) => module.DesktopMegaMenu),
  { ssr: false }
);

export interface ExperimentalNavbarProps {
  navigationVariant?: "a" | "b";
  desktopLayout?: DesktopNavigationLayout | null;
  /** Phone layout for experimental users; null keeps the standard menu. */
  mobileLayout?: MobileNavigationLayout | null;
  /** Saved pins and group order; used by the grouped-cards layout only. */
  navCustomization?: unknown;
  clientShell?: boolean;
  /** The AHDClient phone app, which draws its own bottom tab bar. */
  phoneApp?: boolean;
  /** Type the site name in on load, in mono (1991 worlds). */
  typedWordmark?: boolean;
  user?: NavLinkRef;
  showProfile?: boolean;
  currentParty?: { id: string; name: string; countryId: string };
  unreadCount?: number;
  characterProfile?: CharacterProfile;
  onOpenFeedback?: () => void;
  feedbackCapturing?: boolean;
  initialPageCountry?: CountryId | null;
  homeState?: { id: string; name: string; countryId: string };
  activeElection?: { id: string; seatId?: string; label: string };
  cabinetOffice?: { positionId: string; positionName: string; countryCode: string };
  justiceOffice?: { countryCode: string; seatNumber: number };
  governorOffice?: { stateId: string; stateName: string; countryCode: string };
  isImperialMode?: boolean;
  wikiDisabled?: boolean;
  myCorporationId?: number | null;
  myCorporationHasGroup?: boolean;
  myUnionId?: string | null;
  adminCharacters?: AdminCharacter[];
  imperialCharacter?: ImperialCharacterNav;
  unionsEnabled?: boolean;
  settlementCrisisLive?: boolean;
  activePresidentElectionId?: string;
  activePresidentElectionSeatId?: string;
}

function useExperimentalNavbarContext({
  navigationVariant = "a",
  desktopLayout = null,
  mobileLayout = null,
  navCustomization: savedCustomization,
  clientShell = false,
  phoneApp = false,
  typedWordmark = false,
  user,
  showProfile = false,
  currentParty,
  unreadCount = 0,
  characterProfile,
  onOpenFeedback,
  feedbackCapturing = false,
  initialPageCountry,
  homeState,
  activeElection,
  cabinetOffice,
  justiceOffice,
  governorOffice,
  isImperialMode = false,
  wikiDisabled = false,
  myCorporationId,
  myCorporationHasGroup = false,
  myUnionId,
  adminCharacters,
  imperialCharacter,
  unionsEnabled = false,
  settlementCrisisLive = false,
  activePresidentElectionId: _activePresidentElectionId,
  activePresidentElectionSeatId: _activePresidentElectionSeatId,
}: ExperimentalNavbarProps) {
  const t = useTranslations("nav");
  const experimentVariant = navigationVariant === "b" ? "test" : "control";
  const pathname = usePathname();
  const { pageCountry, userCountry } = useCountryContext(
    homeState?.id,
    homeState?.countryId,
    initialPageCountry
  );

  const [open, setOpen] = useState<OpenKey>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const mobilePortalReady = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [dockSheet, setDockSheet] = useState<DockSheetKey | null>(null);
  const [mobileSubOpen, setMobileSubOpen] = useState<Partial<Record<MobileSubKey, boolean>>>({});
  const [switchingCharacter, setSwitchingCharacter] = useState(false);
  const [switchingImperial, setSwitchingImperial] = useState(false);
  // Collapsible National Details sub-sections (Economy): closed by default;
  // reset whenever a different dropdown opens so each open starts collapsed.
  const [expandedNationSections, setExpandedNationSections] = useState<Record<string, boolean>>({});

  const barRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dropdownAnchorRef = useRef<HTMLDivElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);

  // Grouped cards is the layout that carries the customisable bar: wide
  // container, gear menu, pinned destinations and per-group order.
  const customizableNav = desktopLayout === "cards";
  const { showToast } = useToast();
  const refetchNav = useRefetchNav();
  const widgetSetup = useWidgetSetup();
  // Prefetched with the tray's widgets so an opened menu rarely waits.
  const menuWidgetData = useSidebarWidgetData(
    widgetSetup.enabled && desktopLayout && desktopLayout !== "standard"
      ? Object.values(widgetSetup.layout.nav).map(widgetSetup.resolveKey)
      : []
  );
  const savedCustomizationJson = JSON.stringify(parseNavCustomization(savedCustomization));
  const [custom, setCustom] = useState<NavCustomization>(() =>
    parseNavCustomization(savedCustomization)
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const lastSavedRef = useRef(savedCustomizationJson);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimerRef.current) return;
    lastSavedRef.current = savedCustomizationJson;
    setCustom(JSON.parse(savedCustomizationJson) as NavCustomization);
  }, [savedCustomizationJson]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  // Applies at once; the account save is batched so a run of reorders is one request.
  const updateCustom = useCallback(
    (next: NavCustomization) => {
      setCustom(next);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = JSON.stringify(next);
        if (body === lastSavedRef.current) return;
        fetch("/api/settings/experimental-features", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ navCustomization: next }),
        })
          .then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            lastSavedRef.current = body;
            refetchNav();
          })
          .catch(() => {
            setCustom(JSON.parse(lastSavedRef.current) as NavCustomization);
            showToast(t("customize.saveError"), "error");
          });
      }, 600);
    },
    [refetchNav, showToast, t]
  );

  // The dock replaces the menu button only for signed-in players with a character.
  // The phone app has its own bottom tab bar; two docks stacked would leave
  // little room for the page. The app keeps the standard phone menu.
  const mobileDock = mobileLayout === "dock" && showProfile && !!user && !phoneApp;
  const [sheetPath, setSheetPath] = useState(pathname);
  if (sheetPath !== pathname) {
    setSheetPath(pathname);
    setDockSheet(null);
  }

  const nationMenuOpen = open === "nation" || open === "country" || dockSheet === "nation";
  const activeCharters = useActiveCharters(nationMenuOpen || mobileMenuOpen);
  const hasActiveReferendumCampaign = useActiveReferendumCampaign(
    pageCountry as CountryId,
    nationMenuOpen || mobileMenuOpen
  );
  const activePresidentElection = useActivePresidentElection(
    pageCountry as CountryId,
    nationMenuOpen || mobileMenuOpen
  );

  const toggleMobileSub = useCallback((key: MobileSubKey) => {
    setMobileSubOpen((cur) => ({ ...cur, [key]: !cur[key] }));
  }, []);

  useEffect(() => {
    if ((navigationVariant !== "b" && !mobileDock) || (!mobileMenuOpen && !mobileProfileOpen))
      return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setMobileProfileOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onEscape);
    };
  }, [navigationVariant, mobileDock, mobileMenuOpen, mobileProfileOpen]);

  const toggle = useCallback((key: Exclude<OpenKey, null>) => {
    setExpandedNationSections({});
    setOpen((cur) => (cur === key ? null : key));
  }, []);
  const closeAll = useCallback(() => setOpen(null), []);

  // Close dropdowns / the expanding search on outside click or Esc.
  // Portal-mounted panels live outside barRef, so check both refs.
  useEffect(() => {
    if (open === null && !searchOpen) return;

    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (barRef.current?.contains(target)) return;
      if (dropdownPanelRef.current?.contains(target)) return;
      closeAll();
      setSearchOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (
          desktopLayout &&
          desktopLayout !== "standard" &&
          window.matchMedia("(min-width: 1024px)").matches
        )
          dropdownAnchorRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        closeAll();
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, searchOpen, closeAll, desktopLayout]);
  const handleSignOut = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (res.ok) window.location.assign(new URL("/", window.location.origin).href);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSwitchCharacter = useCallback(
    async (characterId: string) => {
      if (switchingCharacter) return;
      setSwitchingCharacter(true);
      try {
        const res = await fetch("/api/auth/active-character", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        if (res.ok) {
          announceCharacterSwitch({
            characterId,
            name: adminCharacters?.find((c) => c.id === characterId)?.name ?? null,
          });
          window.location.reload();
        }
      } catch {
        /* ignore */
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [switchingCharacter, adminCharacters]
  );

  const handleSwitchImperial = useCallback(
    async (type: "character" | "imperial") => {
      if (switchingImperial) return;
      setSwitchingImperial(true);
      try {
        const res = await fetch("/api/imperial-characters/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        if (res.ok) window.location.reload();
      } catch {
        /* ignore */
      } finally {
        setSwitchingImperial(false);
      }
    },
    [switchingImperial]
  );

  // Country-context awareness (matches the classic nav): the switcher lists the
  // nations actually registered in the current game, named per the active
  // preset/era AND any runtime rename — not every non-coming-soon country with
  // its default name.
  const countryName = useCountryDisplayName();
  const crisisActionCount = useOptionalAuthMe()?.navData?.crisisActionCount ?? 0;
  const switchableCountries = useEnabledCountries();

  const stateLegislatureLabel = stateLegislatureLabelFor(t as unknown as NavTranslator, homeState);

  const canAccessSandbox =
    !user?.singleplayer &&
    hasSandboxAccess({
      isAdmin: user?.isAdmin,
      isModerator: user?.isModerator,
      patreonTier: user?.patreonTier,
      isPatronActive: user?.isPatronActive,
      testerAccessEnabled: user?.sandboxTesterAccess,
      testerGranted: user?.sandboxTesterAccess,
    });
  const showWiki = !!(user?.isAdmin || user?.isModerator) || !wikiDisabled;

  // Top-level tabs: Actions · State · Nation · World (Help and Staff are
  // appended in the bar). Corp and union live on the avatar profile card.
  const navItems: ExperimentalNavItem[] = [];

  if (showProfile && !isImperialMode) {
    // The Campaign tab holds Actions and the Campaign Manager (see campaignNav).
    navItems.push({
      label: t("campaignMenu.label"),
      href: "/actions",
      icon: "Actions",
      key: "campaign",
    });
  }

  if (showProfile && homeState) {
    navItems.push({
      label: homeState.name,
      href: regionUrl(homeState.countryId, homeState.id),
      key: "state",
      icon: "State",
    });
  }

  if (showProfile) {
    navItems.push(
      {
        label: countryName(pageCountry as CountryId),
        href: countryUrl(pageCountry as CountryId),
        key: "nation",
        icon: "Nation",
        useFlag: true,
      },
      { label: t("common.world"), href: "/world", key: "world", icon: "World" }
    );
  }

  const charterEntry =
    activeCharters && activeCharters.length > 0
      ? {
          href: activeCharters.length === 1 ? `/charters/${activeCharters[0]!.id}` : "/charters",
          label:
            activeCharters.length === 1
              ? t("menus.nation.charterSingle", { name: activeCharters[0]!.proposedName })
              : t("menus.nation.chartersMultiple", { count: activeCharters.length }),
        }
      : null;

  const nationalDetailSections = buildNationalDetailsSections(pageCountry as CountryId, {
    activePresidentElection,
    charters: charterEntry,
    hasActiveReferendumCampaign,
    unionsEnabled,
  });

  const worldSubItems = visibleWorldNavItems({
    myCorporationHasGroup,
    countryId: pageCountry,
    myCorporationId,
    unionsEnabled,
    settlementCrisisLive,
    crisisActionCount,
  });

  const profileOrgItems = visibleProfileOrgItems({
    myCorporationId,
    myUnionId,
    unionsEnabled,
  });

  // Empty for non-staff: every staff item is gated on a staff role.
  const staffSubItems = visibleStaffNavItems({
    isAdmin: !!user?.isAdmin,
    isModerator: !!user?.isModerator,
    isJuniorDev: !!user?.isJuniorDev,
    isSingleplayerOwner: viewerIsSingleplayerOwner(user),
  });

  // ── Dropdown panels ────────────────────────────────────────────────────────
  const worldMenu = (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="left"
      width="w-[220px]"
    >
      {worldSubItems.map((item, idx) => {
        const prev = worldSubItems[idx - 1];
        const showLeaderboardHeader =
          item.section === "leaderboard" && prev?.section !== "leaderboard";
        const showMarketsHeader =
          item.section === "main" &&
          item.id === "stockMarket" &&
          prev &&
          (prev.section === "leaderboard" || prev.section === "corporate");
        return (
          <React.Fragment key={item.id}>
            {showLeaderboardHeader && (
              <>
                <div className="px-2.5 pb-1 pt-2 flex items-center gap-2">
                  <span className="text-body-sm font-medium text-muted">
                    {t("menus.world.headers.leaderboard")}
                  </span>
                  <span className="rounded-full bg-warning/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-warning">
                    {t("menus.world.headers.beta")}
                  </span>
                </div>
              </>
            )}
            {showMarketsHeader && (
              <>
                <div className="my-1 mx-2.5 h-px bg-card-border" />
                <MenuLabel>{t("menus.world.headers.markets")}</MenuLabel>
              </>
            )}
            {item.section === "main" && item.id === "nations" && (
              <MenuLabel>{t("menus.world.headers.international")}</MenuLabel>
            )}
            {item.section === "main" && item.id === "sectors" && (
              <>
                <div className="my-1 mx-2.5 h-px bg-card-border" />
                <MenuLabel>{t("menus.world.headers.browse")}</MenuLabel>
              </>
            )}
            <MenuRow
              href={item.href}
              onNavigate={closeAll}
              strong={item.id === "legacyLeaderboard"}
              dot={item.primary ? "bg-primary" : undefined}
              nested={item.parentId != null}
              meta={item.badge ? String(item.badge > 9 ? "9+" : item.badge) : undefined}
              metaClass="rounded-full bg-error px-1.5 text-[10px] font-semibold text-white"
            >
              {t(item.labelKey)}
            </MenuRow>
          </React.Fragment>
        );
      })}
    </DropdownPanel>
  );

  const nationMenu = showProfile ? (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="left"
      width="w-[240px]"
      padded={false}
    >
      <div className="p-1.5">
        <MenuLabel>{t("menus.nation.homeNation")}</MenuLabel>
        <MenuRow href={countryUrl(userCountry as CountryId)} onNavigate={closeAll} strong>
          {countryName(userCountry as CountryId)}
        </MenuRow>
        {cabinetOffice && (
          <MenuRow
            href={cabinetOfficeUrl(cabinetOffice.countryCode, cabinetOffice.positionId)}
            onNavigate={closeAll}
          >
            {t("menus.nation.cabinetOffice")}
          </MenuRow>
        )}
        {justiceOffice && (
          <MenuRow href={scotusJusticeOfficeUrl(justiceOffice.countryCode)} onNavigate={closeAll}>
            {t("menus.nation.justiceOffice")}
          </MenuRow>
        )}
        {currentParty && (
          <MenuRow
            href={partyUrl(currentParty.countryId ?? pageCountry, currentParty.id)}
            onNavigate={closeAll}
          >
            {t("menus.nation.myParty")} · {currentParty.name}
          </MenuRow>
        )}
        {countryHasFeature("usUi", userCountry) && (
          <MenuRow href="/political-operations" onNavigate={closeAll}>
            {t("menus.nation.myPoliticalOperations")}
          </MenuRow>
        )}
      </div>
      <div className="border-t border-card-border p-1.5">
        <MenuLabel>{t("menus.nation.nationalDetails")}</MenuLabel>
        {nationalDetailSections.map((section) => {
          const isCollapsible = section.collapsible === true;
          const isExpanded = !isCollapsible || expandedNationSections[section.title] === true;
          return (
            <div key={section.title}>
              {isCollapsible ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedNationSections((prev) => ({
                      ...prev,
                      [section.title]: !prev[section.title],
                    }))
                  }
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80 transition-colors hover:text-foreground"
                >
                  {t(section.titleKey)}
                  {/* Explicit `text-muted` — same fix as CollapsibleNavSection
                      (mobile): the chevron must read at full contrast even
                      though the label itself stays a faint small-caps tag. */}
                  <svg
                    className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ease-out ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <div className="px-2.5 pb-1 pt-2 text-body-sm font-medium text-muted">
                  {t(section.titleKey)}
                </div>
              )}
              {isExpanded &&
                section.items.map((item) => (
                  <MenuRow key={item.id} href={item.href} onNavigate={closeAll}>
                    {item.labelKey ? t(item.labelKey) : item.label}
                  </MenuRow>
                ))}
            </div>
          );
        })}
      </div>
    </DropdownPanel>
  ) : null;

  const campaignMenu = (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="left"
      width="w-[300px]"
    >
      {buildCampaignNavItems(t).map((item) => (
        <MenuRow
          key={item.id}
          href={item.href}
          onNavigate={closeAll}
          strong={isNavActive(pathname, item.href)}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{item.label}</span>
            <span className="text-[12px] font-normal leading-snug text-muted">
              {item.description}
            </span>
          </span>
        </MenuRow>
      ))}
    </DropdownPanel>
  );

  const stateMenu = homeState ? (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="left"
      width="w-[220px]"
    >
      <MenuLabel>{homeState.name}</MenuLabel>
      <MenuRow href={regionUrl(homeState.countryId, homeState.id)} onNavigate={closeAll} strong>
        {t("state.overview")}
      </MenuRow>
      {currentParty && (
        <MenuRow
          href={regionPartyUrl(homeState.countryId, homeState.id, currentParty.id)}
          onNavigate={closeAll}
        >
          {homeState.name} · {currentParty.name}
        </MenuRow>
      )}
      <MenuRow
        href={`${regionUrl(homeState.countryId, homeState.id)}?tab=economy`}
        onNavigate={closeAll}
      >
        {t("state.economy")}
      </MenuRow>
      <MenuRow href={regionElectionsUrl(homeState.countryId, homeState.id)} onNavigate={closeAll}>
        {t("state.elections")}
      </MenuRow>
      <MenuRow href={regionLegislatureUrl(homeState.countryId, homeState.id)} onNavigate={closeAll}>
        {stateLegislatureLabel}
      </MenuRow>
      {governorOffice && governorOffice.stateId === homeState.id && (
        <MenuRow
          href={`${regionUrl(homeState.countryId.toLowerCase(), homeState.id.toLowerCase())}/office`}
          onNavigate={closeAll}
        >
          {t("state.governorOffice")}
        </MenuRow>
      )}
      {cabinetOffice && (
        <MenuRow
          href={`/country/${cabinetOffice.countryCode}/executive/cabinet/${cabinetOffice.positionId}/office`}
          onNavigate={closeAll}
        >
          {t("menus.nation.cabinetOffice")} · {cabinetOffice.positionName}
        </MenuRow>
      )}
      {activeElection ? (
        <MenuRow
          href={campaignManagerHref({ race: activeElection.id })}
          onNavigate={closeAll}
          metaClass="text-primary"
          meta={t("common.active")}
        >
          {t("state.myElection")}
        </MenuRow>
      ) : null}
    </DropdownPanel>
  ) : null;

  const helpMenu = (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="right"
      width="w-[220px]"
    >
      <MenuLabel>{t("help.resources")}</MenuLabel>
      <MenuRow
        href={showWiki ? "https://wiki.ahousedividedgame.com" : "/guides"}
        onNavigate={closeAll}
      >
        {showWiki ? t("help.wikiGuides") : t("help.guides")}
      </MenuRow>
      <MenuRow href="/about" onNavigate={closeAll}>
        {t("help.about")}
      </MenuRow>
      <MenuRow href="/feedback" onNavigate={closeAll}>
        {t("help.suggestions")}
      </MenuRow>
      <div className="my-1 mx-2.5 h-px bg-card-border" />
      <MenuLabel>{t("help.community")}</MenuLabel>
      <a
        href={HELP_DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={closeAll}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-2 transition-colors hover:bg-white/5"
      >
        Discord
      </a>
      <a
        href={HELP_PATREON_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={closeAll}
        className="store-purchase-cta flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-2 transition-colors hover:bg-white/5"
      >
        {t("help.patreon")}
      </a>
      <a
        href={HELP_SUPPORTER_WALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={closeAll}
        className="store-purchase-cta flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-2 transition-colors hover:bg-white/5"
      >
        {t("help.supporterWall")}
      </a>
      <a
        href={HELP_SUPPORT_EMAIL}
        onClick={closeAll}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-2 transition-colors hover:bg-white/5"
      >
        {t("help.emailSupport")}
      </a>
      {onOpenFeedback && (
        <button
          type="button"
          onClick={() => {
            closeAll();
            onOpenFeedback();
          }}
          disabled={feedbackCapturing}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-2 transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-70"
        >
          {feedbackCapturing ? t("common.capturingScreenshot") : t("common.quickSuggest")}
        </button>
      )}
      <div className="my-1 mx-2.5 h-px bg-card-border" />
      <MenuRow href="/privacy" onNavigate={closeAll}>
        {t("help.privacy")}
      </MenuRow>
      <MenuRow href="/terms" onNavigate={closeAll}>
        {t("help.terms")}
      </MenuRow>
    </DropdownPanel>
  );

  const staffMenu = (
    <DropdownPanel
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
      align="right"
      width="w-52"
    >
      <MenuLabel>{t("common.staff")}</MenuLabel>
      {staffSubItems.map((item) =>
        item.external ? (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-2 transition-colors hover:bg-white/5"
          >
            {t(item.labelKey)}
          </a>
        ) : (
          <MenuRow key={item.label} href={item.href} onNavigate={closeAll}>
            {t(item.labelKey)}
          </MenuRow>
        )
      )}
    </DropdownPanel>
  );

  // User / profile dropdown
  const profileDisplayName = characterProfile?.name ?? user?.username ?? "";
  const userMenu = user ? (
    <ExperimentalUserMenu
      user={user}
      characterProfile={characterProfile}
      profileDisplayName={profileDisplayName}
      showProfile={showProfile}
      isImperialMode={isImperialMode}
      unreadCount={unreadCount}
      adminCharacters={adminCharacters}
      imperialCharacter={imperialCharacter}
      switchingCharacter={switchingCharacter}
      switchingImperial={switchingImperial}
      canAccessSandbox={canAccessSandbox}
      profileOrgItems={profileOrgItems}
      closeAll={closeAll}
      handleSwitchCharacter={handleSwitchCharacter}
      handleSwitchImperial={handleSwitchImperial}
      handleSignOut={handleSignOut}
      anchorRef={dropdownAnchorRef}
      panelRef={dropdownPanelRef}
    />
  ) : null;

  const useDesktopMegaMenu = desktopLayout !== null && desktopLayout !== "standard";
  // The phone dock shows these same menus as card sheets, so it builds them too.
  const buildMenu = (key: DesktopMenuKey) =>
    mobileDock || (useDesktopMegaMenu && (open === key || customizableNav));
  const desktopMenus = buildDesktopMenus({
    t: t as unknown as NavTranslator,
    build: buildMenu,
    showProfile,
    pageCountry: pageCountry as CountryId,
    userCountry: userCountry as CountryId,
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
    unionsEnabled,
    settlementCrisisLive,
    nationalDetailSections,
    stateLegislatureLabel,
    staffSubItems,
    showWiki,
    onOpenFeedback,
    feedbackCapturing,
  });
  // Saved group order applies to the grouped-cards layout only.
  const orderedMenu = (key: DesktopMenuKey, menu: DesktopNavMenu): DesktopNavMenu =>
    customizableNav
      ? {
          ...menu,
          groups: menu.groups.map((group) => ({
            ...group,
            items: applySavedOrder(group.items, custom.order[navGroupKey(key, group.id)]),
          })),
        }
      : menu;
  const openMenuKey = CUSTOMIZABLE_MENUS.find((key) => key === open);
  const openMenu = openMenuKey ? desktopMenus[openMenuKey] : undefined;
  const desktopMenu = openMenuKey && openMenu ? orderedMenu(openMenuKey, openMenu) : null;

  const customizableMenus = customizableNav
    ? CUSTOMIZABLE_MENUS.flatMap((key) => {
        const menu = desktopMenus[key];
        // Only menus that have a tab in the bar, so a pin never outlives its menu.
        const hasTab =
          key === "help" ||
          (key === "staff"
            ? !!(user?.isAdmin || user?.isModerator)
            : navItems.some((item) => item.key === key));
        return menu && hasTab ? [{ id: key, menu }] : [];
      })
    : [];
  const pinLookup = new Map<string, DesktopNavLink>();
  for (const { id, menu } of customizableMenus) {
    for (const item of [...menu.groups.flatMap((group) => group.items), ...menu.shortcuts]) {
      const key = navPinKey(id, item.id);
      if (item.href && !item.disabled && !pinLookup.has(key)) pinLookup.set(key, item);
    }
  }
  const pinnedLinks = custom.pinned.flatMap((key) => {
    const item = pinLookup.get(key);
    return item ? [{ key, item }] : [];
  });
  const pinsFull = custom.pinned.length >= MAX_NAV_PINS;

  // Experimental: a widget the player placed in this menu's side column.
  const menuWidgetKey =
    widgetSetup.enabled && openMenuKey ? widgetSetup.layout.nav[openMenuKey] : undefined;
  const menuWidgetFetchKey = menuWidgetKey ? widgetSetup.resolveKey(menuWidgetKey) : null;
  const menuWidget = menuWidgetKey ? (
    <SidebarWidget
      compact
      widgetKey={menuWidgetKey}
      data={menuWidgetData.data[menuWidgetFetchKey!]}
      loaded={menuWidgetData.loaded(menuWidgetFetchKey!)}
      exchangeLabel={widgetSetup.options.find((option) => option.key === menuWidgetKey)?.label}
      onNavigate={closeAll}
    />
  ) : undefined;

  const megaPanel =
    desktopMenu && desktopLayout && desktopLayout !== "standard" ? (
      <DesktopMegaMenu
        key={open}
        menu={desktopMenu}
        menuId={open ?? "unknown"}
        layout={desktopLayout}
        anchorRef={dropdownAnchorRef}
        panelRef={dropdownPanelRef}
        onClose={closeAll}
        widget={menuWidget}
        {...(customizableNav && openMenuKey
          ? {
              pinnedIds: new Set(
                custom.pinned
                  .filter((key) => key.startsWith(`${openMenuKey}:`))
                  .map((key) => key.slice(openMenuKey.length + 1))
              ),
              pinsFull,
              onTogglePin: (itemId: string) =>
                updateCustom(togglePin(custom, navPinKey(openMenuKey, itemId))),
              onCustomize: () => setCustomizeOpen(true),
            }
          : {})}
      />
    ) : null;

  const { tabs: dockTabs, sheets: dockSheets } = useMobileDockModel({
    enabled: mobileDock,
    pathname,
    pageCountry: pageCountry as CountryId,
    countryName,
    homeState,
    myCorporationId,
    isImperialMode,
    singleplayer: !!user?.singleplayer,
    unreadCount,
    profileDisplayName,
    switchableCountries,
    menus: {
      state: desktopMenus.state && orderedMenu("state", desktopMenus.state),
      nation: desktopMenus.nation && orderedMenu("nation", desktopMenus.nation),
      world: desktopMenus.world && orderedMenu("world", desktopMenus.world),
      help: desktopMenus.help && orderedMenu("help", desktopMenus.help),
      staff: desktopMenus.staff && orderedMenu("staff", desktopMenus.staff),
    },
    onClose: () => setDockSheet(null),
    search: <UniversalSearch onNavigate={() => setDockSheet(null)} />,
  });
  return {
    kind: "context" as const,
    context: {
      NavCustomizeDialog,
      activeElection,
      adminCharacters,
      barRef,
      cabinetOffice,
      campaignMenu,
      characterProfile,
      charterEntry,
      clientShell,
      closeAll,
      countryName,
      currentParty,
      custom,
      customizableMenus,
      customizableNav,
      customizeOpen,
      dockSheet,
      dockSheets,
      dockTabs,
      dropdownAnchorRef,
      dropdownPanelRef,
      experimentVariant,
      feedbackCapturing,
      governorOffice,
      handleSignOut,
      handleSwitchCharacter,
      handleSwitchImperial,
      hasActiveReferendumCampaign,
      helpMenu,
      homeState,
      imperialCharacter,
      isImperialMode,
      justiceOffice,
      megaPanel,
      mobileDock,
      mobileMenuOpen,
      mobilePortalReady,
      mobileProfileOpen,
      mobileSubOpen,
      nationMenu,
      navItems,
      navigationVariant,
      onOpenFeedback,
      open,
      pageCountry,
      pathname,
      pinLookup,
      pinnedLinks,
      profileDisplayName,
      profileOrgItems,
      searchContainerRef,
      searchOpen,
      setCustomizeOpen,
      setDockSheet,
      setMobileMenuOpen,
      setMobileProfileOpen,
      setSearchOpen,
      showProfile,
      showWiki,
      staffMenu,
      staffSubItems,
      stateLegislatureLabel,
      stateMenu,
      switchableCountries,
      switchingCharacter,
      switchingImperial,
      t,
      toggle,
      toggleMobileSub,
      typedWordmark,
      unionsEnabled,
      unreadCount,
      updateCustom,
      useDesktopMegaMenu,
      user,
      userCountry,
      userMenu,
      worldMenu,
      worldSubItems,
    },
  };
}
export type ExperimentalNavbarViewContext = Extract<
  ReturnType<typeof useExperimentalNavbarContext>,
  { kind: "context" }
>["context"];

export const ExperimentalNavbar = React.memo(function ExperimentalNavbar(
  ...args: Parameters<typeof useExperimentalNavbarContext>
) {
  const result = useExperimentalNavbarContext(...args);
  return renderExperimentalNavbarView(result.context);
});

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
