import { describe, expect, it, vi } from "vitest";
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";
import { createTurnPhaseRuntime } from "@/simulation/engine/turnPhaseRuntime";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import {
  runCountryElectionEntries,
  selectCountryElectionEntries,
  type CountryElectionEntry,
} from "./countryElectionPhase";

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

const entry = (name: string, fn?: CountryElectionEntry["fn"]): CountryElectionEntry => ({
  name,
  fn: fn ?? (async () => undefined),
});

describe("selectCountryElectionEntries", () => {
  const registry = {
    UK: [entry("ukElections"), entry("ukGovernorElections")],
    RU: [entry("ruSupremeSovietElections")],
    DE: [entry("deElections")],
  };

  it("keeps registry order and only countries in play", () => {
    const names = selectCountryElectionEntries(registry, new Set(["DE", "UK"])).map((e) => e.name);
    expect(names).toEqual(["ukElections", "ukGovernorElections", "deElections"]);
  });

  it("returns nothing when no country is in play", () => {
    expect(selectCountryElectionEntries(registry, new Set())).toEqual([]);
  });
});

describe("runCountryElectionEntries", () => {
  it("passes the in-flight turn and runs every spawner at once", async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fn = (name: string) =>
      vi.fn(async () => {
        started.push(name);
        await gate;
      });
    const a = fn("a");
    const b = fn("b");
    const now = new Date("2027-01-01T00:00:00Z");
    const pending = runCountryElectionEntries([entry("a", a), entry("b", b)], now, 7);
    await Promise.resolve();
    expect(started).toEqual(["a", "b"]);
    release();
    const result = await pending;
    expect(a).toHaveBeenCalledWith(now, 7);
    expect(b).toHaveBeenCalledWith(now, 7);
    expect(result.families).toBe(2);
    expect(Object.keys(result.durationMs).sort()).toEqual(["a", "b"]);
  });

  it("lets the others finish when one family fails, then fails the phase", async () => {
    const ok = vi.fn(async () => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      runCountryElectionEntries(
        [
          entry("bad", async () => {
            throw new Error("boom");
          }),
          entry("ok", ok),
        ],
        new Date(),
        1
      )
    ).rejects.toThrow("Country elections failed for bad: boom");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("propagates a must-stop error unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stop = new TurnMustStopError("stop", "test");
    await expect(
      runCountryElectionEntries(
        [
          entry("x", async () => {
            throw stop;
          }),
        ],
        new Date(),
        1
      )
    ).rejects.toBe(stop);
  });
});

describe("phase bookkeeping per turn", () => {
  async function statusWrites(phaseCount: number, entriesPerRun: "separate" | "merged") {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    const db = { collection: vi.fn().mockReturnValue({ updateOne }) };
    const phaseStatuses: TurnPhaseTelemetryMap = {};
    const runtime = createTurnPhaseRuntime({
      db: db as never,
      phaseStatuses,
      warnings: [],
      currentPhaseRef: { current: null },
    });
    const entries = Array.from({ length: phaseCount }, (_, i) => entry(`family${i}`));
    if (entriesPerRun === "separate") {
      await Promise.all(entries.map((e) => runtime.runPhase(e.name, () => e.fn(new Date(), 1))));
    } else {
      await runtime.runPhase("countryElections", () =>
        runCountryElectionEntries(entries, new Date(), 1)
      );
    }
    return { writes: updateOne.mock.calls.length, phases: Object.keys(phaseStatuses).length };
  }

  it("writes phase status once instead of once per family", async () => {
    const separate = await statusWrites(63, "separate");
    const merged = await statusWrites(63, "merged");
    expect(separate.phases).toBe(63);
    expect(merged.phases).toBe(1);
    expect(merged.writes).toBeLessThanOrEqual(2);
    expect(separate.writes).toBeGreaterThan(60);
  });
});
