/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HelpDropdown, HELP_STATUS_URL } from "./HelpDropdown";
import enNav from "../../messages/en/nav.json";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enNav}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("HelpDropdown lazy panel", () => {
  it("renders the same help entries once the panel chunk resolves", async () => {
    render(<HelpDropdown />);

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    // The panel body is a next/dynamic chunk, so wait for its first link.
    expect((await screen.findByRole("link", { name: "About" })).getAttribute("href")).toBe(
      "/about"
    );

    expect(screen.getByRole("link", { name: "Suggestions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Support on Patreon" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Server Status" }).getAttribute("href")).toBe(
      HELP_STATUS_URL
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe(
      "/privacy"
    );
  });

  it("keeps the feedback row wired to its callback", async () => {
    let opened = 0;
    render(<HelpDropdown onOpenFeedback={() => (opened += 1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));

    fireEvent.click(await screen.findByRole("button", { name: /Quick suggest/i }));
    expect(opened).toBe(1);
  });
});
