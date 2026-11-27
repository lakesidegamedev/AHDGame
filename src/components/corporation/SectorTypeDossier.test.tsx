/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SectorTypeDossier } from "./SectorTypeDossier";
import { siteStatement } from "@/lib/corporations/rules/siteStatement";
import type { SectorDetail } from "./CorporationPageTypes";
afterEach(cleanup);
function show(sectors: SectorDetail[]) {
  render(
    <SectorTypeDossier
      sectorType="agriculture"
      sectors={sectors}
      allSectors={sectors}
      timeScale="turn"
      scaleFactor={1}
      fmtMoney={(value) => `money:${value}`}
      metricContext={{
        plantsMode: true,
        totalSectors: sectors.length,
        logisticsStrength: 0,
        hasSecondaryType: false,
      }}
    />
  );
}
it("consolidates internal transfers on the same basis as the table total", () => {
  show([
    {
      revenue: 100,
      profit: 60,
      stateId: "ON",
      siteStatement: siteStatement({ revenue: 100, totalCost: 40, income: 50 }),
    },
    {
      revenue: 0,
      profit: -50,
      stateId: "QC",
      siteStatement: siteStatement({ revenue: 0, totalCost: 0, charge: 50 }),
    },
  ] as SectorDetail[]);
  expect(screen.getByText("money:100")).toBeTruthy();
  expect(screen.getByText("money:60")).toBeTruthy();
  expect(screen.getByText("60.0% blended margin")).toBeTruthy();
});
it("keeps redacted profit unavailable and a zero-revenue margin undefined", () => {
  const view = render(
    <SectorTypeDossier
      sectorType="agriculture"
      sectors={[{ stateId: "ON" } as SectorDetail]}
      allSectors={[]}
      timeScale="turn"
      scaleFactor={1}
      fmtMoney={(value) => `money:${value}`}
      metricContext={{
        plantsMode: true,
        totalSectors: 1,
        logisticsStrength: 0,
        hasSecondaryType: false,
      }}
    />
  );
  expect(screen.getAllByText("n/a").length).toBeGreaterThanOrEqual(2);
  view.unmount();
  show([{ revenue: 0, profit: 0, stateId: "ON" }] as SectorDetail[]);
  expect(screen.getByText("Margin unavailable")).toBeTruthy();
});
