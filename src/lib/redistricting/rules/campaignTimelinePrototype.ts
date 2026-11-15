/**
 * Local campaign timing experiment. runCampaignTimeline casts immutable ballot
 * batches after capped party actions, charging a state PS budget and decaying
 * local support and spending pressure between turns. No live host uses it.
 */
import {
  apportionPrototype,
  countPrototypeDistricts,
  transferPrototype,
  prototypeTransferTargets,
  type PrototypeSpot,
} from "@/lib/countries/us/rules/geographicPrototype";

export interface TimelineAction {
  id: string;
  turn: number;
  actor: 0 | 1;
  kind: "boost" | "attack";
  target: { districtId: string } | { countyId: string };
}
export interface CampaignTimelineInput {
  spots: readonly PrototypeSpot[];
  ballots: readonly (readonly [number, number])[];
  /** Frozen resident stocks for pricing; omit only in turnout-proxy experiments. */
  coveragePopulation?: readonly number[];
  turnoutWeights: readonly number[];
  actions: readonly TimelineAction[];
  openingPs: readonly [number, number];
  psIncome: readonly [number, number];
  psCap: number;
  baseCost: number;
  pressureIncrement: number;
  pressureDecay: number;
  pressureCap: number;
  maxUnitCost: number;
  effectPoints: number;
  effectCap: number;
  effectDecay: number;
  decayMode: "linear" | "fractional";
  countyFactor: number;
  pricing: "flat" | "coverage" | "fractional-coverage";
  /** Party-wide across actors in the same state, not per character. */
  actionsPerPartyPerTurn: number;
  rounding?: "per-batch" | "carry";
}
export function quoteTimelineAction(
  baseCost: number,
  pressure: number,
  maxUnitCost: number,
  units: number,
  roundHalfPs: boolean
): number {
  if (
    [baseCost, pressure, maxUnitCost, units].some((n) => !Number.isFinite(n) || n < 0) ||
    units === 0
  )
    throw new Error("Invalid action quote");
  const raw = units * Math.min(maxUnitCost, baseCost + pressure);
  return roundHalfPs ? Math.ceil(raw * 2 - 1e-9) / 2 : raw;
}
export function runCampaignTimeline(input: CampaignTimelineInput) {
  const params = [
    input.psCap,
    input.baseCost,
    input.pressureIncrement,
    input.pressureDecay,
    input.pressureCap,
    input.maxUnitCost,
    input.effectPoints,
    input.effectCap,
    input.effectDecay,
    input.countyFactor,
    input.actionsPerPartyPerTurn,
    ...input.openingPs,
    ...input.psIncome,
  ];
  if (
    params.some((n) => !Number.isFinite(n) || n < 0) ||
    input.baseCost < 1 ||
    input.countyFactor > 1 ||
    (input.decayMode === "fractional" && input.effectDecay > 1) ||
    !Number.isInteger(input.actionsPerPartyPerTurn)
  )
    throw new Error("Invalid timeline parameters");
  if (
    !input.turnoutWeights.length ||
    input.turnoutWeights.some((w) => !Number.isFinite(w) || w < 0) ||
    !input.turnoutWeights.some((w) => w > 0)
  )
    throw new Error("Invalid turnout profile");
  if (
    !input.spots.length ||
    input.spots.length !== input.ballots.length ||
    new Set(input.spots.map((s) => s.id)).size !== input.spots.length
  )
    throw new Error("Invalid timeline geography");
  if (
    input.coveragePopulation &&
    (input.coveragePopulation.length !== input.spots.length ||
      input.coveragePopulation.some((v) => !Number.isSafeInteger(v) || v < 0))
  )
    throw new Error("Invalid resident coverage");
  if (
    input.ballots.some(
      (r, i) =>
        r.length !== 2 ||
        r.some((v) => !Number.isSafeInteger(v) || v < 0) ||
        r[0] + r[1] !== input.spots[i].ballots
    )
  )
    throw new Error("Invalid baseline ballots");
  const horizon = input.turnoutWeights.length;
  if (
    new Set(input.actions.map((a) => a.id)).size !== input.actions.length ||
    input.actions.some(
      (a) =>
        !a.id ||
        !Number.isInteger(a.turn) ||
        a.turn < 0 ||
        a.turn >= horizon ||
        ![0, 1].includes(a.actor)
    )
  )
    throw new Error("Invalid or duplicate action receipt");
  const order = [...input.actions].sort(
    (a, b) => a.turn - b.turn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const districts = new Map<string, number>();
  const residents = input.coveragePopulation ?? input.spots.map((s) => s.ballots);
  input.spots.forEach((s, i) =>
    districts.set(s.districtId, (districts.get(s.districtId) ?? 0) + residents[i])
  );
  const sizes = [...districts.values()].sort((a, b) => a - b);
  const typicalDistrict = sizes[Math.floor(sizes.length / 2)];
  if (typicalDistrict <= 0) throw new Error("No positive district turnout");
  const targets = new Map(
    input.actions.map((a) => {
      const target = a.target;
      const indices = input.spots.flatMap((s, i) =>
        (
          "districtId" in target
            ? s.districtId === target.districtId
            : s.countyId === target.countyId
        )
          ? [i]
          : []
      );
      if (!indices.length) throw new Error("Unknown timeline target");
      const split =
        "countyId" in target && new Set(indices.map((i) => input.spots[i].districtId)).size > 1;
      const factor = split ? input.countyFactor : 1;
      const coverage = indices.reduce((s, i) => s + residents[i], 0) / typicalDistrict;
      const units =
        input.pricing !== "flat" && "countyId" in target
          ? input.pricing === "fractional-coverage"
            ? Math.max(0.25, coverage * factor)
            : Math.max(1, Math.ceil(coverage * factor))
          : 1;
      return [a.id, { indices, factor, units }];
    })
  );
  const slices = input.ballots.map((r) =>
    r.map((v) => apportionPrototype(v, [...input.turnoutWeights]))
  );
  const effects = input.spots.map(() => [0, 0]);
  const cumulative = input.spots.map(() => [0, 0]);
  const remainder = input.spots.map(() => 0);
  const ps = input.openingPs.map((v) => Math.min(v, input.psCap));
  const openingBank = [...ps],
    creditedPs = [0, 0];
  const pressure = [0, 0],
    spent = [0, 0],
    paid = [0, 0];
  const rejected: Record<string, number> = {};
  const receipts: { id: string; turn: number; cost: number; status: string }[] = [];
  const history: {
    turn: number;
    votes: number[][];
    ps: number[];
    spent: number[];
    pressure: number[];
    maxEffect: number;
    meanAbsEffect: number;
  }[] = [];
  const totalBallots = input.ballots.reduce((s, r) => s + r[0] + r[1], 0);
  for (let turn = 0; turn < horizon; turn++) {
    // Income is credited before the action window. Decay starts on turn 1,
    // so actions already acted on the preceding turn's ballots before fading.
    for (let actor = 0; actor < 2; actor++) {
      const next = Math.min(input.psCap, ps[actor] + input.psIncome[actor]);
      creditedPs[actor] += next - ps[actor];
      ps[actor] = next;
      if (turn) pressure[actor] = Math.max(0, pressure[actor] - input.pressureDecay);
    }
    if (turn)
      for (const row of effects)
        for (let j = 0; j < 2; j++)
          row[j] =
            Math.sign(row[j]) *
            (input.decayMode === "fractional"
              ? Math.abs(row[j]) * (1 - input.effectDecay)
              : Math.max(0, Math.abs(row[j]) - input.effectDecay));
    const used = [0, 0];
    for (const action of order.filter((a) => a.turn === turn)) {
      const actor = action.actor,
        targetParty = action.kind === "boost" ? actor : 1 - actor;
      const { indices, factor, units } = targets.get(action.id)!;
      const delta = input.effectPoints * factor * (action.kind === "boost" ? 1 : -1);
      const cap = (v: number) => Math.max(-input.effectCap, Math.min(input.effectCap, v));
      const cost = quoteTimelineAction(
        input.baseCost,
        pressure[actor],
        input.maxUnitCost,
        units,
        input.pricing === "fractional-coverage"
      );
      const reason =
        used[actor] >= input.actionsPerPartyPerTurn
          ? "turn_limit"
          : indices.every(
                (i) =>
                  Math.abs(cap(effects[i][targetParty] + delta) - effects[i][targetParty]) < 1e-10
              )
            ? "at_cap"
            : ps[actor] + 1e-9 < cost
              ? "insufficient_ps"
              : null;
      if (reason) {
        rejected[reason] = (rejected[reason] ?? 0) + 1;
        receipts.push({ id: action.id, turn, cost: 0, status: reason });
        continue;
      }
      ps[actor] -= cost;
      spent[actor] += cost;
      paid[actor]++;
      used[actor]++;
      pressure[actor] = Math.min(input.pressureCap, pressure[actor] + input.pressureIncrement);
      for (const i of indices) effects[i][targetParty] = cap(effects[i][targetParty] + delta);
      receipts.push({ id: action.id, turn, cost, status: "paid" });
    }
    const votes = input.spots.map((_, i) => {
      const base = slices[i].map((p) => p[turn]);
      if (input.rounding === "per-batch")
        return transferPrototype(base, effects[i], input.effectCap);
      const targets = prototypeTransferTargets(base, effects[i], input.effectCap);
      const total = base[0] + base[1];
      if (!total) return base;
      const desired = targets[0] + remainder[i];
      const assigned = Math.max(0, Math.min(total, Math.floor(desired + 0.5)));
      remainder[i] = desired - assigned;
      return [assigned, total - assigned];
    });
    votes.forEach((row, i) =>
      row.forEach((v, j) => {
        cumulative[i][j] += v;
      })
    );
    history.push({
      turn,
      votes,
      ps: [...ps],
      spent: [...spent],
      pressure: [...pressure],
      maxEffect: Math.max(...effects.flat().map(Math.abs)),
      meanAbsEffect: totalBallots
        ? effects.reduce(
            (s, r, i) => s + Math.max(...r.map(Math.abs)) * input.spots[i].ballots,
            0
          ) / totalBallots
        : 0,
    });
  }
  const gained = cumulative.reduce((s, r, i) => s + r[0] - input.ballots[i][0], 0);
  const conserved = cumulative.every((r, i) => r[0] + r[1] === input.spots[i].ballots);
  if (!conserved) throw new Error("Timeline lost ballots");
  if (
    ps.some(
      (v, i) =>
        v < -1e-9 ||
        v > input.psCap + 1e-9 ||
        Math.abs(v + spent[i] - openingBank[i] - creditedPs[i]) > 1e-7
    )
  )
    throw new Error("Timeline lost political strength");
  return {
    gainedVotes: gained,
    statewideShareGainPoints: totalBallots ? (100 * gained) / totalBallots : 0,
    spent,
    creditedPs,
    roundingRemainders: remainder,
    paid,
    ps,
    pressure,
    rejected,
    receipts,
    history,
    districts: countPrototypeDistricts(input.spots, cumulative, ["D", "R"]),
    cumulative,
    conserved,
  };
}
