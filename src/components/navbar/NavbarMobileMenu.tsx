"use client";

import type { Dispatch } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CountryFlag } from "@/components/CountryFlag";
import type { ActiveCharter } from "@/hooks/useActiveCharters";
import type { CountryId } from "@/lib/constants/countriesCore";
import {
  countryUrl,
  partyUrl,
  regionElectionsUrl,
  regionLegislatureUrl,
  regionPartyUrl,
  regionUrl,
  scotusJusticeOfficeUrl,
} from "@/lib/urls";
import { ImperialMark } from "./ImperialMark";
import { MOBILE_MENU_PANEL_CLASS } from "./dropdownStyles";
import {
  HELP_DISCORD_URL,
  HELP_PATREON_URL,
  HELP_STATUS_URL,
  HELP_SUPPORTER_WALL_URL,
  HELP_SUPPORT_EMAIL,
} from "./helpLinks";
import type {
  AdminCharacter,
  ImperialCharacterNav,
  NavbarActiveElection,
  NavbarCabinetOffice,
  NavbarCurrentParty,
  NavbarGovernorOffice,
  NavbarHomeState,
  NavbarJusticeOffice,
  NavbarUser,
} from "./navbarTypes";
import { viewerIsSingleplayerOwner, visibleStaffNavItems } from "./staffNavItems";
import type { NavbarAction, NavbarState } from "./useNavbarState";

// Same on-demand loading as the desktop panels: the switcher only mounts once
// the profile section is expanded.
const ProfileSwitcher = dynamic(() => import("./ProfileSwitcher").then((m) => m.ProfileSwitcher), {
  ssr: false,
});
const MobileWorldLinks = dynamic(
  () => import("./MobileWorldLinks").then((m) => m.MobileWorldLinks),
  { ssr: false }
);
const MobileNationalDetails = dynamic(
  () => import("./MobileNationalDetails").then((m) => m.MobileNationalDetails),
  { ssr: false }
);

// Fires the switcher chunk fetch as soon as the profile row is touched.
const preloadProfileSwitcher = () => import("./ProfileSwitcher");

