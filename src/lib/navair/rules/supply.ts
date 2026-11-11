import type { CountryId } from "@/lib/constants/countries";
import type { RegionCode } from "@/lib/military/types";
import { homeRegionOf } from "@/lib/military/regionTopology";
import { MILITARY_BRANCHES_BY_COUNTRY } from "@/lib/constants/military";
import type { BlocLookup } from "@/lib/military/bloc";
import { basingStatus, overcrowdPenalty } from "../basing";
import { berthCostOf } from "../engineCore";
import * as M from "../map";
import * as R from "../config";
import type { NavairUnit } from "../types";

export type BaseDomain = "naval" | "air";
export type SupplyUnit = Pick<
  NavairUnit,
  "countryId" | "domain" | "type" | "integrity" | "mission" | "station"
>;
export interface BasingAgreement {
  /** Deterministic primary key, one offer per host, guest and service. */
  _id: string;
  host: CountryId;
  guest: CountryId;
  domain: BaseDomain;
  status: "offered" | "active" | "revoked";
  updatedTurn: number;
}
export interface SupplyContext {
  blocs: BlocLookup;
  enemies: Readonly<Record<string, readonly string[]>>;
  agreements: readonly BasingAgreement[];
}
export interface SupplyAdvice {
  supply: number;
  base: string;
  host: CountryId | null;
  access: "Home" | "Agreed access" | "Neutral" | "Hostile";
  capacity: number;
  sharedCapacity: number;
  ownDemand: number;
  demand: number;
  distancePenalty: number;
  terrainPenalty: number;
  crowdingPenalty: number;
  hostilePenalty: number;
  airliftBonus: number;
}

// A strategic region represents a network of ports, not one pier. Nine port-rating
// points support 27 berth units, enough for the reported 26-berth home fleet.
export const BERTHS_PER_PORT_RATING = 3;

export function agreementId(host: string, guest: string, domain: BaseDomain): string {
  return `${host}:${guest}:${domain}`;
}

export function canHostBase(host: CountryId, domain: BaseDomain): boolean {
  const region = M.region(homeRegionOf(host) ?? "");
  if (domain === "air") return (region?.air ?? 0) > 0;
  const branches = MILITARY_BRANCHES_BY_COUNTRY[host];
  // Countries without an authored military roster still have their region's
  // infrastructure. An explicitly landlocked roster cannot offer naval bases.
  return (
    (region?.port ?? 0) > 0 && (!branches || branches.some((branch) => branch.domain === "naval"))
  );
}

/** Both parties participate: the host offers, the guest accepts, either revokes. */
export function agreementTransition(
  current: BasingAgreement | null,
  actor: CountryId,
  host: CountryId,
  guest: CountryId,
  domain: BaseDomain,
  action: "offer" | "accept" | "revoke",
  turn: number,
  enemies: readonly string[]
): BasingAgreement {
  if (host === guest || (actor !== host && actor !== guest))
    throw new Error("Invalid basing parties.");
  if (current && (current.host !== host || current.guest !== guest || current.domain !== domain)) {
    throw new Error("The basing offer does not match these parties and service.");
  }
  if (action !== "revoke" && !canHostBase(host, domain))
    throw new Error("The host has no bases for this service.");
  if (action !== "revoke" && enemies.includes(actor === host ? guest : host)) {
    throw new Error("Basing access cannot be agreed between enemies.");
  }
  if (action === "offer" && (actor !== host || current?.status === "active")) {
    throw new Error("Only the host can offer inactive basing access.");
  }
  if (action === "accept" && (actor !== guest || current?.status !== "offered")) {
    throw new Error("Only the guest can accept an outstanding offer.");
  }
  if (action === "revoke" && !current) throw new Error("There is no basing agreement to revoke.");
  return {
    _id: agreementId(host, guest, domain),
    host,
    guest,
    domain,
    status: action === "offer" ? "offered" : action === "accept" ? "active" : "revoked",
    updatedTurn: turn,
  };
}

