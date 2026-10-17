import { describe, it, expect, vi } from "vitest";
// Any accidental database connection in the production imports fails the offline experiment.
vi.mock("../../../src/lib/mongodb", () => ({
  getDb: () => {
    throw new Error("Offline simulation attempted database access");
  },
}));
import { productionKernels } from "./kernels";
import { paths, schedule, simulate } from "./model";
const k = productionKernels(),
  steady = paths.find((p) => p.name === "full-steady")!;
const finance = { rate: 0.01, margin: 0.25, runway: 24, feeDays: 0, royalty: "capacity" as const };
describe("paired extraction balance experiment", () => {
  it("uses realized state output, freezes its pre-publication baseline, and caps total reservation", () => {
    const growth = paths.find((p) => p.name === "growth")!;
    const s = schedule(growth, "recent", 0.1, 0.1, 168, k);
    expect(s.recentOutput).toBeCloseTo(0.1);
    expect(s.reservedDaily).toBeCloseTo(0.01);
    expect(s.frames[100].contractedOutput).toBeCloseTo(0.01);
    expect(schedule(steady, "capacity", 0.75, 0.1, 168, k).reservedDaily).toBe(0.75);
  });
  it("blocks zero-baseline issuance without blocking open-access startup", () => {
    const startup = paths.find((p) => p.name === "idle-startup")!;
    const s = schedule(startup, "recent", 0.1, 0.1, 168, k);
    const r = simulate(s, finance);
    expect(s.issuable).toBe(false);
    expect(r.awarded).toBe(false);
    expect(r.holderOutput).toBeGreaterThan(0);
    expect(r.wealthDelta).toBeCloseTo(0);
    expect(r.governmentRevenue).toBe(0);
    expect(schedule(startup, "recent-floor", 0.1, 0.1, 168, k, 24, 0.1).reservedDaily).toBeCloseTo(
      0.01
    );
  });
  it("keeps the 24-turn daily-to-hourly money basis in royalty comparisons", () => {
    const s = schedule(steady, "capacity", 0.1, 0.1, 24, k),
      f = s.frames[0];
    expect((finance.rate * f.capacityRoyalty) / f.contractedGross).toBeCloseTo(0.24);
    expect(f.capacityRoyalty).toBeCloseTo(f.productionRoyalty);
    expect(f.productionRoyalty).toBeCloseTo(f.allocationRoyalty);
  });
  it("does not quietly charge total-capacity royalties on an output-sized allocation", () => {
    const light = paths.find((p) => p.name === "light-steady")!;
    const f = schedule(light, "recent", 0.1, 0.1, 168, k).frames[0];
    expect(f.capacityRoyalty / f.allocationRoyalty).toBeCloseTo(10);
    expect(f.allocationRoyalty).toBeCloseTo(f.productionRoyalty);
  });
  it("defaults after three unpaid obligations, releases rights next turn, and never charges production royalty while idle", () => {
    const idle = paths.find((p) => p.name === "idle")!;
    const s = schedule(idle, "capacity", 0.1, 0.1, 24, k);
    expect(simulate(s, { ...finance, runway: 0 }).defaultTurn).toBe(3);
    const p = simulate(s, { ...finance, runway: 0, royalty: "production" });
    expect(p.defaultTurn).toBeNull();
    expect(p.paid).toBe(0);
  });
  it("matches shell expiry ordering and does not charge an expiry-turn royalty", () => {
    const s = schedule(steady, "capacity", 0.01, 0.5, 24, k);
    expect(s.frames[22].capacityRoyalty).toBeGreaterThan(0);
    expect(s.frames[23].capacityRoyalty).toBe(0);
    expect(s.frames[23].contractedOutput).toBeLessThan(s.frames[23].controlOutput);
    expect(s.frames[24].contractedOutput).toBeCloseTo(s.frames[24].controlOutput);
  });
  it("keeps identical open-access controls and conserved transfers across financial stresses", () => {
    for (const path of paths)
      for (const baseline of ["capacity", "recent", "recent-floor"] as const)
        for (const royalty of ["capacity", "allocation", "production"] as const) {
          const s = schedule(path, baseline, 0.1, 0.1, 168, k);
          const a = simulate(s, { ...finance, royalty, feeDays: 0.1 });
          const b = simulate(s, { ...finance, royalty, rate: 0, feeDays: 0 });
          expect(a.transferIdentityError).toBeLessThan(1e-10);
          expect(a.controlOutput).toBeCloseTo(b.controlOutput);
          expect(a.controlOtherOutput).toBeCloseTo(b.controlOtherOutput);
          expect(a.paid).toBeLessThanOrEqual(a.due + 1e-10);
        }
  });
  it("marks unaffordable signing fees as no award, with no fee or royalty receipts", () => {
    const r = simulate(schedule(steady, "capacity", 0.1, 0.1, 24, k), {
      ...finance,
      runway: 0,
      feeDays: 0.1,
    });
    expect(r.awarded).toBe(false);
    expect(r.governmentRevenue).toBe(0);
    expect(r.wealthDelta).toBeCloseTo(0);
  });
  it("does not mistake avoiding an early-default loss for an attractive full-term bid", () => {
    const light = paths.find((p) => p.name === "light-steady")!;
    const r = simulate(schedule(light, "capacity", 0.1, 0.1, 480, k), { ...finance, runway: 0 });
    expect(r.defaultTurn).not.toBeNull();
    expect(r.rational).toBe(false);
    expect(r.maxEconomicFee).toBe(0);
  });
  it("can identify an advantageous priority allocation under congestion rather than declaring every concession worthless", () => {
    const congested = paths.find((p) => p.name === "congested")!;
    const r = simulate(schedule(congested, "capacity", 0.75, 0.5, 168, k), {
      ...finance,
      rate: 0.005,
      margin: 0.5,
    });
    expect(r.incrementalNpv).toBeGreaterThan(0);
    expect(r.rational).toBe(true);
  });
});

it("keeps physical output within available capacity across paths, shares and bidder sizes", () => {
  for (const path of paths)
    for (const baseline of ["capacity", "recent", "recent-floor"] as const)
      for (const share of [0.01, 0.1, 0.75])
        for (const fraction of [0.01, 0.1, 0.5]) {
          const s = schedule(path, baseline, share, fraction, 480, k);
          s.frames.forEach((f, i) => {
            const cap = path.future(i + 1).capacity ?? 1;
            expect(f.contractedOutput + f.contractedOthers).toBeLessThanOrEqual(cap + 1e-10);
            expect(f.controlOutput + f.controlOthers).toBeLessThanOrEqual(cap + 1e-10);
          });
        }
});
