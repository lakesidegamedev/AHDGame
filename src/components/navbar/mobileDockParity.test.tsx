// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { createTranslator } from "next-intl";
import { ExperimentalNavbar } from "@/components/ExperimentalNavbar";
import {
  buildDesktopMenus,
  stateLegislatureLabelFor,
  type NavTranslator,
} from "@/components/navbar/dockMenus";
import { buildMobileDock } from "@/components/navbar/mobileDockBuilder";
import { buildNationalDetailsSections } from "@/components/navbar/nationDetailsSections";
import { mobileDockPayload } from "@/lib/navigation/mobileDockPayload";
import { visibleStaffNavItems } from "@/components/navbar/staffNavItems";
import en from "../../../messages/en/nav.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/country/us" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/hooks/useCountryContext", () => ({
  useCountryContext: () => ({ pageCountry: "US", userCountry: "US" }),
}));
vi.mock("@/hooks/useActiveCharters", () => ({
  useActiveCharters: () => [{ id: "charter", proposedName: "New party" }],
}));
vi.mock("@/hooks/useActiveReferendumCampaign", () => ({ useActiveReferendumCampaign: () => true }));
vi.mock("@/hooks/useActivePresidentElection", () => ({
  useActivePresidentElection: () => ({ id: "president", seatId: "US-president" }),
}));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useEnabledCountries: () => ["US", "UK"],
  useCountryDisplayName: () => (id: string) => (id === "UK" ? "United Kingdom" : "United States"),
}));
vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));
vi.mock("@/components/UniversalSearch", () => ({ UniversalSearch: () => null }));
vi.mock("@/components/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/navbar/ExperimentalUserMenu", () => ({ ExperimentalUserMenu: () => null }));
vi.mock("@/components/navbar/ExperimentalMobileMenu", () => ({
  ExperimentalMobileMenu: ({ profileOnly }: { profileOnly?: boolean }) => (
    <div data-testid={profileOnly ? "profile-menu" : "full-menu"} />
  ),
}));
vi.mock("@/lib/analytics/capture", () => ({ captureProductEvent: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});

const homeState = { id: "NY", name: "New York", countryId: "US" };
const currentParty = { id: "1", name: "My party", countryId: "US" };
const activeElection = { id: "election", seatId: "NY-senate", label: "Senate" };
const cabinetOffice = { countryCode: "US", positionId: "treasury", positionName: "Treasury" };
const justiceOffice = { countryCode: "US", seatNumber: 1 };
const governorOffice = { stateId: "NY", stateName: "New York", countryCode: "US" };
const countryName = (id: string) => (id === "UK" ? "United Kingdom" : "United States");

/** The same player the web dock test renders, built through the API's path. */
function apiPayload() {
  const t = createTranslator({
    locale: "en",
    messages: en,
    namespace: "nav",
  }) as unknown as NavTranslator;
  const menus = buildDesktopMenus({
    t,
    build: () => true,
    showProfile: true,
    pageCountry: "US",
    userCountry: "US",
    countryName,
    homeState,
    currentParty,
    activeElection,
    cabinetOffice,
    justiceOffice,
    governorOffice,
    myCorporationId: 7,
    myCorporationHasGroup: true,
    myUnionId: "union",
    conflictsEnabled: true,
    unionsEnabled: true,
    settlementCrisisLive: true,
    nationalDetailSections: buildNationalDetailsSections("US", {
      activePresidentElection: { id: "president", seatId: "US-president" },
      charters: { href: "/charters/charter", label: "Charter: New party" },
      hasActiveReferendumCampaign: true,
      unionsEnabled: true,
    }),
    stateLegislatureLabel: stateLegislatureLabelFor(t, homeState),
    staffSubItems: visibleStaffNavItems({ isAdmin: true, isModerator: false }),
    showWiki: true,
  });
  return mobileDockPayload(
    buildMobileDock({
      t,
      pathname: "",
      pageCountry: "US",
      countryName,
      homeState,
      myCorporationId: 7,
      isImperialMode: false,
      singleplayer: false,
      unreadCount: 3,
      profileDisplayName: "viewer",
      switchableCountries: ["US", "UK"],
      menus,
    })
  );
}

function renderWebDock() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExperimentalNavbar
        mobileLayout="dock"
        user={{ username: "viewer", isAdmin: true }}
        showProfile
        unreadCount={3}
        currentParty={currentParty}
        homeState={homeState}
        activeElection={activeElection}
        cabinetOffice={cabinetOffice}
        justiceOffice={justiceOffice}
        governorOffice={governorOffice}
        myCorporationId={7}
        myCorporationHasGroup
        myUnionId="union"
        unionsEnabled
        conflictsEnabled
        settlementCrisisLive
      />
    </NextIntlClientProvider>
  );
}

const dock = () => screen.getByRole("navigation", { name: en.nav.dock.label });

function webSheet(tab: string) {
  fireEvent.click(within(dock()).getByRole("button", { name: tab }));
  const sheet = screen.getByRole("dialog");
  const links = within(sheet)
    .getAllByRole<HTMLAnchorElement>("link")
    .map((a) => ({ href: a.getAttribute("href") ?? "", label: a.textContent ?? "" }));
  fireEvent.click(within(sheet).getByRole("button", { name: en.nav.dock.close }));
  return links;
}

describe("the dock API matches the web dock", () => {
  it("has the same tabs, in the same order, with the same labels and destinations", () => {
    renderWebDock();
    const payload = apiPayload();
    const web = [...within(dock()).getAllByRole("listitem")].map((li) => {
      const link = li.querySelector("a");
      return { label: li.textContent ?? "", href: link?.getAttribute("href") ?? undefined };
    });
    expect(payload.tabs.map((tab) => ({ label: tab.label, href: tab.href }))).toEqual(web);
    expect(payload.tabs.map((tab) => tab.id)).toEqual([
      "company",
      "state",
      "nation",
      "actions",
      "more",
    ]);
  });

  it("offers every destination the web sheets offer", () => {
    renderWebDock();
    const payload = apiPayload();
    for (const [key, tab] of [
      ["state", "New York"],
      ["nation", "United States"],
      ["more", "More"],
    ] as const) {
      const web = webSheet(tab);
      const api = payload.sheets[key]!.sections.flatMap((section) => section.links);
      // The web sheet may repeat a link (an overview that is also a card); the API need not.
      expect(new Set(api.map((link) => link.href))).toEqual(new Set(web.map((link) => link.href)));
    }
  });

  it("sends every icon as an 11 by 11 bitmap", () => {
    const payload = apiPayload();
    const icons = [
      ...payload.tabs.map((tab) => tab.icon),
      ...Object.values(payload.sheets).flatMap((sheet) =>
        sheet!.sections.flatMap((section) => section.links.flatMap((link) => link.icon ?? []))
      ),
    ];
    expect(icons.length).toBeGreaterThan(20);
    for (const icon of icons) {
      expect(icon.grid).toHaveLength(11);
      for (const row of icon.grid) expect(row).toMatch(/^[01]{11}$/);
      expect(icon.grid.join("")).toContain("1");
    }
  });
});
