"use client";
import type { ReactNode } from "react";
import { unreadBadgeLabel } from "@/lib/inbox/badgeLabel";
import type { ExperimentalNavbarViewContext } from "./ExperimentalNavbar";

import { createPortal } from "react-dom";

import Link from "@/components/navbar/NavigationLink";
import Image from "next/image";

import { SHELL_LOGO_URL } from "@/lib/images/cdnStaticUrls";
import { captureProductEvent } from "@/lib/analytics/capture";
import { SingleplayerEndTurnButton } from "@/components/singleplayer/SingleplayerEndTurnButton";
import { UniversalSearch } from "./UniversalSearch";
import { Avatar } from "./Avatar";
import { CountryFlag } from "@/components/CountryFlag";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_DISPLAY_CODES } from "@/lib/constants/countryDisplayCodes";

import { countryUrl } from "@/lib/urls";

import {
  Chevron,
  DropdownPanel,
  MenuLabel,
  NavIcon,
  NavItemChevron,
  NavItemLabel,
  isNavActive,
  navTabClassName,
} from "@/components/navbar/experimentalNavPrimitives";

import { NavSettingsMenu, NavSettingsIcon } from "@/components/navbar/NavSettingsMenu";
import { PixelNavIcon } from "@/components/navbar/PixelNavIcon";

import { ExperimentalMobileMenu } from "@/components/navbar/ExperimentalMobileMenu";

import { pixelIconForLink } from "@/components/navbar/desktopNavModel";

import { NavMailLink } from "@/components/navbar/NavMailLink";
import { MobileDock } from "@/components/navbar/MobileDock";
import { isCampaignNavActive } from "@/components/navbar/campaignNav";

import { Wordmark, WORDMARK } from "@/components/Wordmark";

