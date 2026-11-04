// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render as rtlRender } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../../../../../../messages/en/corporations.json";
import RunMeter from "./RunMeter";

const render = (ui: ReactElement) =>
  rtlRender(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );

afterEach(cleanup);

/**
 * The run meter and its legend share one fill per cause. Two causes that both
 * warn the player used to resolve to the warning tone, so the bar showed one
 * colour for two different problems and the legend dots could not be matched
 * to their segments.
 */
describe("run meter idle causes", () => {
  it("caps internal deliveries at production left after sales", () => {
    const { container } = render(
      <RunMeter
        capacityUnits={100}
        producedUnits={80}
        soldUnits={30}
        ownSiteUnits={60}
        idleCauses={[{ cause: "inputs", units: 20 }]}
        sectorType="manufacturing"
      />
    );
    expect(container.textContent).not.toContain("Made, not sold");
    const rows = Array.from(container.querySelectorAll("li"));
    expect(
      rows.find((row) => row.textContent?.includes("Sent to your sites"))?.textContent
    ).toContain("50 50%");
    const bar = container.querySelector('[role="img"]');
    expect(Array.from(bar?.children ?? []).map((el) => (el as HTMLElement).style.width)).toEqual([
      "30%",
      "50%",
      "20%",
    ]);
  });

  it("draws a different colour for each idle cause and reuses it for that cause's legend dot", () => {
    const { container } = render(
      <RunMeter
        capacityUnits={1000}
        producedUnits={400}
        soldUnits={400}
        idleCauses={[
          { cause: "inputs", units: 300 },
          { cause: "demand", units: 200 },
          { cause: "staffing", units: 100 },
        ]}
        sectorType="manufacturing"
      />
    );

    const bar = container.querySelector('[role="img"]');
    expect(bar).toBeTruthy();

    // Segments are rendered in order: sold, unsold (zero, filtered), then the
    // three idle causes.
    const segments = Array.from((bar as HTMLElement).children).map((el) =>
      Array.from(el.classList).find((c) => c.startsWith("bg-"))
    );

    expect(segments.filter(Boolean)).toHaveLength(4);
    expect(new Set(segments).size).toBe(segments.length);

    // Every legend dot paints the same class as its bar segment.
    const dots = Array.from(container.querySelectorAll("li span.rounded-full")).map((el) =>
      Array.from(el.classList).find((c) => c.startsWith("bg-"))
    );
    expect(dots).toEqual(segments);
    expect(new Set(dots).size).toBe(dots.length);
  });

  it("names what holds a sold-out run instead of calling it ramping (ticket 1765)", () => {
    const meter = (heldInput?: string) =>
      render(
        <RunMeter
          capacityUnits={100}
          producedUnits={40}
          soldUnits={40}
          idleCauses={[{ cause: "held", units: 60, ...(heldInput ? { heldInput } : {}) }]}
          sectorType="extraction"
        />
      ).container.textContent;
    expect(meter("Iron Ore")).toContain("Held by Iron Ore");
    expect(meter("Iron Ore")).not.toContain("Ramping up");
    cleanup();
    expect(meter()).toContain("Held by cash");
  });
});
