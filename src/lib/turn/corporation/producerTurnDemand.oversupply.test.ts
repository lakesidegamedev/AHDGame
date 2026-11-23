import { describe, expect, it } from "vitest";
import type { ProductionPlan } from "@/lib/market/producerMarket/production";
import { applyOversupplyCut } from "./producerTurnDemand";

const output = (commodity: string, unitsPerOutput: number) => ({
  commodity,
  unitsPerOutput,
  book: "world",
  policy: "market" as never,
  referenceUnitPrice: 2000,
  storable: false,
});

function plan(
  id: string,
  accountId: string,
  capacityUnits: number,
  outputs: ReturnType<typeof output>[]
): ProductionPlan {
  return {
    id,
    accountId,
    capacityUnits,
    activeFraction: 1,
    outputMultiplier: 1,
    inputs: [
      { commodity: "advertising", unitsPerOutput: 0.5, book: "world", maximumUnitPrice: 500 },
    ],
    outputs,
    labourCost: 100,
    otherOperatingCost: 10,
    inputStock: [],
    outputStock: [],
  } as unknown as ProductionPlan;
}

/** A Gangrel-like fintech plant (financial services and software) and a pure branch bank. */
function glutWorld() {
  const fintech = plan("fintech", "gangrel", 1000, [
    output("financial_services", 0.6),
    output("software", 0.4),
  ]);
  const bank = plan("bank", "nwf", 600, [output("financial_services", 1)]);
  return { fintech, bank };
}

const supplyOf = (plans: ProductionPlan[]) =>
  plans.reduce(
    (n, p) =>
      n +
      p.outputs
        .filter((o) => o.commodity === "financial_services")
        .reduce(
          (m, o) => m + p.capacityUnits * p.activeFraction * p.outputMultiplier * o.unitsPerOutput,
          0
        ),
    0
  );

const rich = new Map([
  ["gangrel", 1e9],
  ["nwf", 1e9],
]);

describe("applyOversupplyCut", () => {
  it("brings financial services supply to last turn's sales times 1.05", () => {
    const { fintech, bank } = glutWorld();
    // Planned 600 + 600 = 1200; last turn 1200 offered, 700 sold.
    const scales = applyOversupplyCut(
      [fintech, bank],
      new Map([["financial_services", { offered: 1200, sold: 700 }]]),
      rich
    );
    expect(scales.get("financial_services")).toBeCloseTo(735 / 1200, 6);
    expect(supplyOf([fintech, bank])).toBeCloseTo(735, 6);
  });

  it("never cuts software or the run of a plant that also makes software", () => {
    const { fintech, bank } = glutWorld();
    applyOversupplyCut(
      [fintech, bank],
      new Map([["financial_services", { offered: 1200, sold: 700 }]]),
      rich
    );
    expect(fintech.outputMultiplier).toBe(1);
    expect(fintech.outputs.find((o) => o.commodity === "software")?.unitsPerOutput).toBe(0.4);
    // A plant that makes only financial services runs less, so it buys fewer inputs.
    expect(bank.outputMultiplier).toBeLessThan(1);
    expect(bank.outputs[0].unitsPerOutput).toBe(1);
  });

  it("does not cut when the glut has ended", () => {
    const { fintech, bank } = glutWorld();
    const scales = applyOversupplyCut(
      [fintech, bank],
      new Map([["financial_services", { offered: 1200, sold: 1195 }]]),
      rich
    );
    expect(scales.get("financial_services")).toBe(1);
    expect(supplyOf([fintech, bank])).toBe(1200);
  });

  it("does not cause a shortage when a big bank shuts down for lack of cash", () => {
    const { fintech, bank } = glutWorld();
    // Last turn was glutted by the bank; this turn it has no cash and will make nothing.
    const scales = applyOversupplyCut(
      [fintech, bank],
      new Map([["financial_services", { offered: 1200, sold: 700 }]]),
      new Map([
        ["gangrel", 1e9],
        ["nwf", 0],
      ])
    );
    // Only Gangrel's 600 counts, under the 735 target: no cut, so buyers are not left short.
    expect(scales.get("financial_services")).toBe(1);
    expect(fintech.outputs[0].unitsPerOutput).toBe(0.6);
  });

  it("leaves other goods and markets with no history alone", () => {
    const { fintech, bank } = glutWorld();
    const scales = applyOversupplyCut([fintech, bank], new Map(), rich);
    expect(scales.size).toBe(0);
    expect(supplyOf([fintech, bank])).toBe(1200);
  });
});
