// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { ExperimentalNavbar, type ExperimentalNavbarProps } from "./ExperimentalNavbar";
import en from "../../messages/en/nav.json";
import de from "../../messages/de/nav.json";

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
  useEnabledCountries: () => ["US"],
  useCountryDisplayName: () => () => "United States",
}));
vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));
vi.mock("./UniversalSearch", () => ({ UniversalSearch: () => null }));
vi.mock("./Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/navbar/ExperimentalUserMenu", () => ({ ExperimentalUserMenu: () => null }));
vi.mock("@/components/navbar/ExperimentalMobileMenu", () => ({
  ExperimentalMobileMenu: () => null,
}));
vi.mock("@/lib/analytics/capture", () => ({ captureProductEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});

function renderNav(
  layout: ExperimentalNavbarProps["desktopLayout"],
  locale = "en",
  overrides: Partial<ExperimentalNavbarProps> = {}
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : de}>
      <ExperimentalNavbar
        desktopLayout={layout}
        user={{ username: "viewer" }}
        showProfile
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

async function openNation() {
  const trigger = screen.getByRole("button", { name: "United States" });
  fireEvent.click(trigger);
  const panel = await screen.findByRole("region", { name: "United States" });
  return { trigger, panel };
}

describe("experimental desktop menu integration", () => {
  it("preserves nation links in grouped cards, including conditional links", async () => {
    renderNav("cards");
    const { panel } = await openNation();
    const hrefs = within(panel)
      .queryAllByRole<HTMLAnchorElement>("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/elections/US-president");
    expect(hrefs).toContain("/charters/charter");
    expect(hrefs).toContain("/country/us/referendums");
    expect(hrefs).toContain("/country/us/map");
    expect(hrefs).toContain("/banking");
    expect(hrefs).toContain("/political-operations");
    expect(hrefs.some((href) => href.includes("treasury"))).toBe(true);
  });

  it("keeps every visible World destination, with personal shortcuts first", async () => {
    renderNav("cards");
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    const panel = await screen.findByRole("region", { name: "World" });
    const hrefs = within(panel)
      .getAllByRole<HTMLAnchorElement>("link")
      .map((a) => a.getAttribute("href"));
    for (const href of [
      "/corporation/7",
      "/corporation/7/group",
      "/unions/union",
      "/world/german-question",
      "/world/conflicts",
      "/market",
      "/world/trade",
    ])
      expect(hrefs).toContain(href);
    expect(within(panel).getAllByRole("heading")[0].textContent).toBe("Markets & finance");
  });

  it("does not expose disabled features or absent personal roles", async () => {
    renderNav("cards", "en", {
      myCorporationId: null,
      myUnionId: null,
      unionsEnabled: false,
      conflictsEnabled: false,
      settlementCrisisLive: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    const panel = await screen.findByRole("region", { name: "World" });
    const hrefs = within(panel)
      .getAllByRole<HTMLAnchorElement>("link")
      .map((a) => a.getAttribute("href"));
    for (const href of [
      "/corporation/7",
      "/corporation/7/group",
      "/unions/union",
      "/unions",
      "/world/conflicts",
      "/world/german-question",
    ])
      expect(hrefs).not.toContain(href);
  });

  it("focuses links on open and restores the trigger on Escape", async () => {
    renderNav("cards");
    const { trigger, panel } = await openNation();
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([null, "standard"] as const)(
    "keeps the original dropdown when the mega layout is %s",
    async (layout) => {
      renderNav(layout);
      fireEvent.click(screen.getByRole("button", { name: "United States" }));
      await screen.findByRole("menu");
      expect(document.querySelector("[data-desktop-mega-menu]")).toBeNull();
    }
  );

  it("renders translated dropdown content and theme-inheriting pixel geometry", async () => {
    renderNav("cards", "de");
    const { panel } = await openNation();
    expect(within(panel).getByRole("heading", { name: "Politik" })).toBeTruthy();
    const icon = panel.querySelector('svg[fill="currentColor"]');
    expect(icon?.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(icon?.querySelector("rect")?.hasAttribute("fill")).toBe(false);
  });
});
