// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { describe, expect, it } from "vitest";
import { fireEvent, render as renderView, screen } from "@testing-library/react";
import PricingPanel from "./PricingPanel";
import type { PricingData } from "../types";

function render(ui: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const panel = (pricing: PricingData) =>
  render(<PricingPanel corporationId="c1" sectorId="s1" isCeo pricing={pricing} />);

/** Opens the tooltip on the row label and returns everything on the page. */
function openRow(label: RegExp): string {
  fireEvent.mouseEnter(screen.getByText(label));
  return document.body.textContent ?? "";
}

describe("PricingPanel sales figures", () => {
  it("describes a funded plant's sale against its asking price with no legacy posture", () => {
    const { container } = panel({
      posture: null,
      salesBasis: "settlement",
      effectivePosture: null,
      soldFraction: 0.8,
      clearingFactor: 0.8,
    });
    expect(container.textContent).toContain("Paid against asking price (last turn)");
    const text = openRow(/Paid against asking price/);
    expect(text).toContain("80% of what it offered sold");
    expect(text).toContain("would have earned at its asking price");
    expect(text).not.toContain("Effective posture used");
    expect(text).not.toContain("faded in over 5 game years");
    expect(text).not.toContain("market estimate");
    expect(text).not.toMatch(/[–—]/);
  });

  it("labels the legacy figures as the market estimate where there is no funded record", () => {
    const { container } = panel({
      posture: null,
      salesBasis: "estimate",
      effectivePosture: -0.1,
      soldFraction: 0.55,
      clearingFactor: 0.9,
    });
    expect(container.textContent).toContain("Clearing result (last turn, market estimate)");
    const text = openRow(/Clearing result/);
    expect(text).toContain("Effective posture used");
    expect(screen.getByText(/55% sold of units offered/)).toBeTruthy();
  });

  it("says when a funded plant offered nothing for outside sale", () => {
    const { container } = panel({
      posture: null,
      salesBasis: "settlement",
      effectivePosture: null,
      soldFraction: null,
      clearingFactor: null,
    });
    expect(container.textContent).toContain("Nothing was offered for outside sale last turn.");
  });
});
