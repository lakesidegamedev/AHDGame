import type { ComponentType } from "react";
import { AuthConnectivityGate } from "@/components/AuthConnectivityGate";
import { MaintenancePartialBanner } from "@/components/MaintenancePartialBanner";
import { MassCrashAlertBanner } from "@/components/MassCrashAlertBanner";
import { NavbarWrapper } from "@/components/NavbarWrapper";
import { PollBannerNotice } from "@/components/PollBannerNotice";
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

/**
 * The overlays only a full shell renders, loaded by the layout with a dynamic
 * import so a light-shell page never downloads their code. See
 * `ShellOverlaysFull`.
 */
export interface ShellFullParts {
  TopLead: ComponentType<ShellFlags>;
  TopGates: ComponentType<ShellFlags>;
  Bottom: ComponentType<ShellFlags>;
}

/** Always-mounted chrome that sits before `<main>`. */
export function ShellOverlaysTop({
  full,
  ...flags
}: ShellFlags & { full?: ShellFullParts | null }) {
  const { light, isWikiSubdomain } = flags;
  const showNavbar = !isWikiSubdomain && !(light && isChromeHiddenPath(flags.pathname));
  return (
    <>
      {showNavbar && (
        <NavbarWrapper
          singleplayer={flags.singleplayer}
          clientShell={flags.isClientShell}
          phoneApp={flags.isStoreApp}
          displayMode={flags.displayMode}
          initialPageCountry={flags.initialPageCountry}
          typedWordmark={flags.typedWordmark}
        />
      )}
      {full && <full.TopLead {...flags} />}
      {!isWikiSubdomain && <MassCrashAlertBanner />}
      {!isWikiSubdomain && <MaintenancePartialBanner />}
      {/* Admin-controlled survey strip. Not auth-gated: it must reach signed-out
          visitors too. */}
      {!isWikiSubdomain && <PollBannerNotice />}
      <AuthConnectivityGate />
      {full && <full.TopGates {...flags} />}
    </>
  );
}

/** Always-mounted chrome that sits after `<main>`. */
export function ShellOverlaysBottom({
  full,
  ...flags
}: ShellFlags & { full?: ShellFullParts | null }) {
  return full ? <full.Bottom {...flags} /> : null;
}
