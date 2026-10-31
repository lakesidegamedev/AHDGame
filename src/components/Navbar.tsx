"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useClickOutside } from "@/hooks/useClickOutside";
import { fetchJson } from "@/lib/observability/fetchJson";
import { useNavbarState } from "./navbar/useNavbarState";
import {
  type AdminCharacter,
  type ImperialCharacterNav,
  type NavbarActiveElection,
  type NavbarCabinetOffice,
  type NavbarCurrentParty,
  type NavbarGovernorOffice,
  type NavbarHomeState,
  type NavbarJusticeOffice,
  type NavbarUser,
} from "./navbar/navbarTypes";
import { isActionRequiredType } from "@/lib/inbox/priority";
import type { NotificationType } from "@/lib/db/types/notifications";
import Link from "next/link";
import Image from "next/image";
import { CDN_LOGO_URL } from "@/lib/images/cdnStaticUrls";
import { usePathname } from "next/navigation";
import { StateDropdown } from "./StateDropdown";
import { SingleplayerEndTurnButton } from "@/components/singleplayer/SingleplayerEndTurnButton";
import { StaffDropdown } from "./StaffDropdown";
import { NationDropdown } from "./NationDropdown";
import { WorldDropdown } from "./WorldDropdown";
import { SettingsDropdown } from "./SettingsDropdown";
import { CountryFlag } from "@/components/CountryFlag";
import { HelpDropdown } from "./HelpDropdown";
// Interaction-only panels load on first open (or on hover/focus of the trigger),
// so they stay out of the first-paint graph. The triggers themselves stay eager.
const UniversalSearch = dynamic(() => import("./UniversalSearch").then((m) => m.UniversalSearch), {
  ssr: false,
});
const ProfileSwitcher = dynamic(
  () => import("./navbar/ProfileSwitcher").then((m) => m.ProfileSwitcher),
  { ssr: false }
);
const NavbarNotificationPanel = dynamic(
  () => import("./NavbarNotificationPanel").then((m) => m.NavbarNotificationPanel),
  { ssr: false }
);
const preloadSearch = () => import("./UniversalSearch");
const preloadProfileSwitcher = () => import("./navbar/ProfileSwitcher");
const preloadNotificationPanel = () => import("./NavbarNotificationPanel");
// The hamburger body is the largest module the navbar owns, and the closed menu
// renders nothing, so it ships on first open. Pointerdown/focus warms the chunk
// before the click commits, so opening is instant on the common touch path.
const MobileMenu = dynamic(
  () => import("./navbar/NavbarMobileMenu").then((m) => m.NavbarMobileMenu),
  { ssr: false }
);
const preloadMobileMenu = () => import("./navbar/NavbarMobileMenu");
import { type CountryId } from "@/lib/constants/countriesCore";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { useCountryContext } from "@/hooks/useCountryContext";
import { useActiveCharters } from "@/hooks/useActiveCharters";
import { useActiveReferendumCampaign } from "@/hooks/useActiveReferendumCampaign";
import { UK_NATIONS, UK_REGIONS } from "@/lib/constants/uk";
import { ImperialMark } from "./navbar/ImperialMark";
import { viewerIsSingleplayerOwner } from "@/components/navbar/staffNavItems";
import { Wordmark } from "@/components/Wordmark";

