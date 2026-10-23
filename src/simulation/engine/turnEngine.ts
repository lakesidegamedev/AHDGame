/**
 * Which turn engine processes a turn, and which implementation each phase runs.
 *
 * The turn engine is versioned separately from the app. `gameConfig.turnEngineVersion`
 * picks the engine for a NEW turn; the choice is read once, at turn start, and stamped
 * on the in-flight turn so every phase of that turn runs the same code. A turn that
 * crashes and resumes continues on the engine that started it — switching engines
 * mid-turn would let half a world be produced by one set of rules and half by another,
 * which is exactly the outcome change this versioning exists to prevent.
 *
 * v2 is not a fork of the engine: it reuses the phase registry, runtime, phase names,
 * resume codecs and crash recovery unchanged and swaps in optimized implementations
 * phase by phase. Any phase without a v2 implementation runs its v1 code, so an
 * incomplete v2 is always a slower v2, never a differently-ruled world.
 */

export const TURN_ENGINE_SELECTIONS = ["v1", "v2"] as const;

export type TurnEngineSelection = (typeof TURN_ENGINE_SELECTIONS)[number];

/** Engine used when `gameConfig.turnEngineVersion` is absent, which is every world today. */
export const DEFAULT_TURN_ENGINE: TurnEngineSelection = "v1";

/**
 * Behaviour version of each engine, independent of `package.json` and of the
 * deployed commit. Bumped whenever a v2 phase changes the world it produces, so a
 * turn log answers "which rules produced this world" without a deploy-time lookup.
 */
export const TURN_ENGINE_VERSIONS: Readonly<Record<TurnEngineSelection, string>> = {
  v1: "1.0.0",
  v2: "2.0.0",
};

/** Current version of the v2 engine, exported for turn logs and the engine changelog. */
export const TURN_ENGINE_V2_VERSION = TURN_ENGINE_VERSIONS.v2;

export interface TurnEngine {
  selection: TurnEngineSelection;
  /** Behaviour version of `selection` — what a turn log stamps as `engineVersion`. */
  version: string;
  /** Where the selection came from; `resumed` wins over config by design. */
  source: "config" | "resumed" | "default";
  /**
   * Phases that actually ran a v2 implementation this turn, in execution order.
   * A phase listed here produced its world through the optimized path; anything
   * absent ran v1 code even when the v2 engine was selected.
   */
  v2Phases: string[];
}

export interface TurnEngineResolution {
  engine: TurnEngine;
  /** Human-readable notes for the turn's warning list (unknown value, pinned resume). */
  warnings: string[];
}

export function isTurnEngineSelection(value: unknown): value is TurnEngineSelection {
  return value === "v1" || value === "v2";
}

function engineFor(selection: TurnEngineSelection, source: TurnEngine["source"]): TurnEngine {
  return {
    selection,
    version: TURN_ENGINE_VERSIONS[selection],
    source,
    v2Phases: [],
  };
}

/**
 * Resolve the engine for one turn.
 *
 * `resumed` is the engine recorded on the in-flight turn, and is only ever supplied
 * when this turn is a crash resume. It wins unconditionally: config can select a
 * different engine for the NEXT turn, never for a turn already in progress. Because
 * resume also reuses the phase names and resume results, a v1 turn resumed after the
 * config flipped to v2 still finishes as a v1 turn.
 *
 * An unrecognised configured value (a typo, a future engine name, a non-string) falls
 * back to v1 with a warning rather than failing the turn or silently selecting v2.
 */
export function resolveTurnEngine(input: {
  /** Raw `gameConfig.turnEngineVersion`, exactly as stored. */
  configured?: unknown;
  /** Engine recorded by the holder of the in-flight turn, on a resume only. */
  resumed?: unknown;
}): TurnEngineResolution {
  const warnings: string[] = [];

  if (isTurnEngineSelection(input.resumed)) {
    if (isTurnEngineSelection(input.configured) && input.configured !== input.resumed) {
      warnings.push(
        `[turn-engine] config selects ${input.configured} but the in-flight turn started on ` +
          `${input.resumed}; finishing on ${input.resumed} (an engine never changes mid-turn)`
      );
    }
    return { engine: engineFor(input.resumed, "resumed"), warnings };
  }

  if (input.configured == null || input.configured === "") {
    return { engine: engineFor(DEFAULT_TURN_ENGINE, "default"), warnings };
  }

  if (isTurnEngineSelection(input.configured)) {
    return { engine: engineFor(input.configured, "config"), warnings };
  }

  warnings.push(
    `[turn-engine] unknown gameConfig.turnEngineVersion ${describeValue(input.configured)}; ` +
      `falling back to ${DEFAULT_TURN_ENGINE}`
  );
  return { engine: engineFor(DEFAULT_TURN_ENGINE, "default"), warnings };
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.slice(0, 40));
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : typeof value;
}

/**
 * Resolve the engine for one attempt at a turn.
 *
 * Split from `resolveTurnEngine` so the rule that matters most is testable on
 * its own: the in-flight engine is only consulted when this attempt is actually
 * a resume. A stale `processingEngine` left on a world that is starting a fresh
 * turn is ignored, so a crashed turn's engine cannot leak into the next one.
 */
export function selectEngineForAttempt(input: {
  configured?: unknown;
  inFlightEngine?: unknown;
  isResume: boolean;
}): TurnEngineResolution {
  if (!input.isResume) {
    return resolveTurnEngine({ configured: input.configured });
  }
  // A turn that started before engines were versioned has no stamp, and it was
  // necessarily a v1 turn. Treat the absence as v1 rather than falling back to
  // config: flipping config to v2 while such a turn is in flight must not
  // switch it mid-turn.
  if (!isTurnEngineSelection(input.inFlightEngine)) {
    const resolution = resolveTurnEngine({ configured: input.configured, resumed: "v1" });
    return {
      engine: resolution.engine,
      warnings: [
        `[turn-engine] resumed turn has no engine stamp (it started before engines were ` +
          `versioned); finishing on ${DEFAULT_TURN_ENGINE}`,
        ...resolution.warnings,
      ],
    };
  }
  return resolveTurnEngine({
    configured: input.configured,
    resumed: input.inFlightEngine,
  });
}

export interface TurnPhaseImplementation<T> {
  /** The unchanged implementation. Always present: it is the fallback. */
  v1: () => Promise<T>;
  /** The optimized implementation, when this phase has one. */
  v2?: () => Promise<T>;
}

/**
 * Pick the implementation for one phase and record it on the engine.
 *
 * Returns the callable rather than the result so the caller can hand it straight to
 * `runtime.runPhase(name, fn)`, which owns telemetry, budgets, audit and resume.
 * Selecting v1 while v2 is configured (no v2 implementation, or v1 configured) is
 * normal and silent: v2 is a set of phase optimizations, not a separate world model.
 */
export function selectPhaseImplementation<T>(
  engine: TurnEngine,
  phase: string,
  implementations: TurnPhaseImplementation<T>
): () => Promise<T> {
  if (engine.selection === "v2" && implementations.v2) {
    if (!engine.v2Phases.includes(phase)) engine.v2Phases.push(phase);
    return implementations.v2;
  }
  return implementations.v1;
}
