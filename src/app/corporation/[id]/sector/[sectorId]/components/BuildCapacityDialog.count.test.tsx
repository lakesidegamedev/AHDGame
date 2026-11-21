/**
 * @vitest-environment happy-dom
 */
import type { ComponentProps, ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { cleanup, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BuildCapacityDialog from "./BuildCapacityDialog";
import type { PlantsData } from "../types";
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import type { CorporationType } from "@/lib/constants/corporations";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`,
  }),
}));

/** Only the fields the dialog actually reads; the rest never render. */
const plants = {
  capacityUnits: 1_000,
  fillRate: 1,
  mothballed: false,
  buildTurns: 3,
  laborIntensity: 2,
  demandGapUnits: 10_000_000,
  measuredDemandGapUnits: 10_000_000,
  workers: 10,
  workersDesired: 10,
  producedUnits: 1_000,
  soldUnits: 1_000,
  activeCapacityPercent: 100,
  depreciationPerTurn: 0,
  investment: { overheadDailyAnchor: 0, taxRatePercent: 0, operatingReserveAnchor: 10 },
  pnl: {
    profitPerUnitAnchor: 5,
    revenueAnchor: 10_000,
    inputsAnchor: 0,
    labourAnchor: 0,
    complianceAnchor: 0,
    otherOperatingAnchor: 0,
    growthAndBuildAnchor: 0,
    upkeepAnchor: 0,
  },
  buildQuote: {
    unitPriceAnchor: 1,
    dominanceMultiplier: 1,
    rateMultiplier: 1,
    acumenMultiplier: 1,
    techMultiplier: 1,
    hostPriceMultiplier: 1,
    perUnitAnchor: 1,
    fxSpreadRate: 0,
    perUnitChargedAnchor: 1,
    corpCapitalAnchor: 1_000_000_000,
    maxAffordableUnits: 1_000_000_000,
  },
} as unknown as PlantsData;

function renderDialog(
  onSubmit = vi.fn(),
  plantData = plants,
  sectorType: CorporationType = "manufacturing",
  strategy?: ComponentProps<typeof BuildCapacityDialog>["strategy"],
  strategySiteActions?: ComponentProps<typeof BuildCapacityDialog>["strategySiteActions"]
) {
  render(
    <BuildCapacityDialog
      open
      onClose={vi.fn()}
      plants={plantData}
      sectorType={sectorType}
      sectorLabel="Manufacturing"
      strategy={strategy}
      strategySiteActions={strategySiteActions}
      submitting={false}
      errorMessage=""
      onSubmit={onSubmit}
    />
  );
  return { input: screen.getByRole("textbox") as HTMLInputElement, onSubmit };
}

const NO_MODS = { shiftKey: false, ctrlKey: false, metaKey: false };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("does not call a mixed funded shortage oversupply when conservative sizing is zero", () => {
  renderDialog(vi.fn(), {
    ...plants,
    measuredDemandGapUnits: 0,
    buildDemandTurn: 778,
    buildDemand: [
      {
        commodity: "network_services",
        scope: "regional",
        funded: 0,
        delivered: 0,
        unmet: 0,
        capacityUnits: 0,
      },
      {
        commodity: "network_services",
        scope: "national",
        funded: 100,
        delivered: 0,
        unmet: 100,
        capacityUnits: 100,
      },
      {
        commodity: "software",
        scope: "national",
        funded: 3,
        delivered: 3,
        unmet: 0,
        capacityUnits: 0,
      },
    ],
  });
  expect(screen.getAllByText(/Network Services/)).toHaveLength(2);
  expect(screen.getByTestId("build-room").textContent).toContain(
    "Sales limited by Software & IT Services"
  );
  expect(screen.queryByText(/oversupplied/)).toBeNull();
});

it("keeps the default view to the headline figures and one details disclosure", () => {
  renderDialog();
  expect(screen.getByText("Build total")).toBeTruthy();
  expect(screen.getByText("First income")).toBeTruthy();
  expect(screen.getByText("Profit per turn")).toBeTruthy();
  expect(screen.getByText("Payback")).toBeTruthy();
  expect(screen.getByTestId("build-room").textContent).toContain("recommended");
  expect(document.querySelectorAll("details")).toHaveLength(1);
  expect(screen.queryByText(/Demand today is not guaranteed/)).toBeNull();
});

it("reveals recommendations for available strategies on request", () => {
  renderDialog(
    vi.fn(),
    {
      ...plants,
      measuredDemandGapUnits: 0,
      strategyBuildRoom: { standard: 0, hardware: 4, software: null, quantum: 10 },
    },
    "technology",
    {
      currentStrategyId: "standard",
      currentStrategyName: "Standard",
      availableStrategies: [
        { id: "standard", name: "Standard", description: "" },
        { id: "hardware", name: "Hardware Focus", description: "" },
        { id: "software", name: "Software Focus", description: "" },
        { id: "quantum", name: "Quantum Computing", description: "", locked: true },
      ],
    }
  );
  expect(screen.getByTestId("build-room").textContent).toContain(
    "Standard · 0 campuses recommended"
  );
  expect(screen.queryByText("Hardware Focus")).toBeNull();
  const compare = screen.getByRole("button", { name: "Compare strategies" });
  fireEvent.click(compare);
  expect(compare.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Hardware Focus").parentElement?.textContent).toContain(
    "4 campuses recommended"
  );
  expect(screen.getByText("Software Focus").parentElement?.textContent).toContain("n/a");
  expect(screen.queryByText("Quantum Computing")).toBeNull();
  fireEvent.click(compare);
  expect(screen.queryByText("Hardware Focus")).toBeNull();
});

it("quotes and submits an alternate strategy as a new site", async () => {
  const quote = vi.fn().mockResolvedValue({
    totalCostAnchor: 2000,
    buildTurns: 12,
    affordable: true,
  });
  const build = vi.fn().mockResolvedValue(true);
  const currentBuild = vi.fn();
  renderDialog(
    currentBuild,
    plants,
    "technology",
    {
      currentStrategyId: "standard",
      currentStrategyName: "Standard",
      availableStrategies: [
        { id: "standard", name: "Standard", description: "" },
        { id: "hardware", name: "Hardware Focus", description: "" },
      ],
    },
    { quote, build }
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare strategies" }));
  fireEvent.click(screen.getByRole("button", { name: "New site · Hardware Focus" }));
  fireEvent.click(screen.getByRole("button", { name: "Get quote" }));
  const submit = await screen.findByRole("button", { name: "Build new site" });
  fireEvent.click(submit);
  expect(quote).toHaveBeenCalledWith(
    plantSizeUnits("technology"),
    expect.objectContaining({ strategyId: "hardware" })
  );
  const newSite = quote.mock.calls[0][1];
  expect(build).toHaveBeenCalledWith(
    plantSizeUnits("technology"),
    { ...newSite, maximumCostAnchor: 2000 },
    false
  );
  expect(currentBuild).not.toHaveBeenCalled();
});

it("reports profit per turn and payback from the cash scenario", () => {
  renderDialog();
  const text = document.querySelector("dl")?.textContent ?? "";
  expect(text).toMatch(/Profit per turn\$[\d,]+/);
  expect(text).toMatch(/Payback\d+ turns/);
});

it("sizes funded building counts from the funded build room", () => {
  const size = plantSizeUnits("telecommunications");
  renderDialog(
    vi.fn(),
    {
      ...plants,
      measuredDemandGapUnits: size * 4,
      buildDemand: [
        {
          commodity: "network_services",
          scope: "national",
          funded: 100,
          delivered: 0,
          unmet: 100,
          capacityUnits: size * 4,
        },
      ],
    },
    "telecommunications"
  );
  expect(screen.getByText("Room for buyers of every product: 4 buildings")).toBeTruthy();
  expect(screen.queryByText(/share is fully claimed/i)).toBeNull();
  expect(
    screen.getByRole("region", { name: "Buyer demand" }).closest(".overscroll-contain")
  ).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
});

describe("BuildCapacityDialog plant size", () => {
  it("orders vehicle plants for a manufacturing sector on a vehicle strategy", () => {
    const { onSubmit } = renderDialog(vi.fn(), {
      ...plants,
      capacityUnits: 41.7,
      strategyId: "vehicle_assembly",
    } as PlantsData);
    // Owned count uses the same size as the ledger: 41 vehicle plants.
    expect(screen.getByText(/You run 41 plants here now/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Build 1 plant/ }));
    // One plant is one vehicle unit, exactly what the queue counts as one plant.
    expect(onSubmit).toHaveBeenCalledWith(1, undefined);
  });
});

describe("BuildCapacityDialog count control", () => {
  it("does not mount finance controls or query lenders without the gated payload", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderDialog();
    expect(screen.queryByLabelText(/Finance this build/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("matches measured buyer demand", () => {
    const units = plantSizeUnits("manufacturing");
    const { input } = renderDialog(vi.fn(), {
      ...plants,
      demandGapUnits: units * 3.9,
      measuredDemandGapUnits: units * 3.9,
    });
    fireEvent.click(screen.getByRole("button", { name: "Match demand: 3" }));
    expect(input.value).toBe("3");
    expect(screen.getByTestId("build-room").textContent).toContain("3 plants recommended");
    fireEvent.click(screen.getByLabelText(/build one more/i));
    expect(input.value).toBe("4");
    expect(screen.getByTestId("build-room").textContent).toContain("3 plants recommended");
  });

  it("disables shortcuts when cash or buyer room cannot fund one whole facility", () => {
    const units = plantSizeUnits("manufacturing");
    const { input } = renderDialog(vi.fn(), {
      ...plants,
      demandGapUnits: units / 2,
      measuredDemandGapUnits: units / 2,
      buildQuote: { ...plants.buildQuote, corpCapitalAnchor: 0, maxAffordableUnits: 0 },
    });
    const demand = screen.getByRole("button", { name: "Match demand" }) as HTMLButtonElement;
    expect(demand.disabled).toBe(true);
    fireEvent.click(demand);
    expect(input.value).toBe("1");
  });

  it("withholds automatic sizing without reliable operating history", () => {
    renderDialog(vi.fn(), { ...plants, investment: undefined });
    const demand = screen.getByRole("button", { name: "Match demand" }) as HTMLButtonElement;
    expect(demand.disabled).toBe(true);
    expect(screen.getByText(/Automatic sizing needs one full turn of results/)).toBeTruthy();
  });

  it("explains that outstanding debt withholds automatic sizing", () => {
    renderDialog(vi.fn(), {
      ...plants,
      investment: { ...plants.investment!, indebted: true },
    });
    expect(
      (screen.getByRole("button", { name: "Match demand" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/loans, bonds or unpaid bills/)).toBeTruthy();
  });

  it("does not offer Match demand for a build that fails the lower-price scenario", () => {
    renderDialog(vi.fn(), {
      ...plants,
      pnl: { ...plants.pnl, labourAnchor: 6000 },
    });
    expect(
      (screen.getByRole("button", { name: "Match demand" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/Expanding would not make money if sale prices fall/)).toBeTruthy();
  });

  it("does not scale an extraction plant without deposit headroom", () => {
    renderDialog(vi.fn(), plants, "extraction");
    expect(
      (screen.getByRole("button", { name: "Match demand" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      screen.getByText(/Automatic sizing can't check how much of the resource is left/)
    ).toBeTruthy();
  });

  it("keeps a funded build disabled until the loan pledge is reviewed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            enabled: true,
            currency: "USD",
            lenders: [{ id: "bank", name: "Lender", ratePercent: 5, approvalRequired: false }],
          }),
          { status: 200 }
        )
      )
    );
    const { onSubmit } = renderDialog(vi.fn(), {
      ...plants,
      buildQuote: {
        ...plants.buildQuote,
        financing: { corporationId: "corp", currency: "USD", localPerAnchor: 1 },
      },
    });
    const submit = screen.getByRole("button", { name: /^Build 1 / }) as HTMLButtonElement;
    fireEvent.click(screen.getByLabelText(/Finance this build/));
    await screen.findByRole("option", { name: /Lender/ });
    expect(submit.disabled).toBe(true);
    expect(
      screen.getByText("Complete the loan details and pledge consent to continue.")
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/I pledge this sector/));
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    expect(onSubmit.mock.lastCall?.[1]).toMatchObject({ bankId: "bank", pledgeConsent: true });
  });

  it("lets a player clear the field and type a whole number", () => {
    const { input } = renderDialog();
    expect(input.value).toBe("1");

    // The old handler clamped every keystroke to >= 1, so the field could never
    // be empty and the first digit of a typed number was swallowed.
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "250" } });
    expect(input.value).toBe("250");
  });

  it("submits the number that was typed, in units", () => {
    const { input, onSubmit } = renderDialog();
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: /^Build 250 /i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // One facility is many units of capacity, so the API argument is a multiple.
    expect(onSubmit.mock.calls[0][0] % 250).toBe(0);
    expect(onSubmit.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it("ignores non-digits rather than going NaN", () => {
    const { input } = renderDialog();
    fireEvent.change(input, { target: { value: "12abc3" } });
    expect(input.value).toBe("123");
  });

  it("falls back to 1 when the field is left empty", () => {
    const { input } = renderDialog();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1");
  });

  it("cannot submit while the field is empty", () => {
    const { input } = renderDialog();
    fireEvent.change(input, { target: { value: "" } });
    const submit = screen.getByRole("button", { name: /^Build 0 /i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("steps by 10 on the +10 and -10 buttons", () => {
    const { input } = renderDialog();
    fireEvent.click(screen.getByLabelText(/build 10 more/i), NO_MODS);
    expect(input.value).toBe("11");
    fireEvent.click(screen.getByLabelText(/build 10 fewer/i), NO_MODS);
    expect(input.value).toBe("1");
  });

  it("never steps below one", () => {
    const { input } = renderDialog();
    fireEvent.click(screen.getByLabelText(/build one fewer/i), NO_MODS);
    expect(input.value).toBe("1");
  });

  it("multiplies the step by 10 on shift and 100 on ctrl", () => {
    const { input } = renderDialog();
    const plusTen = screen.getByLabelText(/build 10 more/i);

    fireEvent.click(plusTen, { ...NO_MODS, shiftKey: true });
    expect(input.value).toBe("101");

    fireEvent.click(plusTen, { ...NO_MODS, ctrlKey: true });
    expect(input.value).toBe("1101");
  });

  it("treats cmd on a Mac like ctrl", () => {
    const { input } = renderDialog();
    fireEvent.click(screen.getByLabelText(/build one more/i), { ...NO_MODS, metaKey: true });
    expect(input.value).toBe("101");
  });

  it("warns that new capacity may remain vacant when the sector is understaffed", () => {
    renderDialog(vi.fn(), {
      ...plants,
      workers: 25,
      workersDesired: 100,
      labourStaffingFactor: 0.25,
    } as PlantsData);

    expect(screen.getByText(/fills 25% of its jobs/i)).toBeTruthy();
    expect(screen.getByText(/New jobs may stay vacant/i)).toBeTruthy();
  });

  it("steps from the arrow keys, with the same modifiers", () => {
    const { input } = renderDialog();
    fireEvent.keyDown(input, { key: "ArrowUp", ...NO_MODS });
    expect(input.value).toBe("2");

    fireEvent.keyDown(input, { key: "ArrowUp", ...NO_MODS, shiftKey: true });
    expect(input.value).toBe("12");

    fireEvent.keyDown(input, { key: "ArrowDown", ...NO_MODS });
    expect(input.value).toBe("11");

    fireEvent.keyDown(input, { key: "PageUp", ...NO_MODS });
    expect(input.value).toBe("21");

    fireEvent.keyDown(input, { key: "PageDown", ...NO_MODS });
    expect(input.value).toBe("11");
  });
});

function render(ui: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("BuildCapacityDialog first income and founding price", () => {
  it("shows first income next turn for any order size", () => {
    const { input } = renderDialog();
    expect(screen.getByText("First income").nextSibling?.textContent).toBe("1 turn");
    fireEvent.change(input, { target: { value: "3" } });
    expect(screen.getByText("First income").nextSibling?.textContent).toBe("1 turn");
    const text = screen.getByTestId("build-arrival").textContent ?? "";
    expect(text).toContain("equal slices every turn, starting next turn");
    expect(text).toContain("finishes in 3 turns");
  });

  it("notes that only the first facility in a market is discounted", () => {
    renderDialog(vi.fn(), {
      ...plants,
      buildQuote: { ...plants.buildQuote, foundingMultiplier: 0.1 },
    });
    expect(screen.getByTestId("founding-note").textContent).toContain("90% off");
  });

  it("hides the founding note when there is no discount", () => {
    renderDialog();
    expect(screen.queryByTestId("founding-note")).toBeNull();
  });
});
