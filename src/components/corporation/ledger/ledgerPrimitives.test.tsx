/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TickMeter } from "./TickMeter";
import { ProportionBar } from "./ProportionBar";
import { StackBar } from "./StackBar";
import { RingChart } from "./RingChart";
import { RatingScale } from "./RatingScale";
import { CompareBars } from "./CompareBars";
import { FiguresGrid } from "./FiguresGrid";
import { LedgerTicket } from "./LedgerTicket";
import { CollapsibleSection } from "./CollapsibleSection";
import type { LedgerSegment } from "./seriesColours";

const seg = (key: string, value: number, extra: Partial<LedgerSegment> = {}): LedgerSegment => ({
  key,
  label: key,
  value,
  display: String(value),
  tone: "info",
  ...extra,
});

describe("TickMeter", () => {
  it("clamps", () => {
    const high = render(<TickMeter pct={150} />);
    expect(high.container.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("100%");
    high.unmount();
    const low = render(<TickMeter pct={-5} />);
    expect(low.container.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("0%");
  });

  it("is an image only when labelled", () => {
    const { container, rerender } = render(<TickMeter pct={40} />);
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
    rerender(<TickMeter pct={40} label="Quality 40 of 100" />);
    expect(screen.getByRole("img", { name: "Quality 40 of 100" })).toBeTruthy();
  });
});

describe("ProportionBar", () => {
  it("clamps and stays decorative", () => {
    const { container } = render(<ProportionBar pct={250} />);
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("100%");
  });
});

describe("StackBar", () => {
  it("sizes by value and skips an empty total", () => {
    const { container } = render(
      <StackBar
        label="Where revenue goes"
        segments={[seg("costs", 87), seg("tax", 4), seg("div", 3), seg("kept", 6)]}
      />
    );
    const widths = [...container.querySelectorAll<HTMLElement>("[data-segment]")].map(
      (el) => el.style.width
    );
    expect(widths).toEqual(["87%", "4%", "3%", "6%"]);

    const empty = render(<StackBar label="none" segments={[seg("a", 0), seg("b", 0)]} />);
    expect(empty.container.firstChild).toBeNull();
  });
});

describe("RingChart", () => {
  const segments = [seg("Book value", 910.4), seg("Bond debt", 310, { tone: "error" })];

  it("dash arrays sum to the circle and legend shows percents", () => {
    const { container } = render(
      <RingChart
        segments={segments}
        centreLabel="Book value"
        centreValue="$910.4M"
        label="Claims"
      />
    );
    expect(screen.getByText("74.6%")).toBeTruthy();
    expect(screen.getByText("25.4%")).toBeTruthy();
    const arcs = [...container.querySelectorAll("circle[data-arc]")];
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      const [a, b] = arc.getAttribute("stroke-dasharray")!.split(" ").map(Number);
      expect(a + b).toBeCloseTo(100, 5);
    }
  });

  it("legend names truncate", () => {
    render(<RingChart segments={segments} centreLabel="" centreValue="" label="Claims" />);
    expect(
      screen
        .getByText("Book value", { selector: "[data-legend-name] *, [data-legend-name]" })
        .closest("[data-legend-name]")!.className
    ).toContain("truncate");
  });

  it("uses a data colour instead of the tone when given", () => {
    const { container } = render(
      <RingChart
        segments={[seg("Brand", 1, { color: "var(--test-brand)" })]}
        centreLabel=""
        centreValue=""
        label="Owners"
      />
    );
    const arc = container.querySelector<SVGElement>("circle[data-arc]")!;
    expect(arc.style.stroke).toBe("var(--test-brand)");
  });

  it("renders nothing without a positive total", () => {
    const { container } = render(
      <RingChart segments={[seg("a", 0)]} centreLabel="" centreValue="" label="none" />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("RatingScale", () => {
  it("marks the tier of the rating", () => {
    const { container } = render(<RatingScale rating="AA" />);
    expect(container.querySelector('[data-tier="AA"]')!.getAttribute("data-active")).toBe("true");
    expect(container.querySelector('[data-tier="A"]')!.getAttribute("data-active")).toBe("false");
  });

  it("maps a signed grade to its letter tier", () => {
    const { container } = render(<RatingScale rating="A-" />);
    expect(container.querySelector('[data-tier="A"]')!.getAttribute("data-active")).toBe("true");
  });

  it("renders nothing for an unknown rating", () => {
    const { container } = render(<RatingScale rating="??" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("CompareBars", () => {
  it("scales to the larger value", () => {
    const { container } = render(
      <CompareBars
        label="Market vs book"
        rows={[
          { key: "m", label: "Market", value: 1270, display: "$1.27B", tone: "foreground" },
          { key: "b", label: "Book", value: 910, display: "$910M", tone: "muted" },
        ]}
      />
    );
    const widths = [...container.querySelectorAll<HTMLElement>("[data-fill]")].map(
      (el) => el.style.width
    );
    expect(widths).toEqual(["100%", "71.7%"]);
  });

  it("renders nothing when no value is positive", () => {
    const { container } = render(
      <CompareBars
        label="none"
        rows={[{ key: "m", label: "Market", value: 0, display: "$0", tone: "foreground" }]}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("FiguresGrid", () => {
  it("renders every cell with label and value", () => {
    render(
      <FiguresGrid
        columns={{ base: 2, md: 4 }}
        cells={[
          { key: "cap", label: "Mkt cap", value: "$1.27B" },
          { key: "growth", label: "Revenue growth", value: "+3.2%", lead: true },
        ]}
      />
    );
    expect(screen.getByText("Mkt cap")).toBeTruthy();
    expect(screen.getByText("+3.2%")).toBeTruthy();
  });
});

describe("LedgerTicket", () => {
  it("shows its title, action and body", () => {
    render(
      <LedgerTicket title="Your position" action={<button type="button">Trade</button>}>
        <p>body</p>
      </LedgerTicket>
    );
    expect(screen.getByRole("heading", { name: "Your position" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trade" })).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });
});

describe("CollapsibleSection", () => {
  it("toggles its body", () => {
    render(
      <CollapsibleSection title="Ownership" summary="36 holders">
        <p>ring</p>
      </CollapsibleSection>
    );
    const button = screen.getByRole("button", { name: /Ownership/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const body = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(body.className).toMatch(/(^| )hidden( |$)/);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(body.className).not.toMatch(/(^| )hidden( |$)/);
  });
});

describe("RatingScale tone", () => {
  it("colours the marked tier by its grade, not always as good", () => {
    const strong = render(<RatingScale rating="AAA" />);
    expect(strong.container.querySelector('[data-tier="AAA"] [data-bar]')!.className).toContain(
      "bg-success"
    );
    strong.unmount();
    const weak = render(<RatingScale rating="CCC" />);
    expect(weak.container.querySelector('[data-tier="CCC"] [data-bar]')!.className).toContain(
      "bg-error"
    );
  });
});