interface NavbarProps {
  clientShell?: boolean;
  /** Type the site name in on load, in mono (1991 worlds). */
  typedWordmark?: boolean;
  user?: NavbarUser;
  showProfile?: boolean;
  homeState?: NavbarHomeState;
  currentParty?: NavbarCurrentParty;
  activeElection?: NavbarActiveElection;
  cabinetOffice?: NavbarCabinetOffice;
  justiceOffice?: NavbarJusticeOffice;
  governorOffice?: NavbarGovernorOffice;
  activePresidentElectionId?: string;
  activePresidentElectionSeatId?: string;
  unreadCount?: number;
  myCorporationId?: number | null;
  myCorporationHasGroup?: boolean;
  myUnionId?: string | null;
  onOpenFeedback?: () => void;
  feedbackCapturing?: boolean;
  adminCharacters?: AdminCharacter[];
  imperialCharacter?: ImperialCharacterNav;
  isImperialMode?: boolean;
  wikiDisabled?: boolean;
  conflictsEnabled?: boolean;
  unionsEnabled?: boolean;
  settlementCrisisLive?: boolean;
  initialPageCountry?: CountryId | null;
}

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export const Navbar = React.memo(function Navbar({
  clientShell = false,
  typedWordmark = false,
  user,
  showProfile = false,
  homeState,
  currentParty,
  activeElection,
  cabinetOffice,
  justiceOffice,
  governorOffice,
  activePresidentElectionId,
  activePresidentElectionSeatId,
  unreadCount = 0,
  myCorporationId = null,
  myCorporationHasGroup = false,
  myUnionId = null,
  onOpenFeedback,
  feedbackCapturing = false,
  adminCharacters,
  imperialCharacter,
  isImperialMode = false,
  wikiDisabled = false,
  conflictsEnabled = false,
  unionsEnabled = false,
  settlementCrisisLive = false,
  initialPageCountry,
}: NavbarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // State managed by useNavbarState reducer. The mobile menu body receives the
  // whole state object, so only the fields this shell itself reads are unpacked
  // here and every setter is a `dispatch(...)` call.
  const [navState, dispatch] = useNavbarState();
  const {
    mobileMenuOpen,
    profileOpen,
    switchingCharacter,
    switchingImperial,
    searchOpen,
    notifOpen,
    notifPreviews,
  } = navState;
  // Active charters for the mobile-menu /charters entry, gated the same way as
  // NationDropdown's desktop entry. Fetches when the hamburger opens (desktop
  // uses its own gate via the same hook).
  const mobileActiveCharters = useActiveCharters(mobileMenuOpen);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  // Search is interactive only; keep it mounted after the first open so closing
  // and reopening keeps the query, but do not ship it on first paint.
  // Search is interactive only; mount it on first open and keep it mounted so
  // closing and reopening keeps the query, but keep it off first paint.
  const [searchMounted, setSearchMounted] = useState(false);

  // Derive country context from URL, path, or the server-resolved page country.
  const { pageCountry, userCountry, isUKContext } = useCountryContext(
    homeState?.id,
    homeState?.countryId,
    initialPageCountry
  );
  const countryName = useCountryDisplayName();
  // Mobile Referendums link gate — fetched only while the hamburger is open.
  const hasActiveReferendumCampaign = useActiveReferendumCampaign(
    pageCountry as CountryId,
    mobileMenuOpen
  );
  const stateLegislatureLabel = (() => {
    const id = homeState?.id;
    if (!isUKContext) return t("state.legislature");
    const nation = UK_NATIONS.find((n) => n.id === id);
    if (nation?.devolvedBody) return nation.devolvedBody;
    const region = UK_REGIONS.find((r) => r.id === id);
    const parentNation = UK_NATIONS.find((n) => n.id === region?.nationId);
    return parentNation?.devolvedBody ?? t("state.legislature");
  })();

  const stateAdjective = (() => {
    const id = homeState?.id;
    if (!isUKContext) return homeState?.name;
    const region = UK_REGIONS.find((r) => r.id === id);
    return region?.adjective ?? homeState?.name;
  })();
  const activeProfileCharacter = adminCharacters?.find((c) => c.isActive);

  // Close the mobile menu automatically once screenshot capture finishes
  const prevCapturing = useRef(false);
  useEffect(() => {
    if (prevCapturing.current && !feedbackCapturing) {
      dispatch({ type: "SET_MOBILE_MENU", open: false });
    }
    prevCapturing.current = feedbackCapturing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackCapturing]);

  // Close profile dropdown on click outside (desktop only).
  // `click` event instead of `mousedown` so the toggle button's own handler
  // fires first — otherwise the toggle and the close would race.
  useClickOutside(
    profileDropdownRef,
    profileOpen,
    () => dispatch({ type: "CLOSE_DROPDOWN", key: "profile" }),
    {
      eventType: "click",
      closeOnEscape: true,
    }
  );

  // Close search on click outside
  useClickOutside(
    searchContainerRef,
    searchOpen,
    () => dispatch({ type: "SET_POPOVER", key: "search", open: false }),
    {
      closeOnEscape: true,
    }
  );

  // Close notification dropdown on click outside
  useClickOutside(notifDropdownRef, notifOpen, () =>
    dispatch({ type: "SET_POPOVER", key: "notif", open: false })
  );

  // Fetch recent notifications when dropdown opens
  useEffect(() => {
    if (!notifOpen) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchJson<any>("/api/notifications?limit=5&offset=0", { feature: "navbar-notifications" })
      .then((data) => {
        if (data?.notifications)
          dispatch({ type: "SET_NOTIF_PREVIEWS", items: data.notifications.slice(0, 5) });
      })
      // Preview-only dropdown; fetchJson already reported any 5xx/network fault,
      // so a failure just leaves the previews empty.
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  const markNotifRead = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    dispatch({ type: "MARK_PREVIEW_READ", id });
  };

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    dispatch({ type: "REMOVE_PREVIEW", id });
  };

  const handleSwitchCharacter = useCallback(
    async (characterId: string) => {
      if (switchingCharacter) return;
      dispatch({ type: "SET_SWITCHING", key: "character", value: true });
      try {
        const res = await fetch("/api/auth/active-character", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        if (res.ok) {
          window.location.reload();
        } else {
          // Defensive parse of the error body; surfaced via console.error below.
          const data = await res.json().catch(() => ({}));
          console.error("Switch character failed:", res.status, data);
        }
      } catch (e) {
        console.error("Switch character error:", e);
      } finally {
        dispatch({ type: "SET_SWITCHING", key: "character", value: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [switchingCharacter]
  );

  const handleSwitchImperial = useCallback(
    async (type: "character" | "imperial") => {
      if (switchingImperial) return;
      dispatch({ type: "SET_SWITCHING", key: "imperial", value: true });
      try {
        const res = await fetch("/api/imperial-characters/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        if (res.ok) {
          window.location.reload();
        } else {
          // Defensive parse of the error body; surfaced via console.error below.
          const data = await res.json().catch(() => ({}));
          console.error("Switch imperial failed:", res.status, data);
        }
      } catch (e) {
        console.error("Switch imperial error:", e);
      } finally {
        dispatch({ type: "SET_SWITCHING", key: "imperial", value: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [switchingImperial]
  );

  const handleSignOut = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (res.ok) window.location.assign("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const closeMobileMenu = () => {
    dispatch({ type: "SET_MOBILE_MENU", open: false });
    dispatch({ type: "CLOSE_ALL_DROPDOWNS" });
  };

  return (
    <nav
      data-site-navbar
      className="ahd-navbar-enter sticky top-0 z-50 border-b pt-[env(safe-area-inset-top,0px)] border-card-border/60 bg-card/50 shadow-panel backdrop-blur-xl"
      aria-label={t("common.mainNavigation")}
      data-feedback-ignore="true"
    >
      {/* Top accent line: see NavbarTopFlair (fixed strip while client-nav loads + reveal) */}
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 relative">
        {/* Logo */}
        <Link
          href="/profile"
          className="flex items-center gap-2 transition-opacity hover:opacity-80 shrink-0"
          onClick={closeMobileMenu}
        >
          <Image
            src={CDN_LOGO_URL}
            priority
            unoptimized
            alt="A House Divided Logo"
            width={36}
            height={36}
            className="object-contain shrink-0"
          />
          {/* Site name fades on sub-md displays when search is open so the search field can slide over it */}
          <span
            className={`text-base font-semibold tracking-tight hidden sm:inline transition-opacity duration-300 ${searchOpen ? "opacity-0 md:opacity-100" : "opacity-100"} ${typedWordmark ? "font-mono" : ""}`}
            aria-hidden={searchOpen ? "true" : undefined}
          >
            <Wordmark typed={typedWordmark} />
          </span>
        </Link>

        {/* Right-aligned group — dropdowns + icon cluster stay tight together so justify-between only gaps logo↔group */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop dropdowns — fade out when search overlay is expanded */}
          <div
            className={`hidden items-center gap-2 md:flex shrink-0 transition-opacity duration-200 ${searchOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            aria-hidden={searchOpen ? "true" : undefined}
          >
            {showProfile &&
            ((adminCharacters && adminCharacters.length > 1) || imperialCharacter) ? (
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "profile" })}
                  onPointerEnter={preloadProfileSwitcher}
                  onFocus={preloadProfileSwitcher}
                  className={`relative flex items-center gap-2 px-2.5 py-1 text-sm transition-colors hover:text-foreground ${isNavActive(pathname, "/profile") ? "font-medium text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:rounded-full after:bg-primary after:opacity-70" : "text-muted"}`}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                >
                  {isImperialMode ? (
                    <ImperialMark />
                  ) : (
                    activeProfileCharacter && (
                      <CountryFlag country={activeProfileCharacter.countryId} size="sm" />
                    )
                  )}
                  <span className="max-w-36 truncate">
                    {isImperialMode
                      ? (imperialCharacter?.name ?? t("common.imperial"))
                      : (activeProfileCharacter?.name ?? t("common.profile"))}
                  </span>
                  <ChevronIcon open={profileOpen} />
                </button>
                {profileOpen && (
                  <ProfileSwitcher
                    variant="desktop"
                    characters={adminCharacters ?? []}
                    imperialCharacter={imperialCharacter}
                    isImperialMode={isImperialMode}
                    switchingImperial={switchingImperial}
                    charactersLabel={t("userMenu.characters")}
                    imperialLabel={t("common.imperial")}
                    activeLabel={t("common.active")}
                    characterSwitchHref={(id) =>
                      `/api/auth/active-character?switch=${encodeURIComponent(id)}`
                    }
                    imperialHref={
                      imperialCharacter ? `/imperial/${imperialCharacter.id}` : undefined
                    }
                    onSelectImperial={(target) => {
                      dispatch({ type: "CLOSE_DROPDOWN", key: "profile" });
                      handleSwitchImperial(target);
                    }}
                    onNavigate={() => dispatch({ type: "CLOSE_DROPDOWN", key: "profile" })}
                  />
                )}
              </div>
            ) : (
              showProfile && (
                <Link
                  href="/profile"
                  className={`relative px-2.5 py-1 text-sm transition-colors hover:text-foreground ${isNavActive(pathname, "/profile") ? "font-medium text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:rounded-full after:bg-primary after:opacity-70" : "text-muted"}`}
                  aria-current={isNavActive(pathname, "/profile") ? "page" : undefined}
                >
                  {t("common.profile")}
                </Link>
              )
            )}

            {showProfile && !isImperialMode && (
              <Link
                href="/actions"
                data-coach="nav-actions"
                className={`relative px-2.5 py-1 text-sm transition-colors hover:text-foreground ${isNavActive(pathname, "/actions") ? "font-medium text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:rounded-full after:bg-primary after:opacity-70" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/actions") ? "page" : undefined}
              >
                {t("common.actions")}
              </Link>
            )}

            {homeState && (
              <StateDropdown
                stateId={homeState.id}
                stateName={homeState.name}
                countryId={homeState.countryId}
                currentParty={currentParty}
                activeElection={activeElection}
                cabinetOffice={cabinetOffice}
                governorOffice={governorOffice}
              />
            )}

            {showProfile && (
              <NationDropdown
                currentParty={currentParty}
                cabinetOffice={cabinetOffice}
                justiceOffice={justiceOffice}
                activePresidentElectionId={activePresidentElectionId}
                activePresidentElectionSeatId={activePresidentElectionSeatId}
                isUKContext={isUKContext}
                countryId={pageCountry}
                userCountry={userCountry}
                unionsEnabled={unionsEnabled}
              />
            )}

            {showProfile && (
              <WorldDropdown
                isUKContext={isUKContext}
                countryId={pageCountry}
                myCorporationId={myCorporationId}
                myCorporationHasGroup={myCorporationHasGroup}
                myUnionId={myUnionId}
                conflictsEnabled={conflictsEnabled}
                unionsEnabled={unionsEnabled}
                settlementCrisisLive={settlementCrisisLive}
              />
            )}

            {!user?.singleplayer && (
              <Link
                href="/contests"
                className={`relative px-2.5 py-1 text-sm transition-colors hover:text-foreground ${isNavActive(pathname, "/contests") ? "font-medium text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:rounded-full after:bg-primary after:opacity-70" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/contests") ? "page" : undefined}
              >
                {t("common.contests")}
              </Link>
            )}

            <HelpDropdown
              onOpenFeedback={onOpenFeedback}
              feedbackCapturing={feedbackCapturing}
              wikiDisabled={wikiDisabled}
              isAdminOrMod={!!(user?.isAdmin || user?.isModerator)}
            />

            <StaffDropdown
              isAdmin={!!user?.isAdmin}
              isModerator={!!user?.isModerator}
              isSingleplayerOwner={viewerIsSingleplayerOwner(user)}
            />

            {user?.singleplayer && !clientShell && <SingleplayerEndTurnButton />}
          </div>

          {/* Search + icon cluster */}
          <div className="flex items-center gap-1 shrink-0 relative">
            {/* Search input — absolutely positioned so it grows leftward without displacing icons */}
            <div
              ref={searchContainerRef}
              className={`absolute right-full top-1/2 -translate-y-1/2 mr-1 overflow-hidden transition-all duration-300 ease-out ${
                searchOpen
                  ? "w-[min(calc(100vw-9rem),20rem)] sm:w-[20rem] md:w-[26rem] lg:w-[30rem] opacity-100"
                  : "w-0 opacity-0"
              }`}
              style={{ pointerEvents: searchOpen ? "auto" : "none" }}
            >
              {searchMounted && (
                <UniversalSearch
                  open={searchOpen}
                  onNavigate={() => dispatch({ type: "SET_POPOVER", key: "search", open: false })}
                />
              )}
            </div>

            <button
              onClick={() => {
                if (!searchOpen) setSearchMounted(true);
                dispatch({ type: "SET_POPOVER", key: "search", open: !searchOpen });
              }}
              onPointerEnter={preloadSearch}
              onFocus={preloadSearch}
              className={`relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-card hover:text-foreground ${searchOpen ? "text-foreground bg-card" : "text-muted"}`}
              aria-label={t("common.search")}
              aria-expanded={searchOpen}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {showProfile && (
              <Link
                href="/portfolio?tab=currency"
                className={`relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-card hover:text-foreground ${isNavActive(pathname, "/portfolio") ? "text-foreground" : "text-muted"}`}
                aria-label={t("common.wallet")}
                aria-current={isNavActive(pathname, "/portfolio") ? "page" : undefined}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </Link>
            )}

            {showProfile && (
              <div className="relative" ref={notifDropdownRef}>
                <button
                  onClick={() => dispatch({ type: "SET_POPOVER", key: "notif", open: !notifOpen })}
                  onPointerEnter={preloadNotificationPanel}
                  onFocus={preloadNotificationPanel}
                  className={`relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-card hover:text-foreground ${isNavActive(pathname, "/notifications") ? "text-foreground" : "text-muted"} ${notifPreviews.some((n) => !n.read && isActionRequiredType(n.type as NotificationType)) ? "ahd-bell-pulse" : ""}`}
                  aria-label={
                    unreadCount > 0
                      ? t("notifications.ariaUnread", { count: unreadCount })
                      : t("common.notifications")
                  }
                  aria-expanded={notifOpen}
                  aria-haspopup="menu"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {unreadCount > 0 && (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
                      aria-hidden
                    />
                  )}
                </button>
                {notifOpen && (
                  <NavbarNotificationPanel
                    previews={notifPreviews}
                    onMarkRead={markNotifRead}
                    onDelete={deleteNotif}
                    onClose={() => dispatch({ type: "SET_POPOVER", key: "notif", open: false })}
                  />
                )}
              </div>
            )}

            {/* Settings gear — visible on both desktop and mobile so the
                country/nation toggle is reachable without opening the
                hamburger menu. */}
            {user && (
              <SettingsDropdown
                user={user}
                onSignOut={handleSignOut}
                pageCountry={pageCountry}
                userCountry={userCountry}
              />
            )}

            {!user && (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  {t("common.signIn")}
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 h-9 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-dark active:scale-[0.98]"
                >
                  {t("common.register")}
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card hover:text-foreground"
              onClick={() => dispatch({ type: "SET_MOBILE_MENU", open: !mobileMenuOpen })}
              onPointerDown={preloadMobileMenu}
              onFocus={preloadMobileMenu}
              aria-label={mobileMenuOpen ? t("common.closeMenu") : t("common.openMenu")}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel - the body is its own lazily loaded module. */}
      {mobileMenuOpen && (
        <MobileMenu
          pathname={pathname}
          navState={navState}
          dispatch={dispatch}
          user={user}
          showProfile={showProfile}
          adminCharacters={adminCharacters}
          imperialCharacter={imperialCharacter}
          isImperialMode={isImperialMode}
          homeState={homeState}
          currentParty={currentParty}
          activeElection={activeElection}
          cabinetOffice={cabinetOffice}
          justiceOffice={justiceOffice}
          governorOffice={governorOffice}
          activePresidentElectionId={activePresidentElectionId}
          activePresidentElectionSeatId={activePresidentElectionSeatId}
          myCorporationId={myCorporationId}
          myCorporationHasGroup={myCorporationHasGroup}
          myUnionId={myUnionId}
          onOpenFeedback={onOpenFeedback}
          feedbackCapturing={feedbackCapturing}
          wikiDisabled={wikiDisabled}
          conflictsEnabled={conflictsEnabled}
          unionsEnabled={unionsEnabled}
          settlementCrisisLive={settlementCrisisLive}
          pageCountry={pageCountry}
          userCountry={userCountry}
          countryName={countryName}
          stateAdjective={stateAdjective}
          stateLegislatureLabel={stateLegislatureLabel}
          mobileActiveCharters={mobileActiveCharters}
          hasActiveReferendumCampaign={hasActiveReferendumCampaign}
          onClose={closeMobileMenu}
          onSwitchCharacter={handleSwitchCharacter}
          onSwitchImperial={handleSwitchImperial}
        />
      )}
    </nav>
  );
});
