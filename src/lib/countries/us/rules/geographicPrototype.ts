/**
 * US geographic election experiment. allocatePrototypeBallots conserves each
 * ballot batch while local lean redistributes party support; transferPrototype
 * applies bounded party effects to future batches. No production caller uses it.
 */
export const PROTOTYPE_VERSION = "us-geographic-prototype-v1";
export interface PrototypeBinding {
  countryId?: string;
  electionType: string;
  rulesVersion?: string;
  planId?: string;
}
export interface PrototypeSpot {
  id: string;
  countyId: string;
  districtId: string;
  /** Ballots in this batch, not residents or registered voters. */
  ballots: number;
  /** Republican two-party share minus 50, in points. Experimental, not Cook PVI. */
  lean: number;
}
export interface PrototypeParty {
  id: string;
  position: number;
  votes: number;
}
export function selectPrototype(binding: PrototypeBinding): "legacy" | "prototype" {
  if (binding.rulesVersion === undefined) return "legacy";
  if (
    binding.rulesVersion !== PROTOTYPE_VERSION ||
    binding.countryId !== "US" ||
    binding.electionType !== "house" ||
    !binding.planId?.startsWith("US-")
  )
    throw new Error("Invalid US prototype binding");
  return "prototype";
}
export function dispatchPrototype<T>(
  binding: PrototypeBinding,
  legacy: () => T,
  prototype: () => T
): T {
  return selectPrototype(binding) === "prototype" ? prototype() : legacy();
}
export function changePrototypeEffects(input: {
  spots: readonly PrototypeSpot[];
  effects: Readonly<Record<string, Readonly<Record<string, number>>>>;
  actorParty: string;
  targetParty: string;
  kind: "boost" | "attack";
  target: { countyId: string } | { districtId: string };
  points: number;
  cap: number;
  countyFactor: number;
}): Record<string, Record<string, number>> {
  if (
    !input.actorParty ||
    !input.targetParty ||
    (input.kind === "attack" && input.actorParty === input.targetParty)
  )
    throw new Error("Invalid party action");
  if (
    ![input.points, input.cap, input.countyFactor].every(Number.isFinite) ||
    input.points < 0 ||
    input.cap < 0 ||
    input.countyFactor < 0 ||
    input.countyFactor > 1
  )
    throw new Error("Invalid action parameters");
  const target = input.target;
  const selected = input.spots.filter((s) =>
    "countyId" in target ? s.countyId === target.countyId : s.districtId === target.districtId
  );
  if (!selected.length) throw new Error("Unknown geographic target");
  const factor =
    "countyId" in target && new Set(selected.map((s) => s.districtId)).size > 1
      ? input.countyFactor
      : 1;
  const delta = input.points * factor * (input.kind === "boost" ? 1 : -1);
  const effects = Object.fromEntries(
    Object.entries(input.effects).map(([id, row]) => [id, { ...row }])
  );
  for (const spot of selected) {
    const row = (effects[spot.id] ??= {});
    row[input.targetParty] = Math.max(
      -input.cap,
      Math.min(input.cap, (row[input.targetParty] ?? 0) + delta)
    );
  }
  return effects;
}
function integer(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid ballot count");
}
function unique(ids: string[]): void {
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new Error("Duplicate or empty identity");
}
export function apportionPrototype(total: number, weights: number[]): number[] {
  integer(total);
  if (weights.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Invalid weight");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length || (sum === 0 && total > 0)) throw new Error("No ballot recipients");
  if (total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const result = exact.map(Math.floor);
  const order = exact
    .map((v, i) => ({ i, remainder: v - result[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) result[order[i].i]++;
  return result;
}

/** Round a fitted matrix with a residual bipartite flow, preserving both margins. */
function roundMatrix(matrix: number[][], rows: number[], columns: number[]): number[][] {
  const result = matrix.map((r) => r.map(Math.floor));
  const source = rows.length + columns.length,
    sink = source + 1;
  const graph: { to: number; capacity: number; reverse: number }[][] = Array.from(
    { length: sink + 1 },
    () => []
  );
  function edge(from: number, to: number, capacity: number): number {
    const index = graph[from].length;
    graph[from].push({ to, capacity, reverse: graph[to].length });
    graph[to].push({ to: from, capacity: 0, reverse: index });
    return index;
  }
  let required = 0;
  rows.forEach((value, i) => {
    const deficit = value - result[i].reduce((a, b) => a + b, 0);
    integer(deficit);
    required += deficit;
    edge(source, i, deficit);
  });
  columns.forEach((value, j) => {
    const deficit = value - result.reduce((sum, row) => sum + row[j], 0);
    integer(deficit);
    edge(rows.length + j, sink, deficit);
  });
  const links: { i: number; j: number; index: number }[] = [];
  matrix.forEach((row, i) => {
    row
      .map((v, j) => ({ j, fraction: v - result[i][j] }))
      .filter(({ j, fraction }) => fraction > 0 && columns[j] > 0)
      .sort((a, b) => b.fraction - a.fraction || a.j - b.j)
      .forEach(({ j }) => links.push({ i, j, index: edge(i, rows.length + j, 1) }));
  });
  let flow = 0;
  while (flow < required) {
    const previous: { from: number; index: number }[] = [];
    const queue = [source];
    const visited = new Set([source]);
    for (let q = 0; q < queue.length && !visited.has(sink); q++) {
      const from = queue[q];
      graph[from].forEach((e, index) => {
        if (e.capacity > 0 && !visited.has(e.to)) {
          visited.add(e.to);
          previous[e.to] = { from, index };
          queue.push(e.to);
        }
      });
    }
    if (!visited.has(sink)) throw new Error("Matrix rounding could not preserve margins");
    for (let node = sink; node !== source;) {
      const { from, index } = previous[node],
        e = graph[from][index];
      e.capacity--;
      graph[node][e.reverse].capacity++;
      node = from;
    }
    flow++;
  }
  for (const { i, j, index } of links) if (graph[i][index].capacity === 0) result[i][j]++;
  return result;
}

export function allocatePrototypeBallots(input: {
  binding: PrototypeBinding;
  dataPlanId: string;
  spots: readonly PrototypeSpot[];
  parties: readonly PrototypeParty[];
  strength: number;
  adapter: "pool" | "continuous";
}): { spots: PrototypeSpot[]; parties: PrototypeParty[]; ballots: number[][]; iterations: number } {
  if (selectPrototype(input.binding) !== "prototype")
    throw new Error("Legacy race is not opted in");
  if (input.dataPlanId !== input.binding.planId) throw new Error("Incompatible geographic plan");
  const spots = [...input.spots].sort((a, b) => a.id.localeCompare(b.id));
  const parties = [...input.parties].sort((a, b) => a.id.localeCompare(b.id));
  unique(spots.map((s) => s.id));
  unique(parties.map((p) => p.id));
  if (!spots.length || !parties.length) throw new Error("Empty race");
  if (!Number.isFinite(input.strength) || input.strength < 0 || input.strength > 4)
    throw new Error("Invalid strength");
  for (const spot of spots) {
    integer(spot.ballots);
    if (
      !spot.countyId ||
      !spot.districtId ||
      !Number.isFinite(spot.lean) ||
      Math.abs(spot.lean) > 50
    )
      throw new Error("Invalid spot");
  }
  for (const party of parties) {
    integer(party.votes);
    if (!Number.isFinite(party.position)) throw new Error("Invalid party position");
  }
  const total = spots.reduce((s, p) => s + p.ballots, 0);
  integer(total);
  if (total !== parties.reduce((s, p) => s + p.votes, 0))
    throw new Error("Incompatible ballot margins");
  const mean = total ? spots.reduce((s, p) => s + p.ballots * p.lean, 0) / total : 0;
  const logOdds = (lean: number) => {
    const share = Math.max(1e-9, Math.min(1 - 1e-9, 0.5 + lean / 100));
    return Math.log(share / (1 - share));
  };
  const matrix = spots.map((s) =>
    parties.map((p) => {
      const direction =
        input.adapter === "pool"
          ? p.position <= -1
            ? -1
            : p.position >= 1
              ? 1
              : 0
          : Math.max(-1, Math.min(1, p.position));
      return total
        ? s.ballots *
            (p.votes / total) *
            Math.exp((direction * input.strength * (logOdds(s.lean) - logOdds(mean))) / 2)
        : 0;
    })
  );
  let iterations = 0;
  for (; total > 0 && iterations < 4000; iterations++) {
    parties.forEach((p, j) => {
      const sum = matrix.reduce((v, row) => v + row[j], 0);
      for (const row of matrix) row[j] = sum ? (row[j] * p.votes) / sum : 0;
    });
    matrix.forEach((row, i) => {
      const sum = row.reduce((a, b) => a + b, 0);
      for (let j = 0; j < row.length; j++) row[j] = sum ? (row[j] * spots[i].ballots) / sum : 0;
    });
    const residual = Math.max(
      ...parties.map((p, j) => Math.abs(matrix.reduce((v, row) => v + row[j], 0) - p.votes))
    );
    if (residual < 1e-7) break;
  }
  if (iterations === 4000) throw new Error("Calibration did not converge");
  return {
    spots,
    parties,
    ballots: roundMatrix(
      matrix,
      spots.map((s) => s.ballots),
      parties.map((p) => p.votes)
    ),
    iterations,
  };
}

/** Simultaneous signed effects with bounded donors/recipients among supplied eligible parties. */
export function transferPrototype(base: number[], effects: number[], capPoints = 3): number[] {
  return apportionPrototype(
    base.reduce((a, b) => a + b, 0),
    prototypeTransferTargets(base, effects, capPoints)
  );
}

/** Fractional targets for hosts that carry sub-vote remainders between future batches. */
export function prototypeTransferTargets(
  base: number[],
  effects: number[],
  capPoints = 3
): number[] {
  base.forEach(integer);
  if (
    base.length !== effects.length ||
    effects.some((v) => !Number.isFinite(v)) ||
    !Number.isFinite(capPoints) ||
    capPoints < 0 ||
    capPoints > 100
  )
    throw new Error("Invalid effect");
  const total = base.reduce((a, b) => a + b, 0);
  if (!total) return [...base];
  const deltas = effects.map((v, i) =>
    Math.max(
      -base[i],
      Math.min(total - base[i], (total * Math.max(-capPoints, Math.min(capPoints, v))) / 100)
    )
  );
  // Balance simultaneous requests using available bounded counterparty room.
  // First use parties requesting the opposite direction (or no action), then
  // reduce requested effects if those counterparties cannot supply enough.
  for (const preferred of [true, false]) {
    const net = deltas.reduce((a, b) => a + b, 0);
    if (Math.abs(net) < 1e-9) break;
    const room = base.map((v, i) => {
      if ((!v && effects[i] <= 0) || (preferred && (net > 0 ? effects[i] > 0 : effects[i] < 0)))
        return 0;
      return Math.max(
        0,
        net > 0
          ? deltas[i] + Math.min(v, (total * capPoints) / 100)
          : Math.min(total - v, (total * capPoints) / 100) - deltas[i]
      );
    });
    const sum = room.reduce((a, b) => a + b, 0);
    if (sum) {
      const amount = Math.min(Math.abs(net), sum) * Math.sign(net);
      for (let i = 0; i < deltas.length; i++) deltas[i] -= (amount * room[i]) / sum;
    }
  }
  return base.map((v, i) => Math.max(0, v + deltas[i]));
}

export function countPrototypeDistricts(
  spots: readonly PrototypeSpot[],
  ballots: readonly number[][],
  partyIds: readonly string[]
) {
  unique([...partyIds]);
  if (
    !partyIds.length ||
    ballots.length !== spots.length ||
    ballots.some((r) => r.length !== partyIds.length)
  )
    throw new Error("Invalid result dimensions");
  ballots.forEach((r) => r.forEach(integer));
  const districts: Record<string, number[]> = Object.create(null);
  spots.forEach((spot, i) => {
    const row = (districts[spot.districtId] ??= partyIds.map(() => 0));
    ballots[i].forEach((votes, j) => {
      row[j] += votes;
    });
  });
  return Object.entries(districts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, votes]) => {
      const maximum = Math.max(...votes);
      const leaders = partyIds.filter((_, j) => votes[j] === maximum);
      return { id, votes, winner: maximum > 0 && leaders.length === 1 ? leaders[0] : null };
    });
}

/** Apply an evidence residual after removing the statewide wave; unsupported observations leave baseline unchanged. */
export function blendPrototypeEvidence(
  rows: { id: string; baselineShare: number; observedShare: number | null; weight: number }[],
  weight: number,
  maxResidualPoints = 10
) {
  if (
    !Number.isFinite(weight) ||
    weight < 0 ||
    weight > 1 ||
    !Number.isFinite(maxResidualPoints) ||
    maxResidualPoints < 0
  )
    throw new Error("Invalid evidence weight");
  unique(rows.map((r) => r.id));
  for (const r of rows)
    if (
      !Number.isFinite(r.weight) ||
      r.weight < 0 ||
      !Number.isFinite(r.baselineShare) ||
      r.baselineShare < 0 ||
      r.baselineShare > 1 ||
      (r.observedShare !== null &&
        (!Number.isFinite(r.observedShare) || r.observedShare < 0 || r.observedShare > 1))
    )
      throw new Error("Invalid evidence row");
  const covered = rows.filter((r) => r.observedShare !== null && r.weight > 0);
  const denominator = covered.reduce((s, r) => s + r.weight, 0);
  const wave = denominator
    ? covered.reduce((s, r) => s + r.weight * (r.observedShare! - r.baselineShare), 0) / denominator
    : 0;
  const cap = maxResidualPoints / 100;
  return {
    wavePoints: 100 * wave,
    rows: rows.map((r) => ({
      ...r,
      blendedShare:
        r.observedShare === null
          ? r.baselineShare
          : Math.max(
              0,
              Math.min(
                1,
                r.baselineShare +
                  weight * Math.max(-cap, Math.min(cap, r.observedShare - r.baselineShare - wave))
              )
            ),
    })),
  };
}
