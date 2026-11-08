import {
  STAGE_INDEX,
  clamp,
  clampSeverity,
  type CrisisDefinition,
  type CrisisInstance,
  type SpilloverChannel,
  type SpilloverLink,
} from "./types";

/** Directed weights: `from` country, then `to` country, each 0..1. */
export type ChannelWeights = ReadonlyMap<string, ReadonlyMap<string, number>>;

export type CountryTierKind = "player" | "npp" | "background" | "absent";

/**
 * Everything the evaluator needs about the world, already reduced to plain
 * numbers by the shell. A channel with no entry carries nothing.
 */
export interface SpilloverWorld {
  weights: Partial<Record<SpilloverChannel, ChannelWeights>>;
  /** Each country's size relative to the largest background country, 0..1. */
  sizeShare: ReadonlyMap<string, number>;
  tiers: ReadonlyMap<string, CountryTierKind>;
}

/** Links lighter than this are noise and never transmit. */
export const MIN_LINK_WEIGHT = 0.05;
/** Targets one link may reach from one source in a turn. */
export const MAX_TARGETS_PER_LINK = 3;
/** Most severity a feed adds to a target in one turn. */
export const MAX_FEED_STEP = 4;
/** Extra transmission the largest background source adds. */
export const MAX_AMPLIFIER_BONUS = 1;

export function linkWeight(
  world: SpilloverWorld,
  channel: SpilloverChannel,
  from: string,
  to: string
): number {
  return world.weights[channel]?.get(from)?.get(to) ?? 0;
}

/**
 * Transmission multiplier for a source country. Background countries carry no
 * simulation of their own, so their size is what makes them matter: a large one
 * passes a shock on harder than a small one. Full-simulation countries pass it
 * on at face value.
 */
export function sourceAmplifier(world: SpilloverWorld, countryId: string): number {
  if (world.tiers.get(countryId) !== "background") return 1;
  const share = world.sizeShare.get(countryId) ?? 0;
  return 1 + MAX_AMPLIFIER_BONUS * clamp(share, 0, 1);
}

/**
 * Source severity as it stood `delayTurns` ago, or null while the crisis is
 * younger than the delay. Reads the stored history, so no pending-spill state
 * has to be kept.
 */
export function delayedSeverity(
  instance: Pick<CrisisInstance, "startTurn" | "severity" | "severityHistory">,
  turn: number,
  delayTurns: number
): number | null {
  if (delayTurns <= 0) return instance.severity;
  const wanted = turn - delayTurns;
  if (wanted < instance.startTurn) return null;
  let found: number | null = null;
  for (const sample of instance.severityHistory) {
    if (sample.turn <= wanted) found = sample.severity;
    else break;
  }
  return found;
}

/** Whether the source has reached the stage the link needs. */
export function linkStageReached(
  instance: Pick<CrisisInstance, "stage">,
  link: Pick<SpilloverLink, "minStage">
): boolean {
  if (instance.stage === "resolved") return false;
  if (!link.minStage) return true;
  return STAGE_INDEX[instance.stage] >= STAGE_INDEX[link.minStage];
}

/**
 * Severity a link pushes onto one target country: the delayed source severity,
 * through the link's transmission, the channel weight between the two countries
 * and the source's amplifier. Zero when the link does not pass.
 */
export function linkPressure(
  world: SpilloverWorld,
  link: SpilloverLink,
  source: Pick<CrisisInstance, "stage" | "startTurn" | "severity" | "severityHistory">,
  turn: number,
  fromCountry: string,
  toCountry: string
): number {
  if (!linkStageReached(source, link)) return 0;
  const severity = delayedSeverity(source, turn, link.delayTurns ?? 0);
  if (severity === null || severity < link.minSeverity) return 0;
  const weight = linkWeight(world, link.channel, fromCountry, toCountry);
  if (weight < MIN_LINK_WEIGHT) return 0;
  return clampSeverity(
    severity * clamp(link.transmission, 0, 1) * weight * sourceAmplifier(world, fromCountry)
  );
}

