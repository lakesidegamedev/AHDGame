import { ObjectId, type Db } from "mongodb";
import { decodeReceipt } from "@/lib/market/producerMarket/receiptStorage";
import type { ProducerTradeReceipt } from "@/lib/market/producerMarket/producerQuotes";
import { producerEconomyTurnsCollection } from "@/lib/db/repositories/producerEconomyTurns";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { statesCollection } from "@/lib/db/repositories/states";
import { companyFlows, producerSiteId } from "./rules/flows";
import type { SupplyChainData, SupplyChainParty, SupplyChainSite } from "./types";

interface StoredTurn {
  _id: string;
  worldEpoch: string;
  turn: number;
  digest: string;
  payload: string;
}
interface ReceiptView {
  version: number;
  worldEpoch: string;
  turn: number;
  createdAt: string;
  targets: { producerId: string; corporationId: string; plantType: { sectorType: string } }[];
  receipt: ProducerTradeReceipt;
}
const cached = new WeakMap<Db, Map<string, SupplyChainData>>();
const empty = (): SupplyChainData => ({
  turn: null,
  settledAt: null,
  sites: [],
  parties: [],
  states: {},
  flows: [],
});

export function marketParty(id: string): SupplyChainParty {
  try {
    const scope: unknown = JSON.parse(id);
    if (Array.isArray(scope)) {
      const kind = scope[1];
      if (kind === "households") return { id, name: "Households", kind: "households" };
      if (kind === "publicBuyer") return { id, name: "Government procurement", kind: "government" };
      if (kind === "investmentBuyer")
        return { id, name: "Construction and investment", kind: "investment" };
      if (kind === "backgroundEconomy")
        return { id, name: "Background economy (countries without companies)", kind: "background" };
      if (kind === "wideEconomy") return { id, name: "Background economy", kind: "background" };
      if (kind === "operatingPayee") return { id, name: "Operating services", kind: "other" };
    }
  } catch {
    /* Corporate account ids are not JSON wallet scopes. */
  }
  return {
    id,
    name: /^[a-f0-9]{24}$/i.test(id) ? "Former corporation" : "Other market participant",
    kind: "other",
  };
}

type CurrentSector = {
  _id: ObjectId;
  sectorType: string;
  countryId?: string;
  stateId?: string;
};

