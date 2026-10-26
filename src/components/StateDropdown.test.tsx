/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StateDropdown } from "./StateDropdown";
import enNav from "../../messages/en/nav.json";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enNav}>
      {ui}
    </NextIntlClientProvider>
  );
}

async function openDropdown() {
  fireEvent.click(screen.getByRole("button", { name: /california/i }));
  // The panel body is a next/dynamic chunk, so wait for its first link.
  return screen.findByRole("link", { name: "State Overview" });
}

describe("StateDropdown lazy panel", () => {
  it("renders the same state entries once the panel chunk resolves", async () => {
    render(
      <StateDropdown
        stateId="CA"
        stateName="California"
        countryId="US"
        currentParty={{ id: "1", name: "Democratic Party" }}
        activeElection={{ id: "e1", seatId: "seat-1", label: "Governor" }}
        cabinetOffice={{ positionId: "treasury", positionName: "Treasury", countryCode: "us" }}
        governorOffice={{ stateId: "CA", stateName: "California", countryCode: "us" }}
      />
    );

    const overview = await openDropdown();
    expect(overview.getAttribute("href")).toBe("/country/us/region/CA");

    expect(screen.getByRole("link", { name: "State Economy" }).getAttribute("href")).toBe(
      "/country/us/region/CA?tab=economy"
    );
    expect(screen.getByRole("link", { name: "State Elections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "State Legislature" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Office" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My Election" }).getAttribute("href")).toBe(
      "/elections/seat-1"
    );
    expect(screen.getByRole("link", { name: "My Office" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /My Party - Democratic Party/ })).toBeTruthy();
  });

  it("keeps the disabled My Election row when the viewer has no race", async () => {
    render(<StateDropdown stateId="CA" stateName="California" countryId="US" />);
    fireEvent.click(screen.getByRole("button", { name: /california/i }));

    expect(await screen.findByText("My Election: None")).toBeTruthy();
  });
});
