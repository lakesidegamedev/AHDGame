/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enNav from "../../messages/en/nav.json";
import { Navbar } from "./Navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/country/us",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={enNav}>
      <Navbar
        showProfile
        user={{ username: "tester", isAdmin: true }}
        homeState={{ id: "CA", name: "California", countryId: "US" }}
        currentParty={{ id: "dem", name: "Democratic Party", countryId: "US" }}
        activeElection={{ id: "e1", seatId: "s1", label: "CA-12" }}
        cabinetOffice={{
          positionId: "secretary-of-state",
          positionName: "Secretary of State",
          countryCode: "us",
        }}
        justiceOffice={{ countryCode: "us", seatNumber: 3 }}
        governorOffice={{ stateId: "CA", stateName: "California", countryCode: "us" }}
      />
    </NextIntlClientProvider>
  );
}

async function openMobileMenu() {
  fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
  await waitFor(() => expect(document.getElementById("mobile-nav-menu")).toBeTruthy());
  return within(document.getElementById("mobile-nav-menu") as HTMLElement);
}

describe("Navbar mobile menu", () => {
  it("keeps the closed menu out of the DOM until the hamburger opens", async () => {
    renderNavbar();
    expect(document.getElementById("mobile-nav-menu")).toBeNull();

    const menu = await openMobileMenu();
    expect(menu.getByRole("button", { name: /^Help\/Information$/ })).toBeTruthy();
  });

  it("renders the same section order as before: profile, actions, staff, state, nation, world, contests, help", async () => {
    renderNavbar();
    const menu = await openMobileMenu();

    const sectionButtons = Array.from(
      (document.getElementById("mobile-nav-menu") as HTMLElement).querySelectorAll("button")
    )
      .filter((button) => button.getAttribute("aria-expanded") !== null)
      .map((button) => button.textContent?.trim());

    expect(sectionButtons).toEqual([
      "Staff",
      "California",
      "United States",
      "World",
      "Help/Information",
    ]);
    expect(menu.getByRole("link", { name: "Profile" })).toBeTruthy();
    expect(menu.getByRole("link", { name: "Actions" })).toBeTruthy();
    expect(menu.getByRole("link", { name: "Contests" })).toBeTruthy();
  });

  it("opens the character switcher from the profile row", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={enNav}>
        <Navbar
          showProfile
          user={{ username: "tester" }}
          homeState={{ id: "CA", name: "California", countryId: "US" }}
          adminCharacters={[
            { id: "one", name: "Alice", countryId: "US", party: null, isActive: true },
            { id: "two", name: "Bob", countryId: "UK", party: null, isActive: false },
          ]}
        />
      </NextIntlClientProvider>
    );
    const menu = await openMobileMenu();

    fireEvent.click(menu.getByRole("button", { name: /Alice/ }));
    await waitFor(() => expect(menu.getByText(/Bob/)).toBeTruthy());
  });

  it("expands every section from the extracted body", async () => {
    renderNavbar();
    const menu = await openMobileMenu();

    fireEvent.click(menu.getByRole("button", { name: "California" }));
    expect(menu.getByRole("link", { name: "State Overview" })).toBeTruthy();
    expect(menu.getByRole("link", { name: "State Legislature" })).toBeTruthy();
    expect(menu.getByRole("link", { name: "Office" })).toBeTruthy();
    expect(menu.getByRole("link", { name: /My Election/ })).toBeTruthy();
    expect(menu.getByRole("link", { name: /My Office/ })).toBeTruthy();

    fireEvent.click(menu.getByRole("button", { name: "Staff" }));
    expect(menu.getByRole("link", { name: "Admin Panel" })).toBeTruthy();

    fireEvent.click(menu.getByRole("button", { name: /United States/ }));
    expect(menu.getByRole("link", { name: /Cabinet Office/ })).toBeTruthy();
    expect(menu.getByRole("link", { name: "Justice Office" })).toBeTruthy();
    expect(menu.getByRole("link", { name: /My Party/ })).toBeTruthy();
    await waitFor(() =>
      expect(
        (document.getElementById("mobile-nav-menu") as HTMLElement).querySelector(
          'a[href="/country/us"]'
        )
      ).toBeTruthy()
    );

    fireEvent.click(menu.getByRole("button", { name: "World" }));
    await waitFor(() =>
      expect(
        (document.getElementById("mobile-nav-menu") as HTMLElement).querySelector(
          'a[href="/world/trade"]'
        )
      ).toBeTruthy()
    );
  });

  it("expands a collapsed section and closes the menu on navigation", async () => {
    renderNavbar();
    const menu = await openMobileMenu();

    expect(menu.queryByRole("link", { name: "Server Status" })).toBeNull();
    fireEvent.click(menu.getByRole("button", { name: /^Help\/Information$/ }));
    expect(menu.getByRole("link", { name: "Server Status" })).toBeTruthy();

    fireEvent.click(menu.getByRole("link", { name: "Server Status" }));
    await waitFor(() => expect(document.getElementById("mobile-nav-menu")).toBeNull());
  });
});