export function renderExperimentalNavbarView(context: ExperimentalNavbarViewContext): ReactNode {
  const {
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
  } = context;

  return (
    <>
      <nav
        data-site-navbar
        className="ahd-navbar-enter sticky top-0 z-50 border-b pt-[env(safe-area-inset-top,0px)] border-card-border/60 bg-card/50 shadow-panel backdrop-blur-xl"
        aria-label={t("common.mainNavigation")}
        data-feedback-ignore="true"
      >
        {/* The signature top accent + shimmer is rendered globally by
            NavbarTopFlair (a fixed strip in NavbarWrapper), matching the design. */}
        <div ref={barRef}>
          {/* ── Desktop bar ──────────────────────────────────────────────── */}
          {/* The full bar needs lg, not md. Its items are `shrink-0` inside an
              `overflow-visible` row (the dropdown panels have to escape the
              box), so at 768 they do not compress or wrap — they spill past the
              container and off the viewport, taking Help and Staff with them.
              Country labels are the variable: "Northwest Russia" overflows
              where a shorter nation would fit, so it broke for some players and
              not others. Below lg the drawer below handles it, and does so
              already. */}
          <div
            className={`mx-auto hidden min-h-[60px] items-center justify-between gap-3 overflow-visible lg:flex ${customizableNav ? "max-w-none px-5 2xl:px-8" : "max-w-7xl px-5"}`}
          >
            {/* Brand */}
            <Link
              href="/profile"
              className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white p-0.5 ring-1 ring-white/10">
                <Image
                  src={SHELL_LOGO_URL}
                  priority
                  unoptimized
                  alt=""
                  width={30}
                  height={30}
                  className="h-full w-full object-contain"
                />
              </span>
              <Wordmark
                typed={typedWordmark}
                className={`whitespace-nowrap text-base font-bold tracking-tight text-foreground ${
                  typedWordmark ? "font-mono" : ""
                }`}
              />
            </Link>

            {user?.singleplayer && !clientShell && <SingleplayerEndTurnButton />}

            {/* Right group — primary tabs + icon cluster hug the right, classic-nav style */}
            <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2 overflow-visible">
              {/* Primary nav — text-forward tabs; fade out while the search overlay is open */}
              <div
                className={`flex min-w-0 items-center gap-0.5 overflow-visible transition-opacity duration-200 ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
                aria-hidden={searchOpen ? "true" : undefined}
              >
                {navItems.map((item) => {
                  const active =
                    item.key === "campaign"
                      ? isCampaignNavActive(pathname)
                      : isNavActive(pathname, item.href);
                  const tabIcon = item.useFlag ? (
                    <CountryFlag country={pageCountry} size="sm" />
                  ) : (
                    <NavIcon name={item.icon} />
                  );
                  if (item.key) {
                    const isOpen = open === item.key;
                    return (
                      <div
                        key={item.label}
                        className="relative shrink-0"
                        ref={isOpen ? dropdownAnchorRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(item.key!)}
                          aria-expanded={isOpen}
                          aria-haspopup={useDesktopMegaMenu ? undefined : "menu"}
                          data-coach={item.key === "campaign" ? "nav-actions" : undefined}
                          className={navTabClassName(active || isOpen)}
                        >
                          {tabIcon}
                          <NavItemLabel>{item.label}</NavItemLabel>
                          <NavItemChevron open={isOpen} />
                        </button>
                        {isOpen &&
                          (megaPanel ??
                            (item.key === "campaign"
                              ? campaignMenu
                              : item.key === "state"
                                ? stateMenu
                                : item.key === "world"
                                  ? worldMenu
                                  : item.key === "nation"
                                    ? nationMenu
                                    : null))}
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-coach={item.href === "/actions" ? "nav-actions" : undefined}
                      className={navTabClassName(active)}
                    >
                      {tabIcon}
                      <NavItemLabel>{item.label}</NavItemLabel>
                    </Link>
                  );
                })}

                {pinnedLinks.map(({ key, item }, index) => {
                  const active = !!item.href && !item.external && isNavActive(pathname, item.href);
                  // Room for two pins on narrower desktops, all of them on wide screens.
                  const visibility = index < 2 ? "hidden xl:inline-flex" : "hidden 2xl:inline-flex";
                  const content = (
                    <>
                      <PixelNavIcon
                        name={item.icon ?? pixelIconForLink(item.id)}
                        className="mr-1.5 h-4 w-4 shrink-0"
                      />
                      <span className="max-w-[11rem] truncate">{item.label}</span>
                    </>
                  );
                  const className = `${navTabClassName(active)} ${visibility}`;
                  return item.external ? (
                    <a
                      key={key}
                      href={item.href}
                      target={item.href!.startsWith("mailto:") ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      data-nav-pin={key}
                      className={className}
                    >
                      {content}
                    </a>
                  ) : (
                    <Link
                      key={key}
                      href={item.href!}
                      aria-current={active ? "page" : undefined}
                      data-nav-pin={key}
                      className={className}
                    >
                      {content}
                    </Link>
                  );
                })}

                {!user?.singleplayer && (
                  <Link
                    href="/contests"
                    aria-current={isNavActive(pathname, "/contests") ? "page" : undefined}
                    className={navTabClassName(isNavActive(pathname, "/contests"))}
                  >
                    <NavIcon name="Contests" />
                    <NavItemLabel>{t("common.contests")}</NavItemLabel>
                  </Link>
                )}

                {/* Help — classic-nav order: after World */}
                <div
                  className="relative shrink-0"
                  ref={open === "help" ? dropdownAnchorRef : undefined}
                >
                  <button
                    type="button"
                    onClick={() => toggle("help")}
                    aria-expanded={open === "help"}
                    aria-haspopup={useDesktopMegaMenu ? undefined : "menu"}
                    className={navTabClassName(open === "help")}
                  >
                    <NavIcon name="Help" />
                    <NavItemLabel>{t("common.help")}</NavItemLabel>
                    <NavItemChevron open={open === "help"} />
                  </button>
                  {open === "help" && (megaPanel ?? helpMenu)}
                </div>

                {/* Staff — admin/mod only */}
                {staffSubItems.length > 0 && (
                  <div
                    className="relative shrink-0"
                    ref={open === "staff" ? dropdownAnchorRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => toggle("staff")}
                      aria-expanded={open === "staff"}
                      aria-haspopup={useDesktopMegaMenu ? undefined : "menu"}
                      className={navTabClassName(open === "staff")}
                    >
                      <NavIcon name="Staff" />
                      <NavItemLabel>{t("common.staff")}</NavItemLabel>
                      <NavItemChevron open={open === "staff"} />
                    </button>
                    {open === "staff" && (megaPanel ?? staffMenu)}
                  </div>
                )}
              </div>

              {/* Icon cluster */}
              <div className="relative flex shrink-0 items-center gap-1.5">
                {/* Country switcher */}
                <div className="relative" ref={open === "country" ? dropdownAnchorRef : undefined}>
                  <button
                    type="button"
                    onClick={() => toggle("country")}
                    aria-expanded={open === "country"}
                    aria-label={t("countrySwitcher.switchNationViewCurrent", {
                      country: countryName(pageCountry as CountryId),
                    })}
                    title={t("countrySwitcher.switchNationView")}
                    className="flex h-9 items-center gap-2 rounded-lg border border-card-border bg-card px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-muted/50 hover:text-foreground"
                  >
                    <CountryFlag country={pageCountry} size="sm" />
                    <span>{COUNTRY_DISPLAY_CODES[pageCountry] ?? pageCountry}</span>
                    <Chevron open={open === "country"} />
                  </button>
                  {open === "country" && (
                    <DropdownPanel
                      anchorRef={dropdownAnchorRef}
                      panelRef={dropdownPanelRef}
                      align="right"
                      width="w-64"
                    >
                      <MenuLabel>{t("countrySwitcher.switchNationView")}</MenuLabel>
                      {switchableCountries.map((c) => {
                        const isCurrent = c === pageCountry;
                        const isHome = c === userCountry;
                        return (
                          <Link
                            key={c}
                            href={countryUrl(c)}
                            onClick={closeAll}
                            aria-current={isCurrent ? "true" : undefined}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
                          >
                            <CountryFlag country={c} size="sm" />
                            <span
                              className={`text-[13px] ${isCurrent ? "font-semibold text-foreground" : "text-fg-2"}`}
                            >
                              {countryName(c)}
                            </span>
                            <span className="ml-auto flex items-center gap-1.5">
                              {isHome && (
                                <span className="text-[10px] font-medium text-muted">
                                  {t("countrySwitcher.homeBadge")}
                                </span>
                              )}
                              {isCurrent && (
                                <svg
                                  className="h-[15px] w-[15px] text-primary"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2.6}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                          </Link>
                        );
                      })}
                    </DropdownPanel>
                  )}
                </div>

                {/* Expanding search — grows leftward over the nav tabs (classic-nav behaviour) */}
                <div
                  ref={searchContainerRef}
                  className={`absolute right-full top-1/2 mr-1.5 -translate-y-1/2 overflow-hidden transition-all duration-300 ease-out ${
                    searchOpen ? "w-[min(26rem,60vw)] opacity-100" : "w-0 opacity-0"
                  }`}
                  style={{ pointerEvents: searchOpen ? "auto" : "none" }}
                >
                  <UniversalSearch open={searchOpen} onNavigate={() => setSearchOpen(false)} />
                </div>

                {/* Search toggle */}
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-label={t("common.search")}
                  aria-expanded={searchOpen}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card transition-colors hover:border-muted/50 ${
                    searchOpen ? "text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  <svg
                    className="h-[17px] w-[17px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {showProfile && (
                  <NavMailLink className="h-9 w-9 rounded-lg border border-card-border bg-card text-muted hover:text-foreground" />
                )}

                {/* Wallet */}
                {showProfile && (
                  <Link
                    href="/portfolio?tab=currency"
                    aria-label={t("common.wallet")}
                    aria-current={isNavActive(pathname, "/portfolio") ? "page" : undefined}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card transition-colors hover:border-muted/50 ${isNavActive(pathname, "/portfolio") ? "text-foreground" : "text-muted hover:text-foreground"}`}
                  >
                    <svg
                      className="h-[17px] w-[17px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </Link>
                )}

                {/* Gear: settings, navigation editor, Ask Keir, theme, sign out */}
                {user && customizableNav && (
                  <div className="relative" ref={open === "gear" ? dropdownAnchorRef : undefined}>
                    <button
                      type="button"
                      onClick={() => toggle("gear")}
                      aria-expanded={open === "gear"}
                      aria-haspopup="menu"
                      aria-label={t("settingsMenu.label")}
                      title={t("settingsMenu.label")}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card transition-colors hover:border-muted/50 ${open === "gear" ? "text-foreground ring-2 ring-primary/40" : "text-muted hover:text-foreground"}`}
                    >
                      <NavSettingsIcon />
                    </button>
                    {open === "gear" && (
                      <NavSettingsMenu
                        anchorRef={dropdownAnchorRef}
                        panelRef={dropdownPanelRef}
                        singleplayer={!!user.singleplayer}
                        closeAll={closeAll}
                        onEditNavigation={() => setCustomizeOpen(true)}
                        onSignOut={handleSignOut}
                      />
                    )}
                  </div>
                )}

                {/* User / avatar dropdown */}
                <div className="relative" ref={open === "user" ? dropdownAnchorRef : undefined}>
                  {user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggle("user")}
                        aria-expanded={open === "user"}
                        aria-label={t("common.userMenu")}
                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-card-border bg-card transition-opacity hover:opacity-90 ${open === "user" ? "ring-2 ring-primary/40" : ""}`}
                      >
                        <Avatar
                          url={characterProfile?.avatarUrl}
                          name={profileDisplayName}
                          size="h-9 w-9"
                          borderKey={characterProfile?.borderKey}
                          tintColor={characterProfile?.tintColor}
                          className="rounded-lg"
                        />
                      </button>
                      {open === "user" && userMenu}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link
                        href="/login"
                        className="text-[13px] font-medium text-muted transition-colors hover:text-foreground"
                      >
                        {t("common.signIn")}
                      </Link>
                      <Link
                        href="/register"
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-all hover:bg-primary/90"
                      >
                        {t("common.register")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Mobile bar ───────────────────────────────────────────────── */}
          <div className="mx-auto flex h-14 items-center gap-2.5 px-3.5 lg:hidden">
            <Link href="/profile" className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white p-0.5">
                <Image
                  src={SHELL_LOGO_URL}
                  priority
                  unoptimized
                  alt="A House Divided"
                  width={28}
                  height={28}
                  className="h-full w-full object-contain"
                />
              </span>
              <Wordmark
                typed={typedWordmark}
                className={`min-w-0 truncate text-[15px] font-bold tracking-tight text-foreground ${
                  typedWordmark ? "font-mono" : ""
                }`}
              />
            </Link>
            {mobileDock ? (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDockSheet((cur) => (cur === "more" ? null : "more"))}
                  aria-label={t("common.search")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card text-foreground transition-colors hover:bg-white/5"
                >
                  <PixelNavIcon name="search" className="h-4 w-4" />
                </button>
                {showProfile && (
                  <NavMailLink className="h-9 w-9 rounded-lg border border-card-border bg-card text-foreground" />
                )}
                <Link
                  href="/notifications"
                  aria-label={
                    unreadCount
                      ? `${t("common.notifications")} (${unreadCount})`
                      : t("common.notifications")
                  }
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card text-foreground transition-colors hover:bg-white/5"
                >
                  <PixelNavIcon name="bell" className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full border-2 border-card bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground">
                      {unreadBadgeLabel(unreadCount)}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDockSheet(null);
                    setMobileProfileOpen((value) => !value);
                  }}
                  aria-label={t("common.profile")}
                  aria-expanded={mobileProfileOpen}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg"
                >
                  <Avatar
                    url={characterProfile?.avatarUrl}
                    name={profileDisplayName}
                    size="h-9 w-9"
                    borderKey={characterProfile?.borderKey}
                    tintColor={characterProfile?.tintColor}
                    className="rounded-lg"
                  />
                </button>
              </div>
            ) : (
              <div className="ml-auto flex items-center gap-1.5">
                {showProfile && (
                  <NavMailLink className="h-9 w-9 rounded-lg border border-card-border bg-card text-foreground" />
                )}
                {showProfile && user && (
                  <button
                    type="button"
                    onClick={() => {
                      void captureProductEvent("navigation_profile_opened", {
                        variant: experimentVariant,
                      });
                      if (navigationVariant === "a")
                        void captureProductEvent("navigation_menu_opened", { variant: "control" });
                      setMobileProfileOpen((value) => !value);
                      setMobileMenuOpen(navigationVariant !== "b");
                    }}
                    aria-label={t("common.profile")}
                    aria-expanded={navigationVariant === "b" ? mobileProfileOpen : mobileMenuOpen}
                    // No clipping or own border: the avatar draws its supporter frame
                    // around itself, and the clip cut it to a sliver (ticket 1386).
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg"
                  >
                    <Avatar
                      url={characterProfile?.avatarUrl}
                      name={profileDisplayName}
                      size="h-9 w-9"
                      borderKey={characterProfile?.borderKey}
                      tintColor={characterProfile?.tintColor}
                      className="rounded-lg"
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!mobileMenuOpen)
                      void captureProductEvent("navigation_menu_opened", {
                        variant: experimentVariant,
                      });
                    setMobileProfileOpen(false);
                    setMobileMenuOpen((v) => !v);
                  }}
                  aria-label={mobileMenuOpen ? t("common.closeMenu") : t("common.openMenu")}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="experimental-mobile-menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card text-foreground transition-colors hover:bg-white/5"
                >
                  <svg
                    className="h-[19px] w-[19px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {mobileMenuOpen ? (
                      <path d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* ── Mobile menu panel ────────────────────────────────────────── */}
          {navigationVariant === "a" && mobileMenuOpen && (
            <ExperimentalMobileMenu
              navigationVariant={navigationVariant}
              profileOnly={false}
              navItems={navItems}
              pathname={pathname}
              mobileSubOpen={mobileSubOpen}
              toggleMobileSub={toggleMobileSub}
              onClose={() => {
                setMobileMenuOpen(false);
                setMobileProfileOpen(false);
              }}
              user={user}
              showProfile={showProfile}
              characterProfile={characterProfile}
              profileDisplayName={profileDisplayName}
              unreadCount={unreadCount}
              isImperialMode={isImperialMode}
              adminCharacters={adminCharacters}
              imperialCharacter={imperialCharacter}
              switchingCharacter={switchingCharacter}
              switchingImperial={switchingImperial}
              handleSwitchCharacter={handleSwitchCharacter}
              handleSwitchImperial={handleSwitchImperial}
              currentParty={currentParty}
              homeState={homeState}
              activeElection={activeElection}
              cabinetOffice={cabinetOffice}
              justiceOffice={justiceOffice}
              governorOffice={governorOffice}
              stateLegislatureLabel={stateLegislatureLabel}
              pageCountry={pageCountry}
              userCountry={userCountry}
              switchableCountries={switchableCountries}
              worldSubItems={worldSubItems}
              profileOrgItems={profileOrgItems}
              staffSubItems={staffSubItems}
              charterEntry={charterEntry}
              hasActiveReferendumCampaign={hasActiveReferendumCampaign}
              unionsEnabled={unionsEnabled}
              showWiki={showWiki}
              onOpenFeedback={onOpenFeedback}
              feedbackCapturing={feedbackCapturing}
              handleSignOut={handleSignOut}
            />
          )}
        </div>
      </nav>
      {(navigationVariant === "b" || mobileDock) &&
        mobilePortalReady &&
        (mobileMenuOpen || mobileProfileOpen) &&
        createPortal(
          <div className="fixed inset-0 z-[70] lg:hidden" data-feedback-ignore="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label={t("common.closeMenu")}
              onClick={() => {
                setMobileMenuOpen(false);
                setMobileProfileOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={mobileProfileOpen ? t("common.profile") : t("common.mainNavigation")}
              className={
                mobileProfileOpen
                  ? "absolute right-3 top-[calc(4rem+env(safe-area-inset-top,0px))] w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-card-border bg-card shadow-2xl"
                  : "absolute inset-y-0 left-0 flex w-[min(21rem,calc(100vw-3rem))] flex-col border-r pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] border-card-border bg-card shadow-2xl"
              }
            >
              {!mobileProfileOpen && (
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-card-border px-4">
                  <span
                    className={`text-base font-semibold text-foreground ${
                      typedWordmark ? "font-mono" : ""
                    }`}
                  >
                    {WORDMARK}
                  </span>
                  <button
                    type="button"
                    aria-label={t("common.closeMenu")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-white/5 hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              )}
              <ExperimentalMobileMenu
                navigationVariant="b"
                profileOnly={mobileProfileOpen}
                navItems={navItems}
                pathname={pathname}
                mobileSubOpen={mobileSubOpen}
                toggleMobileSub={toggleMobileSub}
                onClose={() => {
                  setMobileMenuOpen(false);
                  setMobileProfileOpen(false);
                }}
                user={user}
                showProfile={showProfile}
                characterProfile={characterProfile}
                profileDisplayName={profileDisplayName}
                unreadCount={unreadCount}
                isImperialMode={isImperialMode}
                adminCharacters={adminCharacters}
                imperialCharacter={imperialCharacter}
                switchingCharacter={switchingCharacter}
                switchingImperial={switchingImperial}
                handleSwitchCharacter={handleSwitchCharacter}
                handleSwitchImperial={handleSwitchImperial}
                currentParty={currentParty}
                homeState={homeState}
                activeElection={activeElection}
                cabinetOffice={cabinetOffice}
                justiceOffice={justiceOffice}
                governorOffice={governorOffice}
                stateLegislatureLabel={stateLegislatureLabel}
                pageCountry={pageCountry}
                userCountry={userCountry}
                switchableCountries={switchableCountries}
                worldSubItems={worldSubItems}
                profileOrgItems={profileOrgItems}
                staffSubItems={staffSubItems}
                charterEntry={charterEntry}
                hasActiveReferendumCampaign={hasActiveReferendumCampaign}
                unionsEnabled={unionsEnabled}
                showWiki={showWiki}
                onOpenFeedback={onOpenFeedback}
                feedbackCapturing={feedbackCapturing}
                handleSignOut={handleSignOut}
              />
            </div>
          </div>,
          document.body
        )}
      {mobileDock &&
        mobilePortalReady &&
        createPortal(
          <MobileDock
            tabs={dockTabs}
            openSheet={dockSheet}
            onOpenSheet={setDockSheet}
            sheets={dockSheets}
          />,
          document.body
        )}
      {customizeOpen && customizableNav && (
        <NavCustomizeDialog
          menus={customizableMenus}
          pinLookup={pinLookup}
          custom={custom}
          onChange={updateCustom}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </>
  );
}