export interface NavbarMobileMenuProps {
  pathname: string;
  navState: NavbarState;
  dispatch: Dispatch<NavbarAction>;
  user?: NavbarUser;
  showProfile: boolean;
  adminCharacters?: AdminCharacter[];
  imperialCharacter?: ImperialCharacterNav;
  isImperialMode: boolean;
  homeState?: NavbarHomeState;
  currentParty?: NavbarCurrentParty;
  activeElection?: NavbarActiveElection;
  cabinetOffice?: NavbarCabinetOffice;
  justiceOffice?: NavbarJusticeOffice;
  governorOffice?: NavbarGovernorOffice;
  activePresidentElectionId?: string;
  activePresidentElectionSeatId?: string;
  myCorporationId: number | null;
  myCorporationHasGroup: boolean;
  myUnionId: string | null;
  onOpenFeedback?: () => void;
  feedbackCapturing: boolean;
  wikiDisabled: boolean;
  conflictsEnabled: boolean;
  unionsEnabled: boolean;
  settlementCrisisLive: boolean;
  pageCountry: CountryId;
  userCountry: CountryId;
  countryName: (id: CountryId) => string;
  stateAdjective?: string;
  stateLegislatureLabel: string;
  mobileActiveCharters: ActiveCharter[] | null;
  hasActiveReferendumCampaign: boolean;
  onClose: () => void;
  onSwitchCharacter: (characterId: string) => void;
  onSwitchImperial: (type: "character" | "imperial") => void;
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

/**
 * Body of the mobile hamburger menu.
 *
 * Split out of Navbar so its 60 KB of markup and per-section link catalogues
 * only reach the browser when the hamburger first opens (or is touched), rather
 * than riding along in the root-layout chunk every page pays for.
 */
export function NavbarMobileMenu({
  pathname,
  navState,
  dispatch,
  user,
  showProfile,
  adminCharacters,
  imperialCharacter,
  isImperialMode,
  homeState,
  currentParty,
  activeElection,
  cabinetOffice,
  justiceOffice,
  governorOffice,
  activePresidentElectionId,
  activePresidentElectionSeatId,
  myCorporationId,
  myCorporationHasGroup,
  myUnionId,
  onOpenFeedback,
  feedbackCapturing,
  wikiDisabled,
  conflictsEnabled,
  unionsEnabled,
  settlementCrisisLive,
  pageCountry,
  userCountry,
  countryName,
  stateAdjective,
  stateLegislatureLabel,
  mobileActiveCharters,
  hasActiveReferendumCampaign,
  onClose,
  onSwitchCharacter,
  onSwitchImperial,
}: NavbarMobileMenuProps) {
  const t = useTranslations("nav");
  const {
    profileOpen,
    staffOpen,
    stateOpen,
    nationOpen,
    worldOpen,
    helpOpen,
    switchingCharacter,
    switchingImperial,
  } = navState;
  const activeProfileCharacter = adminCharacters?.find((c) => c.isActive);
  const currentPartyCountry = currentParty?.countryId ?? pageCountry;

  return (
    <div
      id="mobile-nav-menu"
      className={`border-t border-card-border/60 bg-card/70 backdrop-blur-xl md:hidden ${MOBILE_MENU_PANEL_CLASS}`}
    >
      <div className="mx-auto max-w-7xl space-y-0.5 px-4 py-3">
        {/* Standard Nav Items */}
        {/* Profile */}
        {showProfile && ((adminCharacters && adminCharacters.length > 1) || imperialCharacter) ? (
          <div>
            <button
              onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "profile" })}
              onPointerEnter={preloadProfileSwitcher}
              onFocus={preloadProfileSwitcher}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
              aria-expanded={profileOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                {isImperialMode ? (
                  <ImperialMark />
                ) : (
                  activeProfileCharacter && (
                    <CountryFlag country={activeProfileCharacter.countryId} size="sm" />
                  )
                )}
                <span className="truncate">
                  {isImperialMode
                    ? (imperialCharacter?.name ?? t("common.imperial"))
                    : (activeProfileCharacter?.name ?? t("common.profile"))}
                </span>
              </span>
              <ChevronIcon open={profileOpen} />
            </button>
            {profileOpen && (
              <div className="ml-3 mt-0.5 border-l border-card-border/60 pl-3">
                <ProfileSwitcher
                  variant="mobile"
                  characters={adminCharacters ?? []}
                  imperialCharacter={imperialCharacter}
                  isImperialMode={isImperialMode}
                  switchingCharacter={switchingCharacter}
                  switchingImperial={switchingImperial}
                  charactersLabel={t("userMenu.characters")}
                  imperialLabel={t("common.imperial")}
                  activeLabel={t("common.active")}
                  imperialHref={imperialCharacter ? `/imperial/${imperialCharacter.id}` : undefined}
                  onSelectCharacter={(id) => {
                    onSwitchCharacter(id);
                  }}
                  onSelectImperial={(target) => {
                    onSwitchImperial(target);
                  }}
                  onNavigate={onClose}
                />
              </div>
            )}
          </div>
        ) : (
          showProfile && (
            <Link
              href="/profile"
              onClick={onClose}
              className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/profile") ? "bg-white/5 font-medium text-foreground" : "text-foreground"}`}
              aria-current={isNavActive(pathname, "/profile") ? "page" : undefined}
            >
              {t("common.profile")}
            </Link>
          )
        )}

        {/* Actions - hidden for imperial characters */}
        {showProfile && !isImperialMode && (
          <Link
            href="/actions"
            onClick={onClose}
            className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/actions") ? "bg-white/5 font-medium" : ""}`}
            aria-current={isNavActive(pathname, "/actions") ? "page" : undefined}
          >
            {t("common.actions")}
          </Link>
        )}