/** New target severity after a feed: lifted toward the pressure, never past it, in bounded steps. */
export function applyFeed(targetSeverity: number, pressure: number): number {
  if (pressure <= targetSeverity) return targetSeverity;
  return clampSeverity(targetSeverity + Math.min(MAX_FEED_STEP, pressure - targetSeverity));
}

/** A live crisis as the evaluator sees it. */
export interface SpilloverCrisis {
  id: string;
  countryIds: readonly string[];
  instance: CrisisInstance;
}

export interface SpilloverFeed {
  kind: "feed";
  linkId: string;
  sourceId: string;
  targetId: string;
  targetCountry: string;
  pressure: number;
}

export interface SpilloverOpen {
  kind: "open";
  linkId: string;
  sourceId: string;
  sourceDefinitionId: string;
  targetDefinitionId: string;
  targetCountry: string;
  pressure: number;
}

export type SpilloverAction = SpilloverFeed | SpilloverOpen;

export interface SpilloverContext {
  turn: number;
  world: SpilloverWorld;
  definitions: ReadonlyMap<string, CrisisDefinition>;
  crises: readonly SpilloverCrisis[];
}

function targetCountries(
  world: SpilloverWorld,
  link: SpilloverLink,
  sourceCountries: readonly string[]
): { country: string; weight: number }[] {
  const reached = new Map<string, number>();
  const own = new Set(sourceCountries);
  for (const from of sourceCountries) {
    for (const [to, weight] of world.weights[link.channel]?.get(from) ?? []) {
      if (own.has(to) || world.tiers.get(to) === "absent") continue;
      reached.set(to, Math.max(reached.get(to) ?? 0, weight));
    }
  }
  return [...reached]
    .filter(([, weight]) => weight >= MIN_LINK_WEIGHT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TARGETS_PER_LINK)
    .map(([country, weight]) => ({ country, weight }));
}

