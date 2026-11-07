import type { CountryId } from "@/lib/constants/countries";
import type {
  EventDefinition,
  EventEffect,
  EventEligibility,
  OutcomeTier,
} from "@/lib/db/types/events";
import type { StatKey } from "@/lib/stats/statsConstants";

/**
 * Compact authoring format for the 2020s to 2040s PREE content. One spec yields
 * both the seed definition and the code handler, so option ids, labels,
 * descriptions and the default can never drift apart. Pure data in, pure data
 * out: no database, clock or randomness.
 */
export interface PackOption {
  id: string;
  label: string;
  description: string;
  stat?: StatKey;
  isDefault?: boolean;
  /** Outcome labels for the high, middle and low roll bands. */
  tiers: readonly [string, string, string];
  high?: EventEffect[];
  mid?: EventEffect[];
  low?: EventEffect[];
}

export interface PackEvent {
  kind: string;
  title: string;
  headline: string;
  body: string;
  eligibility?: EventEligibility[];
  baseWeight: number;
  minYear?: number;
  maxYear?: number;
  requiresCountryIds?: readonly CountryId[];
  broadcast?: "global" | "country";
  /** Per-kind cooldown range in turns. Broadcasts ignore it. */
  cooldown?: readonly [number, number];
  options: PackOption[];
}

/** Effect shorthand: favorability, personal wealth (anchor currency), infamy. */
export function pe(favorability = 0, wealth = 0, infamy = 0): EventEffect[] {
  const out: EventEffect[] = [];
  if (favorability !== 0) out.push({ type: "favorability", delta: favorability });
  if (wealth !== 0) out.push({ type: "personalWealth", deltaAnchor: wealth });
  if (infamy !== 0) out.push({ type: "infamy", delta: infamy });
  return out;
}

export type PackDefinition = Omit<EventDefinition, "_id" | "createdAt" | "updatedAt">;

export function packDefinition(spec: PackEvent): PackDefinition {
  const defaultOption = spec.options.find((o) => o.isDefault);
  if (!defaultOption) throw new Error(`pack event ${spec.kind} has no default option`);
  const [cooldownMin, cooldownMax] = spec.cooldown ?? [0, 0];
  return {
    kind: spec.kind,
    status: "draft",
    version: 1,
    title: spec.title,
    headline: spec.headline,
    body: spec.body,
    eligibility: spec.eligibility ?? ["all"],
    baseWeight: spec.baseWeight,
    cooldownTurnsMin: cooldownMin,
    cooldownTurnsMax: cooldownMax,
    defaultOptionId: defaultOption.id,
    options: spec.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      ...(o.isDefault ? { isDefault: true } : {}),
    })),
    ...(spec.minYear !== undefined ? { minYear: spec.minYear } : {}),
    ...(spec.maxYear !== undefined ? { maxYear: spec.maxYear } : {}),
    ...(spec.requiresCountryIds ? { requiresCountryIds: [...spec.requiresCountryIds] } : {}),
    ...(spec.broadcast ? { broadcast: spec.broadcast } : {}),
  };
}

export function packOutcomeTable(option: PackOption): OutcomeTier[] {
  const [highLabel, midLabel, lowLabel] = option.tiers;
  return [
    { minRoll: 80, maxRoll: 100, label: highLabel, effects: option.high ?? [] },
    { minRoll: 40, maxRoll: 79, label: midLabel, effects: option.mid ?? [] },
    { minRoll: 1, maxRoll: 39, label: lowLabel, effects: option.low ?? [] },
  ];
}