/** Pure shared turn/preview calculation. No queries, and no implicit allied basing. */
export function planSupply(units: readonly SupplyUnit[], context: SupplyContext): SupplyAdvice[] {
  const distances = new Map<string, number>();
  const distance = (from: string, to: string, naval: boolean) => {
    if (from === to) return 0; // Withdrawn ships may mend in their home land-region port.
    const key = `${from}:${to}:${naval}`;
    if (!distances.has(key))
      distances.set(key, naval ? M.navalDistance(from, to) : M.distance(from, to));
    return distances.get(key)!;
  };
  const bases = new Map<
    string,
    {
      id: RegionCode;
      host: CountryId | null;
      access: SupplyAdvice["access"];
      hops: number;
      factor: number;
    }
  >();
  const selected = units.map((unit) => {
    const station = unit.station ?? homeRegionOf(unit.countryId) ?? "noa";
    const key = `${unit.countryId}:${unit.domain}:${station}`;
    if (!bases.has(key)) {
      const naval = unit.domain === "naval";
      const home = homeRegionOf(unit.countryId);
      const enemies = new Set(context.enemies[unit.countryId] ?? []);
      const status = basingStatus(station, unit.countryId, context.blocs, enemies);
      // An offshore operating area may draw from a nearby authorized coastal base.
      // Otherwise its local, neutral/hostile anchorage remains a fallback.
      let best = {
        id: station,
        host: null as CountryId | null,
        access: (status === "hostile" ? "Hostile" : "Neutral") as SupplyAdvice["access"],
        hops: home ? distance(home, station, naval) : 0,
        factor: R.BASING_FACTOR[status],
      };
      const hosts: Array<{ id: RegionCode; own: boolean; country: CountryId }> = home
        ? [{ id: home, own: true, country: unit.countryId }]
        : [];
      for (const a of context.agreements) {
        if (
          a.status !== "active" ||
          a.guest !== unit.countryId ||
          a.domain !== unit.domain ||
          !canHostBase(a.host, a.domain) ||
          enemies.has(a.host)
        )
          continue;
        const id = homeRegionOf(a.host);
        if (id && (naval ? (M.region(id)?.port ?? 0) > 0 : (M.region(id)?.air ?? 0) > 0))
          hosts.push({ id, own: false, country: a.host });
      }
      for (const host of hosts) {
        const hops = distance(host.id, station, naval);
        // Home ports can serve adjacent seas; overseas bases support deployments
        // at distance, but distant ports cannot donate their berths to an ocean.
        if (naval && hops > 1) continue;
        const factor = host.own ? 1 : R.BASING_FACTOR.allied;
        const capacity = (M.region(host.id)?.port ?? 0) * factor;
        const bestCapacity = (M.region(best.id)?.port ?? 0) * best.factor;
        if (
          hops < best.hops ||
          (hops === best.hops && capacity > bestCapacity) ||
          (hops === best.hops && host.own && best.access !== "Home")
        ) {
          best = {
            id: host.id,
            host: host.country,
            access: host.own ? "Home" : "Agreed access",
            hops,
            factor,
          };
        }
      }
      bases.set(key, best);
    }
    return bases.get(key)!;
  });
  const loads = new Map<string, number>();
  const nationalLoads = new Map<string, number>();
  const poolOf = (base: (typeof selected)[number]) =>
    base.host ? `base:${base.host}` : `anchorage:${base.id}`;
  units.forEach((u, i) => {
    if (u.domain !== "naval" || (u.integrity ?? 100) <= 0) return;
    const base = poolOf(selected[i]);
    const demand = berthCostOf(u.type);
    loads.set(base, (loads.get(base) ?? 0) + demand);
    const key = `${base}:${u.countryId}`;
    nationalLoads.set(key, (nationalLoads.get(key) ?? 0) + demand);
  });
  const liftStations = new Map<string, Set<string>>();
  for (const u of units) {
    if (
      u.domain !== "air" ||
      u.type !== "Airlift Wing" ||
      u.mission !== "AIRLIFT" ||
      !u.station ||
      (u.integrity ?? 100) <= 0
    )
      continue;
    const stations = liftStations.get(u.countryId) ?? new Set<string>();
    for (const r of M.within(u.station, 1)) stations.add(r);
    liftStations.set(u.countryId, stations);
  }
  return units.map((u, i) => {
    const b = selected[i];
    const station = u.station ?? homeRegionOf(u.countryId) ?? b.id;
    const physicalCapacity = (M.region(b.id)?.port ?? 0) * BERTHS_PER_PORT_RATING;
    const capacity = physicalCapacity * b.factor;
    const pool = poolOf(b);
    const demand = loads.get(pool) ?? 0;
    const naval = u.domain === "naval";
    // Aircraft do not consume naval berths. All visiting navies share the same
    // physical port network instead of each receiving a duplicate capacity pool.
    const crowdingPenalty = naval
      ? Math.max(
          overcrowdPenalty(demand, physicalCapacity),
          overcrowdPenalty(nationalLoads.get(`${pool}:${u.countryId}`) ?? 0, capacity)
        )
      : 0;
    const hops = Number.isFinite(b.hops) ? b.hops : 4;
    const distancePenalty = hops * R.SUPPLY_PER_HOP;
    const terrainPenalty = R.LOGI_PENALTY[M.region(station)?.logi ?? "Medium"];
    const hostileStation =
      basingStatus(
        station,
        u.countryId,
        context.blocs,
        new Set(context.enemies[u.countryId] ?? [])
      ) === "hostile";
    const hostilePenalty =
      hostileStation && !(b.access === "Agreed access" && b.hops === 0) ? R.SUPPLY_PER_HOP : 0;
    const airliftBonus = liftStations.get(u.countryId)?.has(station) ? R.AIRLIFT_SUPPLY_BONUS : 0;
    return {
      supply: Math.max(
        R.MIN_SUPPLY,
        Math.min(
          100,
          100 - distancePenalty - terrainPenalty - crowdingPenalty - hostilePenalty + airliftBonus
        )
      ),
      base: b.id,
      host: b.host,
      access: b.access,
      capacity,
      sharedCapacity: physicalCapacity,
      ownDemand: nationalLoads.get(`${pool}:${u.countryId}`) ?? 0,
      demand,
      distancePenalty,
      terrainPenalty,
      crowdingPenalty,
      hostilePenalty,
      airliftBonus,
    };
  });
}
