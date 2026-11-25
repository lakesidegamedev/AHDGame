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

describe("PricingPanel asking prices", () => {
  it("shows each output's ask beside what buyers paid", () => {
    panel({
      posture: null,
      effectivePosture: null,
      salesBasis: "settlement",
      soldFraction: 0,
      clearingFactor: 0,
      asks: [
        {
          commodity: "electronics",
          askingUnitPrice: 494,
          paidUnitPrice: 480,
          marketUnitPrice: 395,
        },
        {
          commodity: "software",
          askingUnitPrice: 2070,
          paidUnitPrice: null,
          marketUnitPrice: null,
        },
      ],
    });
    const list = screen.getByRole("list", { name: "Asking prices last turn" });
    expect(list.textContent).toContain("Electronics");
    expect(list.textContent).toMatch(/asked.*494.*you were paid.*480.*lane price.*395/);
    expect(list.textContent).toMatch(/asked.*2,?070/);
    expect(screen.getByText(/moves at most 6% a turn/)).toBeTruthy();
  });

  it("shows the cost per unit and markup a cost-plus ask used, matching the ask", () => {
    panel({
      posture: 0.1,
      pricingMode: "costPlus",
      costPlusEnabled: true,
      costPlusReady: true,
      effectivePosture: null,
      salesBasis: "settlement",
      soldFraction: 1,
      clearingFactor: 1,
      asks: [
        {
          commodity: "steel",
          askingUnitPrice: 880,
          paidUnitPrice: 880,
          marketUnitPrice: 2000,
          costPlus: { markup: 0.1, unitCost: 800 },
        },
        {
          commodity: "plastics",
          askingUnitPrice: 950,
          paidUnitPrice: null,
          marketUnitPrice: 950,
          costPlus: { markup: 0.1 },
        },
      ],
    });
    const list = screen.getByRole("list", { name: "Asking prices last turn" });
    expect(list.textContent).toMatch(/asked.*880/);
    expect(list.textContent).toMatch(/800 cost per unit made last run plus 10% = .*880/);
    expect(list.textContent).toContain("no settled run to price from yet");
  });
});
