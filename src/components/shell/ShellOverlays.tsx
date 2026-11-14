import { AdSlot } from "@/components/AdSlot";
import { AskDrawer } from "@/components/askDrawer/AskDrawer";
import { AuthConnectivityGate } from "@/components/AuthConnectivityGate";
import { BugReportFab } from "@/components/BugReportFab";
import {
  DeferredNominationChoicePrompt,
  DeferredSeasonRecapGate,
  DeferredSingleplayerGuide,
  DeferredStatAllocationGate,
  DeferredTurnProgressToast,
  DeferredTutorialCoachMount,
  DeferredWealthTierRepickGate,
} from "@/components/DeferredShellOverlays";
import { LiveRefreshBanner } from "@/components/LiveRefreshBanner";
import { MaintenancePartialBanner } from "@/components/MaintenancePartialBanner";
import { MassCrashAlertBanner } from "@/components/MassCrashAlertBanner";
import { NavbarWrapper } from "@/components/NavbarWrapper";
import { PollBannerNotice } from "@/components/PollBannerNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { StatusBar } from "@/components/StatusBar";
import { VpnGateBanner } from "@/components/VpnGateBanner";
import { isChromeHiddenPath } from "@/lib/constants/layoutPaths";
import type { CountryId } from "@/lib/constants/countries";

export interface ShellFlags {
  /** Anonymous visit on a light path: render only what those pages use. */
  light: boolean;
  pathname: string;
  isWikiSubdomain: boolean;
  singleplayer: boolean;
  isNativeApp: boolean;
  isClientShell: boolean;
  isStoreApp: boolean;
  nativeStatusDock: boolean;
  displayMode?: "focused" | "classic";
  initialPageCountry: CountryId | null;
  typedWordmark: boolean;
}

/** Always-mounted chrome that sits before `<main>`. */
export function ShellOverlaysTop(flags: ShellFlags) {
  const { light, isWikiSubdomain, singleplayer } = flags;
  const showNavbar = !isWikiSubdomain && !(light && isChromeHiddenPath(flags.pathname));
  return (
    <>
      {showNavbar && (
        <NavbarWrapper
          singleplayer={singleplayer}
          clientShell={flags.isClientShell}
          phoneApp={flags.isStoreApp}
          displayMode={flags.displayMode}
          initialPageCountry={flags.initialPageCountry}
          typedWordmark={flags.typedWordmark}
        />
      )}
      {!isWikiSubdomain && !light && <BugReportFab displayMode={flags.displayMode} />}
      {/* Experimental opt-in (Settings). Singleplayer has no Ask service. */}
      {!isWikiSubdomain && !light && !singleplayer && <AskDrawer />}
      {!isWikiSubdomain && !light && <VpnGateBanner />}
      {!isWikiSubdomain && <MassCrashAlertBanner />}
      {!isWikiSubdomain && <MaintenancePartialBanner />}
      {/* Admin-controlled survey strip. Not auth-gated: it must reach signed-out
          visitors too. */}
      {!isWikiSubdomain && <PollBannerNotice />}
      <AuthConnectivityGate />
      {!light && (
        <>
          <DeferredStatAllocationGate />
          <DeferredWealthTierRepickGate />
          <DeferredSeasonRecapGate />
          <DeferredNominationChoicePrompt />
        </>
      )}
    </>
  );
}

/** Always-mounted chrome that sits after `<main>`. */
export function ShellOverlaysBottom(flags: ShellFlags) {
  const { light, isWikiSubdomain, singleplayer, isNativeApp } = flags;
  if (light) return null;
  return (
    <>
      {!isWikiSubdomain && !isNativeApp && <AdSlot />}
      {!isWikiSubdomain && <SiteFooter displayMode={flags.displayMode} />}
      {!isWikiSubdomain && !flags.nativeStatusDock && (
        <StatusBar showOnlineStatus={!flags.isClientShell} turnStatusLink={!singleplayer} />
      )}
      {!isWikiSubdomain && singleplayer && <DeferredTurnProgressToast />}
      {!isWikiSubdomain && singleplayer && <DeferredSingleplayerGuide />}
      {!isWikiSubdomain && <DeferredTutorialCoachMount />}
      {!isWikiSubdomain && <LiveRefreshBanner />}
    </>
  );
}
