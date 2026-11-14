import { AdSlot } from "@/components/AdSlot";
import { AskDrawer } from "@/components/askDrawer/AskDrawer";
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
import { SiteFooter } from "@/components/SiteFooter";
import { StatusBar } from "@/components/StatusBar";
import { VpnGateBanner } from "@/components/VpnGateBanner";
import type { ShellFlags } from "./ShellOverlays";

/**
 * Everything the full shell adds over the light one. This module is imported
 * with `import()` only when the shell is not light, so its components and their
 * dependencies stay out of the anonymous landing and sign-in bundles.
 */

/** Sits where the navbar ends, before the banners. */
export function TopLead({ isWikiSubdomain, singleplayer, displayMode }: ShellFlags) {
  return (
    <>
      {!isWikiSubdomain && <BugReportFab displayMode={displayMode} />}
      {/* Experimental opt-in (Settings). Singleplayer has no Ask service. */}
      {!isWikiSubdomain && !singleplayer && <AskDrawer />}
      {!isWikiSubdomain && <VpnGateBanner />}
    </>
  );
}

/** Sits after the banners. */
export function TopGates() {
  return (
    <>
      <DeferredStatAllocationGate />
      <DeferredWealthTierRepickGate />
      <DeferredSeasonRecapGate />
      <DeferredNominationChoicePrompt />
    </>
  );
}

/** Sits after `<main>`. */
export function Bottom({
  isWikiSubdomain,
  singleplayer,
  isNativeApp,
  displayMode,
  nativeStatusDock,
  isClientShell,
}: ShellFlags) {
  return (
    <>
      {!isWikiSubdomain && !isNativeApp && <AdSlot />}
      {!isWikiSubdomain && <SiteFooter displayMode={displayMode} />}
      {!isWikiSubdomain && !nativeStatusDock && (
        <StatusBar showOnlineStatus={!isClientShell} turnStatusLink={!singleplayer} />
      )}
      {!isWikiSubdomain && singleplayer && <DeferredTurnProgressToast />}
      {!isWikiSubdomain && singleplayer && <DeferredSingleplayerGuide />}
      {!isWikiSubdomain && <DeferredTutorialCoachMount />}
      {!isWikiSubdomain && <LiveRefreshBanner />}
    </>
  );
}
