// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { describe, expect, it } from "vitest";
import { render as renderView, screen } from "@testing-library/react";
import { STRANDED_WARN_TURNS } from "@/lib/corporations/strandedPlant";
import StrandedPlantBanner from "./StrandedPlantBanner";

const estimate = (soldShare: number) =>
  ({ basis: "estimate", soldShare, turnsInRow: STRANDED_WARN_TURNS }) as const;

describe("StrandedPlantBanner", () => {
  it("stays hidden without a warning", () => {
    const { container } = render(<StrandedPlantBanner warning={null} isCeo />);

    expect(container.textContent).toBe("");
  });

  it("reports current sales without claiming inventory was destroyed", () => {
    render(<StrandedPlantBanner warning={estimate(0.37)} isCeo={false} />);

    const warning = screen.getByRole("status", { name: "Stranded plant warning" });
    expect(warning.textContent).toContain(`for ${STRANDED_WARN_TURNS} turns`);
    expect(warning.textContent).toContain("last turn: 37%");
    expect(warning.textContent).toContain("earns no revenue this turn");
    expect(warning.textContent).not.toContain("money spent making it is lost");
    expect(warning.textContent).not.toContain("Options:");
  });

  it("shows the CEO every relevant response", () => {
    render(<StrandedPlantBanner warning={estimate(0.2)} isCeo />);

    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("stockpile storable goods");
    expect(warning.textContent).toContain("park surplus capacity");
    expect(warning.textContent).toContain("change to a strategy");
    expect(warning.textContent).toContain("sell the sector");
  });

  it("names special freight and explains its shared capacity cost", () => {
    render(
      <StrandedPlantBanner
        warning={estimate(0.4)}
        deliveryLimitedFraction={0.25}
        deliveryLimitedFreightClass="special"
        isCeo
      />
    );

    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("Special freight");
    expect(warning.textContent).toContain("three times as much shared freight capacity");
    expect(warning.textContent).toContain("shared freight capacity");
  });
});

function render(ui: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("StrandedPlantBanner on a mixed-output site", () => {
  it("names the product that is not selling instead of blaming the whole plant", () => {
    render(
      <StrandedPlantBanner
        warning={estimate(0.45)}
        isCeo
        outputs={[
          { label: "Electronics & Semiconductors", soldFraction: 1 },
          { label: "Software & IT Services", soldFraction: 0.12 },
        ]}
      />
    );
    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("Software & IT Services is not selling");
    expect(warning.textContent).toContain("Electronics & Semiconductors (100% sold) found buyers");
    expect(warning.textContent).toContain("makes more Electronics & Semiconductors");
    expect(warning.textContent).not.toContain("This plant cannot sell its output");
    expect(warning.textContent).not.toContain("oversupplied");
  });

  it("keeps the whole-plant wording when every product is weak", () => {
    render(
      <StrandedPlantBanner
        warning={estimate(0.2)}
        isCeo={false}
        outputs={[
          { label: "Electronics & Semiconductors", soldFraction: 0.3 },
          { label: "Software & IT Services", soldFraction: 0.1 },
        ]}
      />
    );
    expect(screen.getByRole("status").textContent).toContain("This plant cannot sell its output");
  });
});

describe("StrandedPlantBanner with output sent to own sites", () => {
  it("does not name a product that fed the company's own sites", () => {
    render(
      <StrandedPlantBanner
        warning={estimate(0.3)}
        isCeo
        outputs={[
          {
            label: "Energy",
            soldFraction: 0,
            settledSales: { offered: 860, ownSites: 860 },
          },
          { label: "Steel & Metals", soldFraction: 1 },
        ]}
      />
    );
    expect(screen.getByRole("status").textContent).not.toContain("Energy is not selling");
  });
});

describe("StrandedPlantBanner on a plant with a funded sale record", () => {
  const settled = (takenShare: number, turnsInRow: number | null = null) =>
    ({ basis: "settlement", takenShare, turnsInRow }) as const;

  it("states the latest settled turn and claims no streak it cannot know", () => {
    render(<StrandedPlantBanner warning={settled(0.3)} isCeo={false} />);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("This plant is not selling most of its output");
    expect(text).toContain("took 30% of what this plant offered");
    expect(text).not.toContain("turns in a row");
    expect(text).not.toContain("oversupplied");
    expect(text).not.toContain("market estimate");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("states the settled streak once one is recorded", () => {
    render(<StrandedPlantBanner warning={settled(0.1, 9)} isCeo />);
    expect(screen.getByRole("status").textContent).toContain(
      "sold less than half for 9 turns in a row"
    );
  });

  it("never names the legacy delivery limit for a settled plant", () => {
    render(
      <StrandedPlantBanner
        warning={settled(0.3)}
        deliveryLimitedFraction={0.4}
        deliveryLimitedFreightClass="bulk"
        isCeo
      />
    );
    expect(screen.getByRole("status").textContent).not.toContain("cannot deliver");
  });
});

describe("StrandedPlantBanner with only the market estimate", () => {
  it("labels the legacy streak as the market estimate", () => {
    render(<StrandedPlantBanner warning={estimate(0.37)} isCeo={false} />);
    expect(screen.getByRole("status").textContent).toContain(
      `By the market estimate, for ${STRANDED_WARN_TURNS} turns in a row`
    );
  });
});
