/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { WorldDropdown } from "./WorldDropdown";
import enNav from "../../messages/en/nav.json";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enNav}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("WorldDropdown lazy panel", () => {
  it("renders the same world entries once the panel chunk resolves", async () => {
    render(
      <WorldDropdown
        countryId="US"
        myCorporationId={42}
        myCorporationHasGroup
        myUnionId="u1"
        unionsEnabled
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    // The panel body is a next/dynamic chunk, so wait for its first link.
    expect(await screen.findByRole("menuitem", { name: "My Corporation" })).toBeTruthy();

    expect(screen.getByRole("menuitem", { name: "Subsidiary Group" }).getAttribute("href")).toBe(
      "/corporation/42/group"
    );
    expect(screen.getByRole("menuitem", { name: "My Union" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Nations & World Map" }).getAttribute("href")).toBe(
      "/world"
    );
    expect(screen.getByRole("menuitem", { name: "Crises" })).toBeTruthy();
  });

  it("hides corporate entries for a viewer without a corporation", async () => {
    render(<WorldDropdown countryId="US" />);
    fireEvent.click(screen.getByRole("button", { name: "World" }));

    expect(await screen.findByRole("menuitem", { name: "Nations & World Map" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "My Corporation" })).toBeNull();
  });
});
