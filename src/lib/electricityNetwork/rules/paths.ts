/** Loss-aware grid paths and shared bidirectional capacity, reset for each clearing attempt. */
import { gridZone } from "./network";
import type { ElectricityNetwork, GridLocation, GridPath, GridMarketSummary } from "./types";
export function createGridLedger(network: ElectricityNetwork) {
  const links = new Map(network.links.map((l) => [l.id, l]));
  const remaining = new Map<string, number>();
  const adjacency = new Map<string, { id: string; to: string; loss: number }[]>();
  for (const l of network.links) {
    if (
      remaining.has(l.id) ||
      !Number.isFinite(l.capacity) ||
      l.capacity < 0 ||
      !Number.isFinite(l.loss) ||
      l.loss < 0 ||
      l.loss >= 1 ||
      l.from === l.to
    )
      throw Error("Invalid electricity link");
    remaining.set(l.id, l.capacity);
    for (const [from, to] of [
      [l.from, l.to],
      [l.to, l.from],
    ]) {
      const a = adjacency.get(from) ?? [];
      a.push({ id: l.id, to, loss: l.loss });
      adjacency.set(from, a);
    }
  }
  for (const a of adjacency.values()) a.sort((a, b) => a.id.localeCompare(b.id));
  const used = new Map<string, { dispatched: number; lossUnits: number }>();
  const cache = new Map<string, GridPath | null>();
  let dispatched = 0,
    delivered = 0;
  function path(from: GridLocation, to: GridLocation): GridPath | null {
    const a = gridZone(from),
      b = gridZone(to);
    if (!a || !b) return null;
    if (a === b) return { edges: [], retention: 1 };
    const key = JSON.stringify([a, b]);
    if (cache.has(key)) return cache.get(key)!;
    const best = new Map<string, number>([[a, 1]]);
    const prev = new Map<string, { from: string; id: string; loss: number }>();
    const pending = new Set([a]);
    while (pending.size) {
      let current = "";
      let value = -1;
      for (const n of pending)
        if ((best.get(n) ?? 0) > value) {
          current = n;
          value = best.get(n)!;
        }
      pending.delete(current);
      if (current === b) break;
      for (const edge of adjacency.get(current) ?? []) {
        if (!((remaining.get(edge.id) ?? 0) > 1e-10)) continue;
        const next = value * (1 - edge.loss);
        if (next > (best.get(edge.to) ?? 0) + 1e-12) {
          best.set(edge.to, next);
          prev.set(edge.to, { from: current, id: edge.id, loss: edge.loss });
          pending.add(edge.to);
        }
      }
    }
    if (!best.has(b)) {
      cache.set(key, null);
      return null;
    }
    const backwards: { id: string; loss: number }[] = [];
    for (let n = b; n !== a;) {
      const p = prev.get(n);
      if (!p) throw Error("Invalid electricity path");
      backwards.push(p);
      n = p.from;
    }
    let retention = 1;
    const edges = backwards.reverse().map((e) => {
      const row = { id: e.id, retentionBefore: retention };
      retention *= 1 - e.loss;
      return row;
    });
    const result = { edges, retention };
    cache.set(key, result);
    return result;
  }
  return {
    path,
    remaining,
    capacity(path: GridPath): number {
      let cap = Number.MAX_VALUE;
      for (const e of path.edges)
        cap = Math.min(cap, ((remaining.get(e.id) ?? 0) * path.retention) / e.retentionBefore);
      return cap;
    },
    take(path: GridPath, units: number) {
      if (!Number.isFinite(units) || units < 0) throw Error("Invalid electricity delivery");
      const sent = units / path.retention;
      if (!Number.isFinite(sent) || !(path.retention > 0) || path.retention > 1)
        throw Error("Invalid electricity path");
      const entries = path.edges.map((e) => ({
        id: e.id,
        entry: sent * e.retentionBefore,
        left: remaining.get(e.id) ?? 0,
      }));
      for (const e of entries) {
        if (
          !links.has(e.id) ||
          !Number.isFinite(e.entry) ||
          e.entry < 0 ||
          e.entry > e.left + Math.max(1e-9, e.left * 1e-10)
        )
          throw Error("Electricity link capacity exceeded");
      }
      let invalidate = false;
      for (const { id, entry, left } of entries) {
        remaining.set(id, Math.max(0, left - entry));
        const l = links.get(id)!;
        const row = used.get(id) ?? { dispatched: 0, lossUnits: 0 };
        row.dispatched += entry;
        row.lossUnits += entry * l.loss;
        used.set(id, row);
        if (left > 1e-10 && left - entry <= 1e-10) invalidate = true;
      }
      if (invalidate) cache.clear();
      dispatched += sent;
      delivered += units;
      return sent;
    },
    summary(): GridMarketSummary {
      return {
        dispatched,
        delivered,
        losses: Math.max(0, dispatched - delivered),
        lines: network.links.map((l) => ({
          id: l.id,
          capacity: l.capacity,
          dispatched: used.get(l.id)?.dispatched ?? 0,
          lossUnits: used.get(l.id)?.lossUnits ?? 0,
        })),
      };
    },
  };
}
export function weightedShares(
  weights: readonly number[],
  limits: readonly (readonly { id: string; coefficient: number; capacity: number }[])[]
): number[] {
  if (weights.length !== limits.length || weights.some((w) => !Number.isFinite(w) || w < 0))
    throw Error("Invalid grid allocation weights");
  const demand = new Map<string, number>(),
    capacity = new Map<string, number>();
  limits.forEach((rows, i) => {
    for (const r of rows) {
      if (
        !Number.isFinite(r.coefficient) ||
        r.coefficient < 0 ||
        r.capacity < 0 ||
        Number.isNaN(r.capacity)
      )
        throw Error("Invalid grid allocation limit");
      demand.set(r.id, (demand.get(r.id) ?? 0) + weights[i] * r.coefficient);
      capacity.set(r.id, Math.min(capacity.get(r.id) ?? Infinity, r.capacity));
    }
  });
  return weights.map((wanted, i) => {
    let factor = 1;
    for (const r of limits[i]) {
      const total = demand.get(r.id) ?? 0;
      if (total > 0) factor = Math.min(factor, (capacity.get(r.id) ?? 0) / total);
    }
    return Math.max(0, wanted * Math.min(1, factor));
  });
}
