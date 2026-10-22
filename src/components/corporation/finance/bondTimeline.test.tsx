/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BondMaturityTimeline } from "./BondMaturityTimeline";
import type { BondData } from "../CorporationPageTypes";

const bond = (id: string, maturityTurn: number, over: Partial<BondData> = {}): BondData => ({
  _id: id,
  faceValue: 1000,
  couponRate: 4,
  maturityTurns: 96,
  issuedAtTurn: 0,
  maturityTurn,
  marketPrice: 1,
  totalIssued: 100_000,
  totalIssuedAnchor: 100_000,
  publicFloat: 10,
  defaulted: false,
  matured: false,
  turnsRemaining: maturityTurn - 500,
  holders: 2,
  ...over,
});

const toDisplay = (b: BondData) => ({
  value: b.totalIssuedAnchor ?? 0,
  display: `$${Math.round((b.totalIssuedAnchor ?? 0) / 1000)}K`,
});

const bars = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-bond-bar]"));

describe("BondMaturityTimeline", () => {
  it("one bar per outstanding bond", () => {
    const { container } = render(
      <BondMaturityTimeline
        bonds={[bond("a", 560), bond("b", 600), bond("c", 700)]}
        currentTurn={500}
        toDisplay={toDisplay}
      />
    );
    expect(bars(container)).toHaveLength(3);
  });

  it("due soon bond uses the warning tone", () => {
    const { container } = render(
      <BondMaturityTimeline
        bonds={[bond("soon", 530), bond("later", 700)]}
        currentTurn={500}
        toDisplay={toDisplay}
      />
    );
    const [soon, later] = bars(container);
    expect(soon.className).toContain("bg-warning");
    expect(later.className).not.toContain("bg-warning");
  });

  it("matured bonds are excluded", () => {
    const { container } = render(
      <BondMaturityTimeline
        bonds={[bond("a", 600), bond("old", 400, { matured: true, turnsRemaining: 0 })]}
        currentTurn={500}
        toDisplay={toDisplay}
      />
    );
    expect(bars(container)).toHaveLength(1);
  });

  it("nothing without bonds", () => {
    const { container } = render(
      <BondMaturityTimeline
        bonds={[bond("old", 400, { matured: true, turnsRemaining: 0 })]}
        currentTurn={500}
        toDisplay={toDisplay}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("sizes bars by value and places them by maturity turn", () => {
    const { container } = render(
      <BondMaturityTimeline
        bonds={[
          bond("small", 600, { totalIssuedAnchor: 50_000 }),
          bond("big", 700, { totalIssuedAnchor: 200_000 }),
        ]}
        currentTurn={500}
        toDisplay={toDisplay}
      />
    );
    const [small, big] = bars(container);
    expect(big.style.height).toBe("100%");
    expect(small.style.height).toBe("25%");
    expect(small.parentElement!.style.left).toBe("50%");
    expect(big.parentElement!.style.left).toBe("100%");
  });
});
