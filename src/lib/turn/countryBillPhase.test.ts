import { describe, expect, it, vi } from "vitest";
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";
import { createTurnPhaseRuntime } from "@/simulation/engine/turnPhaseRuntime";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import {
  runCountryBillEntries,
  selectCountryBillEntries,
  type CountryBillEntry,
} from "./countryBillPhase";

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

const ctx = { db: {} as never, currentTurn: 4, preset: "2027-default" };
const now = new Date("2027-01-01T00:00:00Z");
const entry = (phaseName: string, fn?: CountryBillEntry["fn"]): CountryBillEntry => ({
  phaseName,
  fn: fn ?? (async () => ({ enacted: 1, failed: 0 })),
});

describe("selectCountryBillEntries", () => {
  it("keeps registry order and only countries in play", () => {
    const registry = {
      UK: entry("ukBillLifecycle"),
      RU: entry("ruBillLifecycle"),
      DE: entry("deBillLifecycle"),
    };
    const names = selectCountryBillEntries(registry, new Set(["DE", "UK"])).map((e) => e.phaseName);
    expect(names).toEqual(["ukBillLifecycle", "deBillLifecycle"]);
  });
});

describe("runCountryBillEntries", () => {
  it("passes the deadline and context and collects each result by phase name", async () => {
    const fn = vi.fn(async () => ({ enacted: 2, failed: 1 }));
    const collected = new Map<string, unknown>();
    const result = await runCountryBillEntries(
      [entry("ukBillLifecycle", fn), entry("deBillLifecycle")],
      now,
      ctx,
      collected
    );
    expect(fn).toHaveBeenCalledWith(now, ctx);
    expect(collected.get("ukBillLifecycle")).toEqual({ enacted: 2, failed: 1 });
    expect(collected.get("deBillLifecycle")).toEqual({ enacted: 1, failed: 0 });
    expect(result.families).toBe(2);
  });

  it("keeps the other countries' results when one fails, then fails the phase", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collected = new Map<string, unknown>();
    await expect(
      runCountryBillEntries(
        [
          entry("ukBillLifecycle", async () => {
            throw new Error("boom");
          }),
          entry("deBillLifecycle"),
        ],
        now,
        ctx,
        collected
      )
    ).rejects.toThrow("Country bill lifecycles failed for ukBillLifecycle: boom");
    expect(collected.has("ukBillLifecycle")).toBe(false);
    expect(collected.get("deBillLifecycle")).toEqual({ enacted: 1, failed: 0 });
  });

  it("propagates a must-stop error unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stop = new TurnMustStopError("stop", "test");
    await expect(
      runCountryBillEntries(
        [
          entry("x", async () => {
            throw stop;
          }),
        ],
        now,
        ctx,
        new Map()
      )
    ).rejects.toBe(stop);
  });
});

describe("phase bookkeeping per turn", () => {
  it("writes phase status once instead of once per country", async () => {
    const count = async (merged: boolean) => {
      const updateOne = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 });
      const db = { collection: vi.fn().mockReturnValue({ updateOne }) };
      const phaseStatuses: TurnPhaseTelemetryMap = {};
      const runtime = createTurnPhaseRuntime({
        db: db as never,
        phaseStatuses,
        warnings: [],
        currentPhaseRef: { current: null },
      });
      const entries = Array.from({ length: 29 }, (_, i) => entry(`country${i}BillLifecycle`));
      if (merged)
        await runtime.runPhase("countryBillLifecycle", () =>
          runCountryBillEntries(entries, now, ctx, new Map())
        );
      else
        await Promise.all(entries.map((e) => runtime.runPhase(e.phaseName, () => e.fn(now, ctx))));
      return { writes: updateOne.mock.calls.length, phases: Object.keys(phaseStatuses).length };
    };
    const separate = await count(false);
    const merged = await count(true);
    expect(separate.phases).toBe(29);
    expect(merged.phases).toBe(1);
    expect(merged.writes).toBeLessThanOrEqual(2);
    expect(separate.writes).toBeGreaterThan(28);
  });
});
