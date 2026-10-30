/**
 * @vitest-environment happy-dom
 */
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { describe, expect, it, vi } from "vitest";
import { render as renderView, screen } from "@testing-library/react";
import PlantPanel from "./PlantPanel";
import type { PlantsData } from "../types";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (amount: number) => `${amount}` }),
}));

const plants = {
  capacityUnits: 2_000,
  producedUnits: 1_500,
  soldUnits: 1_400,
  unsoldUnits: 100,
  idleUnits: 500,
  fillRate: 1_400 / 1_500,
  idleCauses: [],
  mothballed: false,
  buildQueue: [],
  constructionInProgressAnchor: 0,
  depreciationPerTurn: 0.001,
  buildTurns: 72,
  workers: 1_867,
  workersDesired: 3_734,
  labourStaffingFactor: 0.5,
  unionizationPct: 31,
  laborIntensity: 0.93,
  governor: { active: false, startTurn: 1, rampTurns: 48, turnsRemaining: 0, cap: 0.15 },
  headroomUnits: 250,
  currentTurn: 100,
} as unknown as PlantsData;

function noop() {}

describe("PlantPanel facility sizing", () => {
  it("sizes a vehicle production sector at one unit per plant, not the generic manufacturing size", () => {
    const vehiclePlants = {
      ...plants,
      capacityUnits: 250,
      plantCount: undefined,
      buildQueue: [
        {
          orderIndex: 0,
          startTurn: 100,
          onlineTurn: 140,
          turnsRemaining: 40,
          smooth: true,
          unitsOrdered: 40,
          unitsDelivered: 0,
          costPaidAnchor: 1_000_000,
          progress: 0,
        },
      ],
    } as unknown as PlantsData;

    render(
      <PlantPanel
        plants={vehiclePlants}
        sectorType="manufacturing"
        industryModel="vehicles"
        averageWageLevel={1}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    // 40 units ordered is 40 assembly plants, not floor(40 / 25) = 1.
    expect(screen.getByText("0 of 40 plants built")).toBeTruthy();
    expect(screen.queryByText(/0 of 1 plant built/)).toBeNull();
  });
});

describe("PlantPanel workforce", () => {
  it("shows the sector's one-hop freight estimate at installed capacity", () => {
    render(
      <PlantPanel
        plants={plants}
        marketSupplies={[
          {
            commodity: "coal",
            label: "Coal",
            icon: "CO",
            colors: "",
            unit: "units",
            units: 1_500,
            rate: 1,
            basePrice: 1,
            globalPrice: 1,
            nationalPrice: 1,
            regionalPrice: 1,
            marketPrice: 1,
            weight: 100,
            priceImpact: 0,
          },
        ]}
        sectorType="extraction"
        averageWageLevel={1}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(
      screen.getByText(
        /at full capacity and shipped all output one state away, it would need about 80 TEU per day/
      )
    ).toBeTruthy();
    expect(screen.getByText(/Local sales use no freight; longer routes use more/)).toBeTruthy();
  });

  it("links the covering union with its emblem and shows the average wage level", () => {
    const { container } = render(
      <PlantPanel
        plants={plants}
        sectorType="manufacturing"
        unionId="union-1"
        unionName="United Steelworkers"
        averageWageLevel={1.15}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(screen.getByText("1,867")).toBeTruthy();
    expect(screen.getByText("31% in a union")).toBeTruthy();
    expect(screen.getByText("Avg wage level 1.15×")).toBeTruthy();
    expect(screen.getByText(/1,867 of 3,734 jobs filled/)).toBeTruthy();
    expect(screen.getByText(/Higher pay can win a larger share/)).toBeTruthy();

    const unionLink = screen.getByRole("link", { name: "United Steelworkers" });
    expect(unionLink.getAttribute("href")).toBe("/unions/union-1");
    expect(
      [...container.querySelectorAll("img")].some((image) =>
        (image.getAttribute("src") ?? "").includes("United_Steelworkers")
      )
    ).toBe(true);
  });

  it("shows the state labour pool against every employer's wanted workers", () => {
    render(
      <PlantPanel
        plants={plants}
        sectorType="manufacturing"
        averageWageLevel={1.5}
        stateName="Ohio"
        stateLabourMarket={{
          labourForce: 1_000_000,
          labourDemand: 2_000_000,
          corporateEmployed: null,
          tightness: 2,
          stateWageIndex: 1.2,
          sectorRelativeBid: 1.25,
          targetStaffingFactor: 0.625,
        }}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(screen.getByText("Workers available in Ohio")).toBeTruthy();
    expect(screen.getByText("1,000,000")).toBeTruthy();
    expect(screen.getByText("Workers all employers in Ohio want")).toBeTruthy();
    expect(screen.getByText("2,000,000")).toBeTruthy();
    expect(screen.getByText("Your pay vs the Ohio average")).toBeTruthy();
    expect(screen.getByText("1.25×")).toBeTruthy();
    expect(
      screen.getByText(
        /Raising pay only wins you a bigger share compared with other employers here; it does not add workers\./
      )
    ).toBeTruthy();
    expect(screen.getByText(/At this pay you can fill about 63% of your jobs/)).toBeTruthy();
    expect(screen.queryByText(/Higher pay can win a larger share/)).toBeNull();
  });

  it("says the pool is large enough when only this sector's staffing is catching up", () => {
    render(
      <PlantPanel
        plants={plants}
        sectorType="manufacturing"
        averageWageLevel={1}
        stateName="Ohio"
        stateLabourMarket={{
          labourForce: 1_000_000,
          labourDemand: 400_000,
          corporateEmployed: null,
          tightness: 0.4,
          stateWageIndex: null,
          sectorRelativeBid: null,
          targetStaffingFactor: 1,
        }}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(
      screen.getByText(/There are enough workers in this state for every employer/)
    ).toBeTruthy();
    expect(screen.queryByText(/Your pay vs/)).toBeNull();
  });

  it("separates a media sector's audience run from contractable ledger output", () => {
    render(
      <PlantPanel
        plants={plants}
        marketSupplies={[
          {
            commodity: "advertising",
            label: "Advertising",
            icon: "AD",
            colors: "",
            unit: "impressions",
            units: 140,
            rate: 1,
            basePrice: 1,
            globalPrice: 1,
            nationalPrice: 1,
            regionalPrice: 1,
            marketPrice: 1,
            weight: 100,
            priceImpact: 0,
          },
        ]}
        sectorType="media"
        mediaAdvertisingCampaignFactor={0.1}
        averageWageLevel={1}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(
      screen.getByText(/Commodity ledger output: Advertising 140 impressions\/day/)
    ).toBeTruthy();
    expect(screen.getByText(/advertising market may apply further limits/)).toBeTruthy();
    expect(
      screen.getByText("Advertising campaigns counted: 140/day (10% media output factor)")
    ).toBeTruthy();
  });

  it("shows the planned economy campaign factor and keeps zero output visible", () => {
    render(
      <PlantPanel
        plants={{ ...plants, producedUnits: 0 }}
        marketSupplies={[
          {
            commodity: "advertising",
            label: "Advertising",
            icon: "AD",
            colors: "",
            unit: "impressions",
            units: 0,
            rate: 1,
            basePrice: 1,
            globalPrice: 1,
            nationalPrice: 1,
            regionalPrice: 1,
            marketPrice: 1,
            weight: 100,
            priceImpact: 0,
          },
        ]}
        sectorType="media"
        mediaAdvertisingCampaignFactor={0.25}
        averageWageLevel={1}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(
      screen.getByText("Advertising campaigns counted: 0/day (25% media output factor)")
    ).toBeTruthy();
  });

  it("does not describe entertainment media as advertising campaigns", () => {
    render(
      <PlantPanel
        plants={plants}
        marketSupplies={[
          {
            commodity: "software",
            label: "Software",
            icon: "SW",
            colors: "",
            unit: "licenses",
            units: 50,
            rate: 1,
            basePrice: 1,
            globalPrice: 1,
            nationalPrice: 1,
            regionalPrice: 1,
            marketPrice: 1,
            weight: 100,
            priceImpact: 0,
          },
        ]}
        sectorType="media"
        mediaDiscriminator="entertainment"
        mediaAdvertisingCampaignFactor={0.1}
        averageWageLevel={1}
        isCeo={false}
        busy={false}
        message=""
        onOpenBuild={noop}
        onCancelOrder={noop}
        onMothball={noop}
        onReactivate={noop}
      />
    );

    expect(screen.queryByText(/Advertising campaigns counted/)).toBeNull();
    expect(
      screen.getByText(/Entertainment output is shown in its own commodity ledger/)
    ).toBeTruthy();
  });
});

function render(ui: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
