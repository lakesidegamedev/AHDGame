/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildGrowthLevers, GrowthLeversPanel } from "./GrowthLeversPanel";
import type { SectorDetail } from "./CorporationPageTypes";

function sector(over: Partial<SectorDetail>): SectorDetail {
  return {
    _id: Math.random().toString(16).slice(2),
    stateId: "FL",
    stateName: "Florida",
    sectorType: "media",
    sectorLabel: "Media",
    capacityUnits: 1_000,
    fillRate: 1,
    deliveryLimitedFraction: 0,
    mothballed: false,
    ...over,
  } as SectorDetail;
}

describe("buildGrowthLevers", () => {
  it("sorts running sectors into build, freight and do-not-build groups", () => {
    const levers = buildGrowthLevers([
      sector({ _id: "sold", fillRate: 1, capacityUnits: 5_000 }),
      sector({ _id: "glut", fillRate: 0.6 }),
      sector({ _id: "stuck", fillRate: 0.7, deliveryLimitedFraction: 0.2 }),
      sector({ _id: "cold", fillRate: 1, mothballed: true }),
      sector({ _id: "ok", fillRate: 0.9 }),
    ]);
    expect(levers.soldOut.map((s) => s.id)).toEqual(["sold"]);
    expect(levers.deliveryLimited).toEqual([expect.objectContaining({ id: "stuck", value: 20 })]);
    expect(levers.oversupplied.map((s) => s.id)).toEqual(["glut"]);
  });

  it("keeps the three largest sectors per group", () => {
    const levers = buildGrowthLevers(
      [1, 2, 3, 4].map((n) => sector({ _id: `s${n}`, capacityUnits: n * 100 }))
    );
    expect(levers.soldOut.map((s) => s.id)).toEqual(["s4", "s3", "s2"]);
  });
});

describe("GrowthLeversPanel", () => {
  it("links sold-out sectors to the build page and opens the Tech tab", () => {
    const onTabChange = vi.fn();
    render(
      <GrowthLeversPanel
        sectors={[sector({ _id: "abc", fillRate: 1 })]}
        corpId="7"
        onTabChange={onTabChange}
      />
    );
    expect(screen.getByRole("link", { name: "Florida Media" }).getAttribute("href")).toBe(
      "/corporation/7/sector/abc?build=1"
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Tech" }));
    expect(onTabChange).toHaveBeenCalledWith("tech");
  });
});
