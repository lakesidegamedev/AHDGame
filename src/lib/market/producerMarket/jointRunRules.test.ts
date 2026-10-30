import { describe, expect, it } from "vitest";
import { jointRunShare, lineSlices, type JointReceipt, type LineSlice } from "./jointRunRules";
import { demandPlanRunShare, LOW_USE_RUN_FLOOR, OUTPUT_GROW_STEP } from "./outputResponseRules";

const FLOOR = LOW_USE_RUN_FLOOR;
const GROW = 1 + OUTPUT_GROW_STEP;
const ACTIVE = 688.8;

const plan = (r: JointReceipt | null | undefined) => demandPlanRunShare(r, FLOOR, GROW);
const linePlan = (l: LineSlice) => plan(l.receipt);

/** Run with the summed plan, then the joint rule on top, as the funded shell does. */
function run(receipt: JointReceipt, countCaptive = true): number {
  return jointRunShare(plan(receipt), receipt, lineSlices(receipt, countCaptive), linePlan);
}

/**
 * A standard chemical plant at a tenth of its run: chemicals glutted (old stock
 * on the book, a fraction sold), plastics sold out. Running cost 150 a unit.
 */
function chemicalPlant(plasticsPrice: number, overrides: Partial<JointReceipt> = {}): JointReceipt {
  const produced = ACTIVE * 0.1;
  const plastics = produced * 0.062;
  const chemicals = produced - plastics;
  const products = [
    {
      commodity: "chemicals",
      book: "world",
      producedUnits: chemicals,
      offeredUnits: 400,
      soldUnits: 60,
      revenue: 60 * 170,
    },
    {
      commodity: "plastics",
      book: "world",
      producedUnits: plastics,
      offeredUnits: plastics,
      soldUnits: plastics,
      revenue: plastics * plasticsPrice,
    },
  ];
  return {
    activeUnits: ACTIVE,
    producedUnits: produced,
    offeredUnits: 400 + plastics,
    soldUnits: 60 + plastics,
    revenue: 60 * 170 + plastics * plasticsPrice,
    inputsConsumed: produced * 50,
    labourPaid: produced * 60,
    otherOperatingPaid: produced * 40,
    plannedRunShare: 0.1,
    products,
    ...overrides,
  };
}

describe("lineSlices", () => {
  it("splits units, costs and the active run by each product's share of output", () => {
    const r = chemicalPlant(3000);
    const slices = lineSlices(r, false)!;
    expect(slices.map((s) => s.commodity)).toEqual(["chemicals", "plastics"]);
    const plastics = slices[1];
    expect(plastics.unitShare).toBeCloseTo(0.062, 6);
    expect(plastics.unitPrice).toBeCloseTo(3000, 6);
    expect(plastics.receipt.activeUnits).toBeCloseTo(ACTIVE * 0.062, 6);
    expect(plastics.receipt.inputsConsumed).toBeCloseTo(r.inputsConsumed * 0.062, 6);
    // The line runs at the same share of its slice as the plant does of its capacity.
    expect(plastics.receipt.producedUnits / plastics.receipt.activeUnits).toBeCloseTo(0.1, 9);
  });

  it("returns null for a one-product plant, even one selling on several books", () => {
    const one: JointReceipt = {
      activeUnits: 100,
      producedUnits: 40,
      offeredUnits: 40,
      soldUnits: 40,
      revenue: 4000,
      inputsConsumed: 1000,
      products: [
        { commodity: "steel", book: "world", producedUnits: 30, offeredUnits: 30, soldUnits: 30 },
        { commodity: "steel", book: "DE", producedUnits: 10, offeredUnits: 10, soldUnits: 10 },
      ],
    };
    expect(lineSlices(one, true)).toBeNull();
  });

  it("leaves out a product that made nothing last turn", () => {
    const r = chemicalPlant(3000);
    const products = [
      ...(r.products ?? []),
      { commodity: "fertilizers", book: "world", producedUnits: 0, offeredUnits: 0, soldUnits: 0 },
    ];
    expect(lineSlices({ ...r, products }, false)!.map((s) => s.commodity)).toEqual([
      "chemicals",
      "plastics",
    ]);
  });

  it("counts deliveries to the company's own sites only when asked to", () => {
    const r = chemicalPlant(3000);
    const products = (r.products ?? []).map((p) =>
      p.commodity === "chemicals" ? { ...p, internalDeliveredUnits: 40, askingUnitPrice: 170 } : p
    );
    const withCaptive = lineSlices({ ...r, products }, true)!;
    const without = lineSlices({ ...r, products }, false)!;
    expect(withCaptive[0].receipt.soldUnits).toBe(100);
    expect(without[0].receipt.soldUnits).toBe(60);
  });
});

describe("jointRunShare", () => {
  it("keeps a plant running at its sold-out dear line's plan when a cheap line is glutted", () => {
    const r = chemicalPlant(3000);
    const summed = plan(r);
    // The summed receipt reads the chemical stock as a glut and parks the plant.
    expect(summed).toBe(FLOOR);
    const plastics = lineSlices(r, true)!.find((s) => s.commodity === "plastics")!;
    // Sold out at a profit: the plastics line grows a step from its run.
    expect(linePlan(plastics)).toBeCloseTo(0.1 * GROW, 9);
    expect(run(r)).toBeCloseTo(0.1 * GROW, 9);
  });

  it("does not run for a sold-out line that cannot pay the whole bundle's running cost", () => {
    // Plastics at 1,429 bring 89 a unit of output against a running cost of 150.
    const r = chemicalPlant(1429);
    expect(run(r)).toBe(plan(r));
  });

  it("is the summed plan exactly for a one-product plant", () => {
    const one: JointReceipt = {
      activeUnits: 100,
      producedUnits: 40,
      offeredUnits: 90,
      soldUnits: 30,
      revenue: 3000,
      inputsConsumed: 1000,
      plannedRunShare: 0.4,
      products: [
        { commodity: "steel", book: "world", producedUnits: 40, offeredUnits: 90, soldUnits: 30 },
      ],
    };
    expect(run(one)).toBe(plan(one));
  });

  it("still sheds a plant whose every line is glutted", () => {
    const r = chemicalPlant(3000);
    const products = (r.products ?? []).map((p) =>
      p.commodity === "plastics" ? { ...p, offeredUnits: 300, soldUnits: 2, revenue: 2 * 3000 } : p
    );
    const glutted = { ...r, products, offeredUnits: 700, soldUnits: 62 };
    expect(plan(glutted)).toBe(FLOOR);
    expect(run(glutted)).toBe(FLOOR);
  });

  it("stops a glutted line's stock cancelling another line's unmet demand", () => {
    // Both lines sell; chemical stock sits on the book. Summed, that stock is
    // subtracted from plastics demand. Per line, chemicals plan their own sales.
    const r = chemicalPlant(3000);
    const products = (r.products ?? []).map((p) =>
      p.commodity === "chemicals" ? { ...p, offeredUnits: 120, soldUnits: 60 } : p
    );
    const receipt = { ...r, products, offeredUnits: 120 + 4.27, soldUnits: 64.27 };
    expect(run(receipt)).toBeGreaterThan(plan(receipt));
    expect(run(receipt)).toBeLessThanOrEqual(1);
  });

  it("never plans below the summed plan", () => {
    const r = chemicalPlant(3000);
    expect(jointRunShare(0.5, r, lineSlices(r, true), () => 0.2)).toBe(0.5);
  });

  it("returns the summed plan when there is no receipt", () => {
    expect(jointRunShare(1, null, null, linePlan)).toBe(1);
  });
});