        {/* Staff tools - collapsible, admin/mod only. Kept OUT of the flat
            top-level list on purpose: ops/staff links live under this one
            gated "Staff" section, never as headlining tabs. */}
        {(user?.isAdmin || user?.isModerator) &&
          (() => {
            const staffItems = visibleStaffNavItems({
              isAdmin: !!user?.isAdmin,
              isModerator: !!user?.isModerator,
              isSingleplayerOwner: viewerIsSingleplayerOwner(user),
            });
            if (staffItems.length === 0) return null;
            return (
              <div>
                <button
                  onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "staff" })}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
                  aria-expanded={staffOpen}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {t("common.staff")}
                  </span>
                  <ChevronIcon open={staffOpen} />
                </button>
                {staffOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-card-border/60 pl-3">
                    {staffItems.map((i) =>
                      i.external ? (
                        <a
                          key={i.label}
                          href={i.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={onClose}
                          className="flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
                        >
                          {t(i.labelKey)}
                        </a>
                      ) : (
                        <Link
                          key={i.label}
                          href={i.href}
                          onClick={onClose}
                          className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, i.href) ? "bg-white/5 font-medium" : "text-muted"}`}
                          aria-current={isNavActive(pathname, i.href) ? "page" : undefined}
                        >
                          {t(i.labelKey)}
                        </Link>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        {/* State section - collapsible, collapsed by default */}
        {homeState && (
          <div>
            <button
              onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "state" })}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
              aria-expanded={stateOpen}
            >
              {homeState.name}
              <ChevronIcon open={stateOpen} />
            </button>
            {stateOpen && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-card-border/60 pl-3">
                <Link
                  href={regionUrl(homeState.countryId, homeState.id)}
                  onClick={onClose}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, regionUrl(homeState.countryId, homeState.id)) ? "bg-white/5 font-medium" : "text-muted"}`}
                  aria-current={
                    isNavActive(pathname, regionUrl(homeState.countryId, homeState.id))
                      ? "page"
                      : undefined
                  }
                >
                  {t("state.overview")}
                </Link>
                {currentParty && (
                  <Link
                    href={regionPartyUrl(homeState.countryId, homeState.id, currentParty.id)}
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, regionPartyUrl(homeState.countryId, homeState.id, currentParty.id)) ? "bg-white/5 font-medium" : "text-muted"}`}
                  >
                    {stateAdjective} {currentParty.name}
                  </Link>
                )}
                <Link
                  href={`${regionUrl(homeState.countryId, homeState.id)}?tab=economy`}
                  onClick={onClose}
                  className="flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 text-muted"
                >
                  {t("state.economy")}
                </Link>
                <Link
                  href={regionElectionsUrl(homeState.countryId, homeState.id)}
                  onClick={onClose}
                  className="flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 text-muted"
                >
                  {t("state.elections")}
                </Link>
                <Link
                  href={regionLegislatureUrl(homeState.countryId, homeState.id)}
                  onClick={onClose}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, regionLegislatureUrl(homeState.countryId, homeState.id)) ? "bg-white/5 font-medium" : "text-muted"}`}
                >
                  {stateLegislatureLabel}
                </Link>
                {governorOffice && governorOffice.stateId === homeState.id && (
                  <Link
                    href={`/country/${homeState.countryId.toLowerCase()}/region/${homeState.id.toLowerCase()}/office`}
                    onClick={onClose}
                    className="flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 text-muted"
                  >
                    {t("state.office")}
                  </Link>
                )}
                {activeElection ? (
                  <Link
                    href={`/elections/${activeElection.seatId ?? activeElection.id}`}
                    onClick={onClose}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, `/elections/${activeElection.seatId ?? activeElection.id}`) ? "bg-white/5 font-medium" : "text-muted"}`}
                    aria-current={
                      isNavActive(
                        pathname,
                        `/elections/${activeElection.seatId ?? activeElection.id}`
                      )
                        ? "page"
                        : undefined
                    }
                  >
                    <span>{t("state.myElection")}</span>
                    <span className="ml-2 max-w-[120px] truncate text-xs text-muted">
                      {activeElection.label}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center rounded-lg px-3 py-2 text-sm text-muted opacity-50">
                    {t("state.myElectionNone")}
                  </div>
                )}
                {cabinetOffice && (
                  <Link
                    href={`/country/${cabinetOffice.countryCode}/executive/cabinet/${cabinetOffice.positionId}`}
                    onClick={onClose}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, `/country/${cabinetOffice.countryCode}/executive/cabinet/${cabinetOffice.positionId}`) ? "bg-white/5 font-medium" : "text-muted"}`}
                  >
                    <span>{t("state.myOffice")}</span>
                    <span className="ml-2 max-w-[120px] truncate text-xs text-muted">
                      {cabinetOffice.positionName}
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* The Nation section - collapsible, collapsed by default */}
        {showProfile && (
          <div>
            <button
              onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "nation" })}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
              aria-expanded={nationOpen}
            >
              <div className="flex items-center gap-2">
                <CountryFlag country={pageCountry} size="md" className="shrink-0" />
                <span>{countryName(pageCountry)}</span>
              </div>
              <ChevronIcon open={nationOpen} />
            </button>
            {nationOpen && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-card-border/60 pl-3">
                {/* Home Nation */}
                <Link
                  href={countryUrl(userCountry)}
                  onClick={onClose}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
                >
                  <CountryFlag country={userCountry} size="sm" />
                  <span>{countryName(userCountry)}</span>
                  <span className="text-xs text-muted/60">{t("menus.nation.homeSuffix")}</span>
                </Link>

                {cabinetOffice && (
                  <Link
                    href={`/country/${cabinetOffice.countryCode}/executive/cabinet/${cabinetOffice.positionId}/office`}
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, `/country/${cabinetOffice.countryCode}/executive/cabinet/${cabinetOffice.positionId}/office`) ? "bg-white/5 font-medium" : "text-muted"}`}
                  >
                    {t("menus.nation.cabinetOffice")} · {cabinetOffice.positionName}
                  </Link>
                )}

                {justiceOffice && (
                  <Link
                    href={scotusJusticeOfficeUrl(justiceOffice.countryCode)}
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, scotusJusticeOfficeUrl(justiceOffice.countryCode)) ? "bg-white/5 font-medium" : "text-muted"}`}
                  >
                    {t("menus.nation.justiceOffice")}
                  </Link>
                )}

                {currentParty && (
                  <Link
                    href={partyUrl(currentPartyCountry, currentParty.id)}
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, partyUrl(currentPartyCountry, currentParty.id)) ? "bg-white/5 font-medium" : "text-muted"}`}
                    aria-current={
                      isNavActive(pathname, partyUrl(currentPartyCountry, currentParty.id))
                        ? "page"
                        : undefined
                    }
                  >
                    {t("menus.nation.myParty")} · {currentParty.name}
                  </Link>
                )}

                {userCountry === "US" && (
                  <Link
                    href="/political-operations"
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/political-operations") ? "bg-white/5 font-medium" : "text-muted"}`}
                    aria-current={
                      isNavActive(pathname, "/political-operations") ? "page" : undefined
                    }
                  >
                    {t("menus.nation.myPoliticalOperations")}
                  </Link>
                )}

                <div className="px-3 py-1 text-body-sm font-medium text-muted">
                  {t("menus.nation.nationalDetailsFor", {
                    country: countryName(pageCountry),
                  })}
                </div>

                <MobileNationalDetails
                  countryId={pageCountry}
                  onNavigate={onClose}
                  activePresidentElection={
                    activePresidentElectionId
                      ? {
                          id: activePresidentElectionId,
                          seatId: activePresidentElectionSeatId,
                        }
                      : null
                  }
                  charters={
                    mobileActiveCharters && mobileActiveCharters.length > 0
                      ? {
                          href:
                            mobileActiveCharters.length === 1
                              ? `/charters/${mobileActiveCharters[0]!.id}`
                              : "/charters",
                          label:
                            mobileActiveCharters.length === 1
                              ? t("menus.nation.charterSingle", {
                                  name: mobileActiveCharters[0]!.proposedName,
                                })
                              : t("menus.nation.chartersMultiple", {
                                  count: mobileActiveCharters.length,
                                }),
                        }
                      : null
                  }
                  hasActiveReferendumCampaign={hasActiveReferendumCampaign}
                  unionsEnabled={unionsEnabled}
                />
              </div>
            )}
          </div>
        )}

        {/* World section - collapsible, collapsed by default */}
        {showProfile && (
          <div>
            <button
              onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "world" })}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
              aria-expanded={worldOpen}
            >
              {t("common.world")}
              <ChevronIcon open={worldOpen} />
            </button>
            {worldOpen && (
              <MobileWorldLinks
                pathname={pathname}
                onNavigate={onClose}
                countryId={pageCountry}
                myCorporationId={myCorporationId}
                myCorporationHasGroup={myCorporationHasGroup}
                myUnionId={myUnionId}
                conflictsEnabled={conflictsEnabled}
                unionsEnabled={unionsEnabled}
                settlementCrisisLive={settlementCrisisLive}
              />
            )}
          </div>
        )}

        {!user?.singleplayer && (
          <Link
            href="/contests"
            onClick={onClose}
            className={`flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5 ${isNavActive(pathname, "/contests") ? "bg-white/5" : ""}`}
            aria-current={isNavActive(pathname, "/contests") ? "page" : undefined}
          >
            {t("common.contests")}
          </Link>
        )}

        {/* Help/Information section - collapsible, collapsed by default */}
        <div>
          <button
            onClick={() => dispatch({ type: "TOGGLE_DROPDOWN", key: "help" })}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
            aria-expanded={helpOpen}
          >
            {t("help.helpInformation")}
            <ChevronIcon open={helpOpen} />
          </button>
          {helpOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-card-border/60 pl-3">
              {(() => {
                const showWiki = !!(user?.isAdmin || user?.isModerator) || !wikiDisabled;
                const wikiHref = showWiki ? "/wiki" : "/guides";
                const wikiActive = showWiki
                  ? isNavActive(pathname, "/wiki") || isNavActive(pathname, "/guides")
                  : isNavActive(pathname, "/guides");
                return (
                  <Link
                    href={wikiHref}
                    onClick={onClose}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${wikiActive ? "bg-white/5 font-medium" : "text-muted"}`}
                    aria-current={wikiActive ? "page" : undefined}
                  >
                    {showWiki ? t("help.wikiGuides") : t("help.guides")}
                  </Link>
                );
              })()}
              <Link
                href="/about"
                onClick={onClose}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/about") ? "bg-white/5 font-medium" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/about") ? "page" : undefined}
              >
                {t("help.about")}
              </Link>
              <Link
                href="/feedback"
                onClick={onClose}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/feedback") ? "bg-white/5 font-medium text-foreground" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/feedback") ? "page" : undefined}
              >
                {t("help.suggestions")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFeedback?.();
                }}
                disabled={feedbackCapturing}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-70"
              >
                {feedbackCapturing && (
                  <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
                {feedbackCapturing ? t("common.capturingScreenshot") : t("common.quickSuggest")}
              </button>
              <a
                href={HELP_DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
              >
                Discord
              </a>
              <a
                href={HELP_PATREON_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="store-purchase-cta flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
              >
                {t("help.patreon")}
              </a>
              <a
                href={HELP_SUPPORTER_WALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="store-purchase-cta flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
              >
                {t("help.supporterWall")}
              </a>
              <a
                href={HELP_SUPPORT_EMAIL}
                onClick={onClose}
                className="flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
              >
                {t("help.emailSupport")}
              </a>
              <a
                href={HELP_STATUS_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5"
              >
                {t("help.serverStatus")}
              </a>
              <div className="my-1 border-t border-card-border/60" />
              <Link
                href="/privacy"
                onClick={onClose}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/privacy") ? "bg-white/5 font-medium text-foreground" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/privacy") ? "page" : undefined}
              >
                {t("help.privacy")}
              </Link>
              <Link
                href="/terms"
                onClick={onClose}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isNavActive(pathname, "/terms") ? "bg-white/5 font-medium text-foreground" : "text-muted"}`}
                aria-current={isNavActive(pathname, "/terms") ? "page" : undefined}
              >
                {t("help.terms")}
              </Link>
            </div>
          )}
        </div>
      </div>

      {!user && (
        <div className="border-t border-card-border/40 px-4 py-4 flex flex-col gap-2">
          <Link
            href="/login"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg border border-card-border bg-card py-2.5 text-sm font-medium text-foreground"
          >
            {t("common.signIn")}
          </Link>
          <Link
            href="/register"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-white"
          >
            {t("common.register")}
          </Link>
        </div>
      )}

      {/* Version footer */}
      <Link
        href="/changelog"
        onClick={onClose}
        className="flex items-center justify-center gap-2 border-t border-card-border/60 px-4 py-2 text-center text-xs text-muted hover:text-foreground transition-colors"
      >
        <span>
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} ·{" "}
          {process.env.NEXT_PUBLIC_GIT_COMMIT ?? "dev"}
        </span>
        {process.env.NEXT_PUBLIC_IS_PREVIEW === "true" && (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {t("common.preview")}
          </span>
        )}
      </Link>
    </div>
  );
}
