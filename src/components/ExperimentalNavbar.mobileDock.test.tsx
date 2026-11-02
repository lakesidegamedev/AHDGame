// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { ExperimentalNavbar, type ExperimentalNavbarProps } from "./ExperimentalNavbar";
import en from "../../messages/en/nav.json";

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
vi.mock("./UniversalSearch", () => ({ UniversalSearch: () => null }));
vi.mock("./Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/navbar/ExperimentalUserMenu", () => ({ ExperimentalUserMenu: () => null }));
vi.mock("@/components/navbar/ExperimentalMobileMenu", () => ({
  ExperimentalMobileMenu: ({ profileOnly }: { profileOnly?: boolean }) => (
    <div data-testid={profileOnly ? "profile-menu" : "full-menu"} />
  ),
}));
vi.mock("@/lib/analytics/capture", () => ({ captureProductEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});

function renderNav(overrides: Partial<ExperimentalNavbarProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExperimentalNavbar
        mobileLayout="dock"
        user={{ username: "viewer", isAdmin: true }}
        showProfile
        unreadCount={3}
        currentParty={{ id: "1", name: "My party", countryId: "US" }}
        homeState={{ id: "NY", name: "New York", countryId: "US" }}
        activeElection={{ id: "election", seatId: "NY-senate", label: "Senate" }}
        cabinetOffice={{ countryCode: "US", positionId: "treasury", positionName: "Treasury" }}
        justiceOffice={{ countryCode: "US", seatNumber: 1 }}
        governorOffice={{ stateId: "NY", stateName: "New York", countryCode: "US" }}
        myCorporationId={7}
        myCorporationHasGroup
        myUnionId="union"
        unionsEnabled
        conflictsEnabled
        settlementCrisisLive
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

const dock = () => screen.getByRole("navigation", { name: en.nav.dock.label });

function sheetHrefs(tab: string) {
  fireEvent.click(within(dock()).getByRole("button", { name: tab }));
  const sheet = screen.getByRole("dialog");
  const hrefs = within(sheet)
    .getAllByRole<HTMLAnchorElement>("link")
    .map((a) => a.getAttribute("href") ?? "");
  fireEvent.click(within(sheet).getByRole("button", { name: en.nav.dock.close }));
  return hrefs;
}

describe("phone navigation dock", () => {
  it("puts the company and Actions one tap away", () => {
    renderNav();
    const links = within(dock()).getAllByRole<HTMLAnchorElement>("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/corporation/7", "/actions"]);
    expect(
      within(dock()).getByRole("button", { name: "United States" }).getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("swaps the company tab for the market without a company, and drops Actions in imperial mode", () => {
    renderNav({ myCorporationId: null, isImperialMode: true });
    const links = within(dock()).getAllByRole<HTMLAnchorElement>("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/market"]);
  });

  it("keeps every state and nation destination in the section sheets", () => {
    renderNav();
    const state = sheetHrefs("New York");
    expect(state).toEqual(
      expect.arrayContaining([
        "/country/us/region/NY",
        "/country/us/region/NY/party/1",
        "/country/us/region/NY/legislature",
        "/country/us/region/NY?tab=economy",
        "/elections/NY-senate",
        "/country/us/region/NY/office",
      ])
    );
    expect(state.some((href) => href.includes("sub=elections"))).toBe(true);

    const nation = sheetHrefs("United States");
    expect(nation).toEqual(
      expect.arrayContaining([
        "/country/us",
        "/country/uk",
        "/elections/US-president",
        "/charters/charter",
        "/country/us/referendums",
        "/country/us/map",
        "/banking",
        "/political-operations",
      ])
    );
    expect(nation.some((href) => href.includes("treasury"))).toBe(true);
  });

  it("keeps personal, world, help and staff destinations under More", () => {
    renderNav();
    const more = sheetHrefs("More");
    expect(more).toEqual(
      expect.arrayContaining([
        "/profile",
        "/notifications",
        "/portfolio",
        "/portfolio?tab=currency",
        "/settings",
        "/contests",
        "/changelog",
        "/world",
        "/market",
        "/world/trade",
        "/world/conflicts",
        "/unions",
        "/unions/union",
        "/corporation/7/group",
        "/about",
        "/privacy",
        "/admin",
      ])
    );
  });

  it("moves the menu button out of the top bar and keeps the profile menu on the avatar", () => {
    renderNav();
    expect(screen.queryByRole("button", { name: en.nav.common.openMenu })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.nav.common.profile }));
    expect(screen.getByTestId("profile-menu")).toBeTruthy();
  });

  it("leaves the bottom edge to the phone app's own tab bar", () => {
    renderNav({ phoneApp: true });
    expect(screen.queryByRole("navigation", { name: en.nav.dock.label })).toBeNull();
    expect(screen.getByRole("button", { name: en.nav.common.openMenu })).toBeTruthy();
  });

  it("is not rendered for the standard phone layout", () => {
    renderNav({ mobileLayout: "standard" });
    expect(screen.queryByRole("navigation", { name: en.nav.dock.label })).toBeNull();
    expect(screen.getByRole("button", { name: en.nav.common.openMenu })).toBeTruthy();
  });
});
