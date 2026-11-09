import { describe, expect, it, vi } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";

function request() {
  const common = {
    capacityUnits: 100,
    activeFraction: 1,
    outputMultiplier: 1,
    labourCost: 0,
    otherOperatingCost: 0,
    labourRecipientAccountId: "households",
    operatingRecipientAccountId: "households",
    inputStock: [],
    outputStock: [],
  };
  const output = (commodity: string) => [
    {
      commodity,
      book: "world",
      unitsPerOutput: 1,
      policy: { kind: "manual" as const, unitPrice: 1 },
      referenceUnitPrice: 1,
      storable: true,
    },
  ];
  const producers: ProductionPlan[] = [
    {
      ...common,
      id: "factory",
      accountId: "factory",
      inputs: [{ commodity: "energy", book: "world", unitsPerOutput: 1, maximumUnitPrice: 1 }],
      outputs: output("goods"),
    },
    { ...common, id: "power", accountId: "power", inputs: [], outputs: output("energy") },
  ];
  return {
    turn: 1,
    maximumPlanningPasses: 64,
    producers,
    accounts: ["factory", "power", "households"].map((id) => ({ id, cash: 1000 })),
    externalOrders: [
      {
        id: "priority-buyer",
        accountId: "households",
        commodity: "energy",
        book: "world",
        units: 100,
        maximumUnitPrice: 1,
        priority: 2,
      },
    ],
  };
}

describe("production planning execution limits", () => {
  it("checks a whole-operation deadline inside final clearing too", () => {
    const input = request();
    input.producers = input.producers.filter((p) => p.id === "power");
    let planningFinished = false;
    expect(() =>
      advanceProducerEconomy(input, {
        elapsedMs: () => {
          planningFinished = true;
          return 0;
        },
        maximumElapsedMs: 30_000,
        checkBudget: () => {
          if (planningFinished) throw new Error("deadline");
        },
      })
    ).toThrow("deadline");
  });
  it("finishes early when every site and the credit allocation stop changing", () => {
    const elapsedMs = vi.fn(() => 0);
    const result = advanceProducerEconomy(request(), { elapsedMs, maximumElapsedMs: 30_000 });
    expect(result.planning).toMatchObject({
      passes: 2,
      converged: true,
      stopReason: "converged",
      siteChanges: [],
    });
    expect(elapsedMs).toHaveBeenCalledTimes(2);
  });

  it("completes clearing at a runtime cutoff and can replay the actual pass count without a clock", () => {
    const result = advanceProducerEconomy(request(), {
      elapsedMs: () => 30_000,
      maximumElapsedMs: 30_000,
    });
    expect(result.planning).toMatchObject({
      passes: 1,
      converged: false,
      stopReason: "runtime_limit",
    });
    expect(result.planning?.siteChanges).toEqual([
      expect.objectContaining({ producerId: "factory", previousUnits: 100, plannedUnits: 0 }),
    ]);
    expect(result.producers.find((p) => p.id === "factory")?.producedUnits).toBe(0);
    expect(
      result.tradeReceipt.offers
        .filter((o) => o.commodity === "goods")
        .reduce((n, o) => n + o.units, 0)
    ).toBe(0);
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBe(3000);
    const { planning: _limitedPlanning, ...limited } = result;
    const { planning: replayPlanning, ...replayed } = advanceProducerEconomy({
      ...request(),
      maximumPlanningPasses: result.planning!.passes,
    });
    expect(replayed).toEqual(limited);
    expect(replayPlanning?.stopReason).toBe("pass_limit");
  });

  it("does not confuse an expired budget with a converged market", () => {
    const input = request();
    input.producers = input.producers.filter((p) => p.id === "power");
    const result = advanceProducerEconomy(input, { elapsedMs: () => 100, maximumElapsedMs: 0 });
    expect(result.planning).toMatchObject({ passes: 1, converged: true, stopReason: "converged" });
  });

  it("rejects invalid clocks and budgets instead of silently removing the ceiling", () => {
    expect(() =>
      advanceProducerEconomy(request(), { elapsedMs: () => NaN, maximumElapsedMs: 1 })
    ).toThrow("elapsed time");
    expect(() =>
      advanceProducerEconomy(request(), { elapsedMs: () => 0, maximumElapsedMs: -1 })
    ).toThrow("runtime budget");
  });
});
