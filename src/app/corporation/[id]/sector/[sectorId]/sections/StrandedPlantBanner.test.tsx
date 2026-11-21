// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { describe, expect, it } from "vitest";
import { render as renderView, screen } from "@testing-library/react";
import { STRANDED_WARN_TURNS } from "@/lib/corporations/strandedPlant";
import StrandedPlantBanner from "./StrandedPlantBanner";

describe("StrandedPlantBanner", () => {
  it("stays hidden until the warning threshold", () => {
    const { container } = render(
      <StrandedPlantBanner lowFillTurns={STRANDED_WARN_TURNS - 1} soldFraction={0.4} isCeo />
    );

    expect(container.textContent).toBe("");
  });

  it("reports current sales without claiming inventory was destroyed", () => {
    render(
      <StrandedPlantBanner lowFillTurns={STRANDED_WARN_TURNS} soldFraction={0.37} isCeo={false} />
    );

    const warning = screen.getByRole("status", { name: "Stranded plant warning" });
    expect(warning.textContent).toContain(`For ${STRANDED_WARN_TURNS} turns`);
    expect(warning.textContent).toContain("last turn: 37%");
    expect(warning.textContent).toContain("earns no revenue this turn");
    expect(warning.textContent).not.toContain("money spent making it is lost");
    expect(warning.textContent).not.toContain("Options:");
  });

  it("shows the CEO every relevant response", () => {
    render(<StrandedPlantBanner lowFillTurns={STRANDED_WARN_TURNS} soldFraction={0.2} isCeo />);

    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("stockpile storable goods");
    expect(warning.textContent).toContain("park surplus capacity");
    expect(warning.textContent).toContain("change to a strategy");
    expect(warning.textContent).toContain("sell the sector");
  });

  it("names special freight and explains its shared capacity cost", () => {
    render(
      <StrandedPlantBanner
        lowFillTurns={STRANDED_WARN_TURNS}
        soldFraction={0.4}
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
        lowFillTurns={STRANDED_WARN_TURNS}
        soldFraction={0.45}
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
        lowFillTurns={STRANDED_WARN_TURNS}
        soldFraction={0.2}
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