function strongestSourceCountry(
  world: SpilloverWorld,
  link: SpilloverLink,
  sourceCountries: readonly string[],
  to: string
): string | null {
  let best: string | null = null;
  let bestWeight = 0;
  for (const from of sourceCountries) {
    const weight = linkWeight(world, link.channel, from, to);
    if (weight > bestWeight) {
      best = from;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Decides, for every active crisis and link, which target countries get their
 * existing crisis fed and which get a new one proposed. Pure and deterministic.
 * A crisis never feeds one of its own ancestors, so a loop between two
 * countries cannot ratchet itself upward.
 */
export function evaluateSpillover(ctx: SpilloverContext): SpilloverAction[] {
  const byDefinitionAndCountry = new Map<string, SpilloverCrisis>();
  for (const crisis of ctx.crises) {
    if (crisis.instance.stage === "resolved") continue;
    for (const country of crisis.countryIds) {
      const key = `${crisis.instance.definitionId}|${country}`;
      if (!byDefinitionAndCountry.has(key)) byDefinitionAndCountry.set(key, crisis);
    }
  }

  const actions: SpilloverAction[] = [];
  const ordered = [...ctx.crises].sort((a, b) => a.id.localeCompare(b.id));
  for (const source of ordered) {
    const def = ctx.definitions.get(source.instance.definitionId);
    if (!def || source.instance.stage === "resolved") continue;
    const ancestors = new Set(source.instance.parents.map((parent) => parent.crisisId));
    for (const link of def.spillover) {
      const targetDef = ctx.definitions.get(link.targetDefinitionId);
      if (!targetDef) continue;
      for (const { country } of targetCountries(ctx.world, link, source.countryIds)) {
        const from = strongestSourceCountry(ctx.world, link, source.countryIds, country);
        if (!from) continue;
        const pressure = linkPressure(ctx.world, link, source.instance, ctx.turn, from, country);
        if (pressure <= 0) continue;
        const existing = byDefinitionAndCountry.get(`${link.targetDefinitionId}|${country}`);
        if (existing) {
          if (existing.id === source.id || ancestors.has(existing.id)) continue;
          if (pressure <= existing.instance.severity) continue;
          actions.push({
            kind: "feed",
            linkId: link.id,
            sourceId: source.id,
            targetId: existing.id,
            targetCountry: country,
            pressure,
          });
        } else if (targetDef.scope === "national" && pressure >= targetDef.severity.initial) {
          actions.push({
            kind: "open",
            linkId: link.id,
            sourceId: source.id,
            sourceDefinitionId: def.id,
            targetDefinitionId: link.targetDefinitionId,
            targetCountry: country,
            pressure,
          });
        }
      }
    }
  }
  return actions;
}

/** Exposure of each country to others, as a share 0..1 of what the country has in total. */
export function shareWeights(
  amounts: ReadonlyMap<string, ReadonlyMap<string, number>>,
  scale = 1
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const [holder, byPartner] of amounts) {
    let total = 0;
    for (const value of byPartner.values()) total += value;
    if (total <= 0) continue;
    for (const [partner, value] of byPartner) {
      if (partner === holder || value <= 0) continue;
      const weight = clamp((value / total) * scale, 0, 1);
      // spill runs from the partner onto the holder that depends on it
      const row = result.get(partner) ?? new Map<string, number>();
      row.set(holder, Math.max(row.get(holder) ?? 0, weight));
      result.set(partner, row);
    }
  }
  return result;
}

/**
 * Trade weights from cleared bilateral flow. A source passes a shock on to a
 * country in proportion to the share of that country's total trade it supplies
 * or buys. `scale` makes a partner worth a fifth of trade count as full weight.
 */
export function tradeWeights(
  flow: ReadonlyMap<string, ReadonlyMap<string, number>>,
  scale = 5
): Map<string, Map<string, number>> {
  const bilateral = new Map<string, Map<string, number>>();
  const put = (a: string, b: string, value: number) => {
    const row = bilateral.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + value);
    bilateral.set(a, row);
  };
  for (const [exporter, byImporter] of flow) {
    for (const [importer, value] of byImporter) {
      if (exporter === importer || value <= 0) continue;
      put(exporter, importer, value);
      put(importer, exporter, value);
    }
  }
  return shareWeights(bilateral, scale);
}

/**
 * Alliance weights from shared organization membership. A source reaches a
 * country in proportion to the share of that country's memberships it also holds.
 */
export function allianceWeights(
  memberships: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const [target, targetOrgs] of memberships) {
    if (targetOrgs.size === 0) continue;
    for (const [source, sourceOrgs] of memberships) {
      if (source === target) continue;
      let shared = 0;
      for (const org of sourceOrgs) if (targetOrgs.has(org)) shared += 1;
      if (shared === 0) continue;
      const row = result.get(source) ?? new Map<string, number>();
      row.set(target, clamp(shared / targetOrgs.size, 0, 1));
      result.set(source, row);
    }
  }
  return result;
}

/** Weights between countries that share a world region: `same` inside it, `other` across it. */
export function regionWeights(
  regionOf: ReadonlyMap<string, string>,
  same: number,
  other: number
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const [a, regionA] of regionOf) {
    const row = new Map<string, number>();
    for (const [b, regionB] of regionOf) {
      if (a === b) continue;
      row.set(b, regionA === regionB ? same : other);
    }
    result.set(a, row);
  }
  return result;
}

export interface SpreadEdge {
  fromId: string;
  toId: string;
  via: "spillover";
}

/** Spread lines for the crises board: one per recorded parent link between live crises. */
export function spilloverSpreadLinks(
  crises: readonly { id: string; parents: readonly { crisisId: string }[] }[]
): SpreadEdge[] {
  const live = new Set(crises.map((crisis) => crisis.id));
  const edges: SpreadEdge[] = [];
  for (const crisis of crises) {
    for (const parent of crisis.parents) {
      if (live.has(parent.crisisId)) {
        edges.push({ fromId: parent.crisisId, toId: crisis.id, via: "spillover" });
      }
    }
  }
  return edges;
}
