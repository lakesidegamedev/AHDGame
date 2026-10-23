// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import RunMeter from "./RunMeter";

afterEach(cleanup);

/**
 * The run meter and its legend share one fill per cause. Two causes that both
 * warn the player used to resolve to the warning tone, so the bar showed one
 * colour for two different problems and the legend dots could not be matched
 * to their segments.
 */
describe("run meter idle causes", () => {
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
});
