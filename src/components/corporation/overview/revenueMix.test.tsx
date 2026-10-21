/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RevenueMixStrip } from "./RevenueMixStrip";
import { sectorTypeTones } from "../ledger/sectorTypeTone";
import type { SectorDetail } from "../CorporationPageTypes";

const sector = (id: string, stateId: string, type: string, revenue: number | undefined) =>
  ({
    _id: id,
    stateId,
    stateName: stateId === "PA" ? "Pennsylvania" : stateId,
    sectorType: type,
    sectorLabel: type === "steel" ? "Steel" : "Iron Ore",
    revenue,
  }) as unknown as SectorDetail;

describe("sectorTypeTones", () => {
  it("gives the primary type the first colour and keeps one colour per type", () => {
    const tones = sectorTypeTones(["iron_ore", "steel", "iron_ore"], "steel");
    expect(tones.steel).toBe("info");
    expect(tones.iron_ore).toBe("gold");
  });
});

describe("RevenueMixStrip", () => {
  const sectors = [sector("a", "PA", "steel", 75), sector("b", "MN", "iron_ore", 25)];

  it("strip widths follow sector revenue", () => {
    const { container } = render(
      <RevenueMixStrip sectors={sectors} tones={sectorTypeTones(["steel", "iron_ore"], "steel")} />
    );
    const widths = [...container.querySelectorAll<HTMLElement>("[data-segment]")].map(
      (el) => el.style.width
    );
    expect(widths).toEqual(["75%", "25%"]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Revenue by region: Pennsylvania Steel 75%, MN Iron Ore 25%"
    );
  });

  it("same type keeps its colour", () => {
    const tones = sectorTypeTones(["steel", "iron_ore"], "steel");
    const { container } = render(
      <RevenueMixStrip
        sectors={[
          sector("a", "PA", "steel", 50),
          sector("c", "OH", "steel", 30),
          sector("b", "MN", "iron_ore", 20),
        ]}
        tones={tones}
      />
    );
    const segments = [...container.querySelectorAll<HTMLElement>("[data-segment]")];
    expect(segments[0].className).toContain("bg-info");
    expect(segments[1].className).toContain("bg-info");
    expect(segments[2].className).toContain("bg-gold");
  });

  it("no strip when no sector has revenue", () => {
    const { container } = render(
      <RevenueMixStrip
        sectors={[sector("a", "PA", "steel", undefined), sector("b", "MN", "iron_ore", 0)]}
        tones={{}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
