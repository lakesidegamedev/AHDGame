import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TURN_ENGINE,
  TURN_ENGINE_V2_VERSION,
  TURN_ENGINE_VERSIONS,
  resolveTurnEngine,
  selectEngineForAttempt,
  selectPhaseImplementation,
} from "./turnEngine";

/**
 * The turn engine is selected once, at turn start, and a resume must never
 * change it. These tests pin the four states the selection can be in, because a
 * wrong answer here changes which rules produce a world — the one thing the
 * versioned engine exists to prevent.
 */
describe("resolveTurnEngine", () => {
  it("defaults to v1 when config says nothing, without a warning", () => {
    for (const configured of [undefined, null, ""]) {
      const { engine, warnings } = resolveTurnEngine({ configured });
      expect(engine.selection).toBe(DEFAULT_TURN_ENGINE);
      expect(engine.selection).toBe("v1");
      expect(engine.version).toBe(TURN_ENGINE_VERSIONS.v1);
      expect(engine.source).toBe("default");
      expect(engine.v2Phases).toEqual([]);
      expect(warnings).toEqual([]);
    }
  });

  it("selects v2 when config selects it", () => {
    const { engine, warnings } = resolveTurnEngine({ configured: "v2" });
    expect(engine.selection).toBe("v2");
    expect(engine.version).toBe(TURN_ENGINE_V2_VERSION);
    expect(engine.version).toBe("2.0.0");
    expect(engine.source).toBe("config");
    expect(warnings).toEqual([]);
  });

  it("falls back to v1 with a warning for an unknown value", () => {
    const { engine, warnings } = resolveTurnEngine({ configured: "v3" });
    expect(engine.selection).toBe("v1");
    expect(engine.source).toBe("default");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unknown gameConfig.turnEngineVersion");
    expect(warnings[0]).toContain('"v3"');
    expect(warnings[0]).toContain("falling back to v1");
  });

  it("describes non-string config values without dumping them", () => {
    const objectWarning = resolveTurnEngine({ configured: { engine: "v2" } }).warnings[0];
    expect(objectWarning).toContain("an object");
    const arrayWarning = resolveTurnEngine({ configured: ["v2"] }).warnings[0];
    expect(arrayWarning).toContain("an array");
    expect(resolveTurnEngine({ configured: 2 }).warnings[0]).toContain("2");
  });
});

describe("resolveTurnEngine on a resume", () => {
  it("keeps the engine that started the in-flight turn even when config flipped", () => {
    const { engine, warnings } = resolveTurnEngine({
      configured: "v2",
      resumed: "v1",
    });
    expect(engine.selection).toBe("v1");
    expect(engine.version).toBe(TURN_ENGINE_VERSIONS.v1);
    expect(engine.source).toBe("resumed");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("an engine never changes mid-turn");
  });

  it("keeps v2 when a v2 turn resumes after config was rolled back to v1", () => {
    const { engine, warnings } = resolveTurnEngine({ configured: "v1", resumed: "v2" });
    expect(engine.selection).toBe("v2");
    expect(engine.source).toBe("resumed");
    expect(warnings).toHaveLength(1);
  });

  it("uses the in-flight engine without a warning when config agrees or is absent", () => {
    expect(resolveTurnEngine({ configured: "v2", resumed: "v2" }).warnings).toEqual([]);
    const absent = resolveTurnEngine({ resumed: "v2" });
    expect(absent.engine.selection).toBe("v2");
    expect(absent.engine.source).toBe("resumed");
    expect(absent.warnings).toEqual([]);
  });

  it("ignores a malformed in-flight stamp and resolves from config", () => {
    const { engine } = resolveTurnEngine({ configured: "v2", resumed: "v9" });
    expect(engine.selection).toBe("v2");
    expect(engine.source).toBe("config");
  });
});

describe("selectEngineForAttempt", () => {
  it("pins the resume to the engine recorded on the in-flight turn", () => {
    const { engine } = selectEngineForAttempt({
      configured: "v2",
      inFlightEngine: "v1",
      isResume: true,
    });
    expect(engine.selection).toBe("v1");
    expect(engine.source).toBe("resumed");
  });

  it("ignores a stale in-flight stamp on a fresh turn", () => {
    const { engine, warnings } = selectEngineForAttempt({
      configured: "v2",
      inFlightEngine: "v1",
      isResume: false,
    });
    expect(engine.selection).toBe("v2");
    expect(engine.source).toBe("config");
    expect(warnings).toEqual([]);
  });

  it("treats an unstamped resumed turn as v1 even when config now says v2", () => {
    const { engine, warnings } = selectEngineForAttempt({
      configured: "v2",
      inFlightEngine: undefined,
      isResume: true,
    });
    expect(engine.selection).toBe("v1");
    expect(engine.source).toBe("resumed");
    expect(warnings[0]).toContain("no engine stamp");
  });

  it("starts a fresh turn on v1 when config is absent, stamp or not", () => {
    const { engine } = selectEngineForAttempt({ inFlightEngine: "v2", isResume: false });
    expect(engine.selection).toBe("v1");
    expect(engine.source).toBe("default");
  });
});

describe("selectPhaseImplementation", () => {
  it("runs v1 when v1 is selected, even if a v2 implementation exists", async () => {
    const { engine } = resolveTurnEngine({ configured: "v1" });
    const v1 = vi.fn().mockResolvedValue("v1");
    const v2 = vi.fn().mockResolvedValue("v2");
    const chosen = selectPhaseImplementation(engine, "corporationTurn", { v1, v2 });
    expect(await chosen()).toBe("v1");
    expect(v1).toHaveBeenCalledOnce();
    expect(v2).not.toHaveBeenCalled();
    expect(engine.v2Phases).toEqual([]);
  });

  it("runs the v1 fallback for a phase v2 has not optimized yet", async () => {
    const { engine } = resolveTurnEngine({ configured: "v2" });
    const v1 = vi.fn().mockResolvedValue("v1");
    const chosen = selectPhaseImplementation(engine, "bondTurn", { v1 });
    expect(await chosen()).toBe("v1");
    expect(engine.v2Phases).toEqual([]);
  });

  it("runs and records the v2 implementation when v2 is selected", async () => {
    const { engine } = resolveTurnEngine({ configured: "v2" });
    const v1 = vi.fn().mockResolvedValue("v1");
    const v2 = vi.fn().mockResolvedValue("v2");
    const chosen = selectPhaseImplementation(engine, "corporationTurn", { v1, v2 });
    expect(await chosen()).toBe("v2");
    expect(v2).toHaveBeenCalledOnce();
    expect(v1).not.toHaveBeenCalled();
    expect(engine.v2Phases).toEqual(["corporationTurn"]);
  });

  it("records each v2 phase once", async () => {
    const { engine } = resolveTurnEngine({ configured: "v2" });
    const impl = { v1: async () => "v1", v2: async () => "v2" };
    selectPhaseImplementation(engine, "bankingTurn", impl);
    selectPhaseImplementation(engine, "bankingTurn", impl);
    expect(engine.v2Phases).toEqual(["bankingTurn"]);
  });
});
