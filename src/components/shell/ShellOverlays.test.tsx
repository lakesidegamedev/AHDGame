import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AdSlot", () => ({ AdSlot: () => <i data-c="AdSlot" /> }));
vi.mock("@/components/askDrawer/AskDrawer", () => ({ AskDrawer: () => <i data-c="AskDrawer" /> }));
vi.mock("@/components/AuthConnectivityGate", () => ({
  AuthConnectivityGate: () => <i data-c="AuthConnectivityGate" />,
}));
vi.mock("@/components/BugReportFab", () => ({ BugReportFab: () => <i data-c="BugReportFab" /> }));
vi.mock("@/components/DeferredShellOverlays", () => ({
  DeferredNominationChoicePrompt: () => <i data-c="NominationChoicePrompt" />,
  DeferredSeasonRecapGate: () => <i data-c="SeasonRecapGate" />,
  DeferredSingleplayerGuide: () => <i data-c="SingleplayerGuide" />,
  DeferredStatAllocationGate: () => <i data-c="StatAllocationGate" />,
  DeferredTurnProgressToast: () => <i data-c="TurnProgressToast" />,
  DeferredTutorialCoachMount: () => <i data-c="TutorialCoachMount" />,
  DeferredWealthTierRepickGate: () => <i data-c="WealthTierRepickGate" />,
}));
vi.mock("@/components/LiveRefreshBanner", () => ({
  LiveRefreshBanner: () => <i data-c="LiveRefreshBanner" />,
}));
vi.mock("@/components/MaintenancePartialBanner", () => ({
  MaintenancePartialBanner: () => <i data-c="MaintenancePartialBanner" />,
}));
vi.mock("@/components/MassCrashAlertBanner", () => ({
  MassCrashAlertBanner: () => <i data-c="MassCrashAlertBanner" />,
}));
vi.mock("@/components/NavbarWrapper", () => ({
  NavbarWrapper: () => <i data-c="NavbarWrapper" />,
}));
vi.mock("@/components/PollBannerNotice", () => ({
  PollBannerNotice: () => <i data-c="PollBannerNotice" />,
}));
vi.mock("@/components/SiteFooter", () => ({ SiteFooter: () => <i data-c="SiteFooter" /> }));
vi.mock("@/components/StatusBar", () => ({ StatusBar: () => <i data-c="StatusBar" /> }));
vi.mock("@/components/VpnGateBanner", () => ({
  VpnGateBanner: () => <i data-c="VpnGateBanner" />,
}));

import { ShellOverlaysBottom, ShellOverlaysTop, type ShellFlags } from "./ShellOverlays";
import * as Full from "./ShellOverlaysFull";

const base: ShellFlags = {
  light: false,
  pathname: "/",
  isWikiSubdomain: false,
  singleplayer: false,
  isNativeApp: false,
  isClientShell: false,
  isStoreApp: false,
  nativeStatusDock: false,
  initialPageCountry: null,
  typedWordmark: false,
};

function rendered(flags: ShellFlags): string[] {
  const html = renderToStaticMarkup(
    <>
      <ShellOverlaysTop {...flags} full={flags.light ? null : Full} />
      <ShellOverlaysBottom {...flags} full={flags.light ? null : Full} />
    </>
  );
  return [...html.matchAll(/data-c="([^"]+)"/g)].map((match) => match[1]);
}

const SIGNED_IN_ONLY = [
  "BugReportFab",
  "AskDrawer",
  "VpnGateBanner",
  "StatAllocationGate",
  "WealthTierRepickGate",
  "SeasonRecapGate",
  "NominationChoicePrompt",
  "AdSlot",
  "SiteFooter",
  "StatusBar",
  "TutorialCoachMount",
  "LiveRefreshBanner",
];

describe("shell overlays", () => {
  it("the full shell renders every signed-in overlay", () => {
    const names = rendered(base);
    for (const name of [...SIGNED_IN_ONLY, "NavbarWrapper"]) expect(names).toContain(name);
  });

  it("the light shell renders none of the signed-in overlays", () => {
    const names = rendered({ ...base, light: true });
    for (const name of SIGNED_IN_ONLY) expect(names).not.toContain(name);
  });

  it("the light shell keeps what an anonymous visitor can see", () => {
    const names = rendered({ ...base, light: true });
    for (const name of [
      "NavbarWrapper",
      "PollBannerNotice",
      "MaintenancePartialBanner",
      "MassCrashAlertBanner",
      "AuthConnectivityGate",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("the light shell drops the navbar on the sign-in page, which hides it", () => {
    expect(rendered({ ...base, light: true, pathname: "/login" })).not.toContain("NavbarWrapper");
    expect(rendered({ ...base, pathname: "/login" })).toContain("NavbarWrapper");
  });

  it("singleplayer keeps its own overlays and skips the ask drawer", () => {
    const names = rendered({ ...base, singleplayer: true });
    expect(names).toContain("TurnProgressToast");
    expect(names).toContain("SingleplayerGuide");
    expect(names).not.toContain("AskDrawer");
  });

  it("the wiki subdomain renders no chrome", () => {
    const names = rendered({ ...base, isWikiSubdomain: true });
    expect(names).toEqual([
      "AuthConnectivityGate",
      "StatAllocationGate",
      "WealthTierRepickGate",
      "SeasonRecapGate",
      "NominationChoicePrompt",
    ]);
  });
});