async function readCompany(
  db: Db,
  record: StoredTurn,
  corporationId: string,
  current: readonly CurrentSector[]
): Promise<SupplyChainData> {
  const stored = await producerEconomyTurnsCollection<StoredTurn>(db).findOne(
    { _id: record._id, digest: record.digest, status: "settled" },
    { projection: { payload: 1, digest: 1 } }
  );
  if (!stored) throw new Error("Settled supply-chain receipt is unavailable");
  const view = (await decodeReceipt(db, stored, (root) => {
    const frozen = root as {
      version: number;
      worldEpoch: string;
      createdAt: string;
      request: { turn: number };
      targets: ReceiptView["targets"];
      result: { tradeReceipt: ProducerTradeReceipt };
    };
    return {
      version: frozen.version,
      worldEpoch: frozen.worldEpoch,
      createdAt: frozen.createdAt,
      turn: frozen.request.turn,
      targets: frozen.targets,
      receipt: frozen.result.tradeReceipt,
    };
  })) as ReceiptView;
  if (
    view.version !== 1 ||
    view.worldEpoch !== record.worldEpoch ||
    view.turn !== record.turn ||
    view.receipt.turn !== record.turn ||
    !Array.isArray(view.targets) ||
    !Array.isArray(view.receipt.offers) ||
    !Array.isArray(view.receipt.orders) ||
    !Array.isArray(view.receipt.fills)
  )
    throw new Error("Invalid supply-chain receipt");
  const locations = new Map<string, { countryId?: string; stateId?: string }>();
  const locate = (
    entries: readonly { id: string; accountId: string; countryId?: string; stateId?: string }[]
  ) => {
    for (const entry of entries) {
      if (entry.accountId !== corporationId) continue;
      const id = producerSiteId(entry.id);
      if (id) locations.set(id, entry);
    }
  };
  locate(view.receipt.offers);
  locate(view.receipt.orders);
  const sites = new Map<string, SupplyChainSite>(
    current.map((s) => [
      s._id.toString(),
      {
        id: s._id.toString(),
        countryId: s.countryId ?? "",
        stateId: s.stateId ?? "",
        sectorType: s.sectorType,
      },
    ])
  );
  for (const target of view.targets) {
    if (target.corporationId !== corporationId) continue;
    const location = locations.get(target.producerId);
    const fallback = sites.get(target.producerId);
    sites.set(target.producerId, {
      id: target.producerId,
      countryId: location?.countryId ?? fallback?.countryId ?? "",
      stateId: location?.stateId ?? fallback?.stateId ?? "",
      sectorType: target.plantType.sectorType,
    });
  }
  const flows = companyFlows(view.receipt, corporationId, [...sites.values()]);
  const accounts = [...new Set(flows.map((f) => f.counterpartyId))];
  const ids = accounts.filter((id) => /^[a-f0-9]{24}$/i.test(id)).map((id) => new ObjectId(id));
  const companies = ids.length
    ? await corporationsCollection(db)
        .find({ _id: { $in: ids } }, { projection: { _id: 1, name: 1, sequentialId: 1 } })
        .toArray()
    : [];
  const names = new Map<string, SupplyChainParty>(
    companies.map((c) => [
      c._id.toString(),
      {
        id: c._id.toString(),
        name: c.name,
        kind: "corporation",
        href: `/corporation/${c.sequentialId ?? c._id.toString()}`,
      },
    ])
  );
  const states = [
    ...new Set(
      [...sites.values()].map((s) => s.stateId).concat(flows.map((f) => f.counterpartyState))
    ),
  ].filter(Boolean);
  const stateRows = states.length
    ? await statesCollection(db)
        .find({ _id: { $in: states } }, { projection: { _id: 1, name: 1 } })
        .toArray()
    : [];
  return {
    turn: record.turn,
    settledAt: view.createdAt,
    sites: [...sites.values()],
    parties: accounts.map((id) => names.get(id) ?? marketParty(id)),
    states: Object.fromEntries(stateRows.map((s) => [s._id, s.name])),
    flows,
  };
}

export async function loadCompanySupplyChain(
  db: Db,
  corporationId: string
): Promise<SupplyChainData> {
  const world = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1, currentTurn: 1 } }
  );
  if (!world?.worldEpochId) return empty();
  const record = await producerEconomyTurnsCollection<StoredTurn>(db).findOne(
    { worldEpoch: world.worldEpochId, status: "settled", turn: { $lte: world.currentTurn } },
    { projection: { _id: 1, worldEpoch: 1, turn: 1, digest: 1 }, sort: { turn: -1 } }
  );
  if (!record) return empty();
  // The company's live sector list changes between settlements, so it is part
  // of the key: a built or abandoned site must show without waiting for a turn.
  const current: CurrentSector[] = await corporateSectorsCollection(db)
    .find(
      { corporationId: new ObjectId(corporationId) },
      { projection: { _id: 1, sectorType: 1, countryId: 1, stateId: 1 } }
    )
    .toArray();
  const siteFingerprint = current
    .map((s) => `${s._id.toString()}:${s.sectorType}:${s.countryId ?? ""}:${s.stateId ?? ""}`)
    .sort();
  const key = JSON.stringify([record.worldEpoch, record.digest, corporationId, siteFingerprint]);
  const cache = cached.get(db) ?? new Map<string, SupplyChainData>();
  cached.set(db, cache);
  const hit = cache.get(key);
  if (hit) return hit;
  const data = await readCompany(db, record, corporationId, current);
  if (data.flows.length <= 5000) {
    if (cache.size >= 4) cache.delete(cache.keys().next().value!);
    cache.set(key, data);
  }
  return data;
}
