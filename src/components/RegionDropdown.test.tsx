/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RegionDropdown } from "./RegionDropdown";
import enNav from "../../messages/en/nav.json";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enNav}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("RegionDropdown lazy panel", () => {
  it("renders the same region entries once the panel chunk resolves", async () => {
    render(
      <RegionDropdown
        regionId="CA"
        regionName="California"
        regionCountryId="US"
        currentParty={{ id: "1", name: "Democratic Party", countryId: "US" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /california/i }));
    // The panel body is a next/dynamic chunk, so wait for its first link.
    expect(await screen.findByText("Region overview")).toBeTruthy();
    expect(screen.getByText("My party - Democratic Party")).toBeTruthy();
  });

  it("hides the party branch when the viewer's party is from another country", async () => {
    render(
      <RegionDropdown
        regionId="CA"
        regionName="California"
        regionCountryId="US"
        currentParty={{ id: "1", name: "Other Party", countryId: "UK" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /california/i }));
    expect(await screen.findByText("Region overview")).toBeTruthy();
    expect(screen.queryByText(/My party -/)).toBeNull();
  });
});
