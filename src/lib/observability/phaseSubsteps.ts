/**
 * Sub-step timing inside a turn phase.
 *
 * A phase creates a marker and calls `mark(name)` at the end of each
 * sequential segment; marks with the same name accumulate. Each mark records
 * wall time since the previous mark and, when enabled, the phase's Mongo
 * round trips for that segment. `runPhase` persists the steps on the phase
 * status in `turnLogs`.
 *
 * Wall time includes interleaving with concurrent phases in the same group;
 * round trips do not (attributed by the phase's own trace id). Outside a
 * phase the marker is a no-op.
 *
 * State lives on globalThis because Next can instantiate a module twice
 * across server chunks.
 */
import {
  currentTurnPhase,
  phaseRoundTrips,
  roundTripCountsAvailable,
} from "@/lib/observability/mongoRoundTrips";

import { maybeInjectTurnFault } from "@/lib/turn/faultInjection";

export type PhaseSubstep = { ms: number; roundTrips?: number; calls: number };
export type PhaseSubsteps = Record<string, PhaseSubstep>;

declare global {
  var _ahdPhaseSubsteps: Map<string, PhaseSubsteps> | undefined;
}

function store(): Map<string, PhaseSubsteps> {
  globalThis._ahdPhaseSubsteps ??= new Map();
  return globalThis._ahdPhaseSubsteps;
}

export type SubstepMarker = { mark(name: string): void };

const NOOP: SubstepMarker = { mark() {} };

export function substepMarker(now: () => number = () => performance.now()): SubstepMarker {
  const phase = currentTurnPhase();
  if (!phase) return NOOP;
  let lastAt = now();
  let lastRoundTrips = phaseRoundTrips(phase);
  return {
    mark(name: string) {
      maybeInjectTurnFault(phase, name);
      const at = now();
      // Checked per mark: the monitor may observe its first command after the
      // marker was created, and counts before that are zero, not missing.
      const counting = roundTripCountsAvailable();
      const roundTrips = phaseRoundTrips(phase);
      const steps = store().get(phase) ?? {};
      const step = steps[name] ?? { ms: 0, calls: 0 };
      step.ms += at - lastAt;
      step.calls += 1;
      if (counting) step.roundTrips = (step.roundTrips ?? 0) + (roundTrips - lastRoundTrips);
      steps[name] = step;
      store().set(phase, steps);
      lastAt = at;
      lastRoundTrips = roundTrips;
    },
  };
}

/** Recorded steps for a phase, rounded for storage, without clearing them. */
export function peekPhaseSubsteps(phase: string): PhaseSubsteps | undefined {
  const steps = store().get(phase);
  if (!steps || Object.keys(steps).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(steps).map(([name, step]) => [name, { ...step, ms: Math.round(step.ms) }])
  );
}

/** Recorded steps for a phase, rounded for storage, and cleared. */
export function takePhaseSubsteps(phase: string): PhaseSubsteps | undefined {
  const steps = peekPhaseSubsteps(phase);
  store().delete(phase);
  return steps;
}

/** Drop recorded steps for a phase without persisting them (failure paths). */
export function discardPhaseSubsteps(phase: string): void {
  store().delete(phase);
}
