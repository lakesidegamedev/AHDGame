import { createHash } from "node:crypto";
import { ZOD_CURRENCY_ENUM } from "@/lib/constants/currencies";
import { accountId } from "@/lib/ledger/accounts";
import type { LedgerEntry } from "@/lib/ledger/types";
/** Freeze a complete turn before moving cash, then publish replayable absolute receipts. */
import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types/corporation";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { encodeReceipt, decodeReceipt, stageReceiptChunks } from "./receiptStorage";
import { verifyOpeningProducerPayables, publishProducerPayables } from "./payablesSettlement";
import { producerPayableReceiptKeys, type ProducerPayable } from "./payablesRules";
import { advanceProducerCapacity, type ProducerCapacityState } from "./capacityRules";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { advanceProducerEconomy } from "./production";
import { scopeNeutralBook } from "./shadowCarryRules";
import { producerCashTransition, type ProducerCashBinding } from "./cashSettlementRules";

type EconomyInput = Parameters<typeof advanceProducerEconomy>[0];
export type EconomyResult = ReturnType<typeof advanceProducerEconomy>;
type ProducerTurnProduction = Omit<EconomyInput, "producers"> & {
  /** The shell derives capacity from owned stock and paid construction. */
  producers: readonly Omit<EconomyInput["producers"][number], "capacityUnits">[];
};

export interface ProducerSectorTarget {
  producerId: string;
  sectorId: string;
  corporationId: string;
  capacity: ProducerCapacityState;
  operatingRecipeRatio: number;
  recessionCapacityFactor: number;
  plantType: Pick<
    CorporateSector,
    "sectorType" | "industryModel" | "mediaDiscriminator" | "strategyId"
  >;
}

interface FrozenProducerTurn {
  version: 1;
  createdAt: string;
  worldEpoch: string;
  request: EconomyInput;
  bindings: readonly ProducerCashBinding[];
  targets: readonly ProducerSectorTarget[];
  capacities: Array<{ producerId: string; closing: ReturnType<typeof advanceProducerCapacity> }>;
  result: SettledEconomyResult;
}

interface ProducerTurnRecord {
  _id: string;
  worldEpoch: string;
  turn: number;
  digest: string;
  payload: string;
  status: "frozen" | "settled";
  /**
   * Turn warnings observed while settling (ownership drift). Stored beside the
   * receipt so a retry after the turn is marked settled returns the same list.
   */
  settlementWarnings?: string[];
}

async function readFrozen(db: Db, record: ProducerTurnRecord): Promise<FrozenProducerTurn> {
  const payload = (await decodeReceipt(db, record)) as FrozenProducerTurn;
  if (
    payload.version !== 1 ||
    payload.worldEpoch !== record.worldEpoch ||
    payload.request.turn !== record.turn
  )
    throw new Error("Producer receipt identity mismatch");
  return payload;
}

function cashWithLedger(payload: FrozenProducerTurn, receiptDigest: string) {
  const transition = producerCashTransition({
    worldEpoch: payload.worldEpoch,
    turn: payload.request.turn,
    opening: payload.request.accounts,
    closing: payload.result.accounts,
    bindings: payload.bindings,
    receiptDigest,
  });
  const opening = new Map(payload.request.accounts.map((account) => [account.id, account.cash]));
  const closing = new Map(payload.result.accounts.map((account) => [account.id, account.cash]));
  const ledgerLegs: LedgerEntry["legs"] = [];
  for (const binding of payload.bindings) {
    const currency = ZOD_CURRENCY_ENUM.find((code) => code === binding.currency);
    if (!currency) throw new Error("Producer settlement requires a native ledger currency");
    const change = closing.get(binding.accountId)! - opening.get(binding.accountId)!;
    if (change === 0) continue;
    ledgerLegs.push({
      account:
        binding.kind === "corporation"
          ? accountId("corporation", binding.corporationId, currency)
          : accountId("economy_wallet", binding.economyAccountId, currency),
      amount: change * binding.localPerAnchor,
      currencyCode: currency,
      anchorAmount: change,
      role: "primary",
    });
  }
  const bindingsByAccount = new Map(
    payload.bindings.map((binding) => [binding.accountId, binding])
  );
  const payableMeta: Record<string, number | string> = {};
  for (const payment of payload.result.payablePayments) {
    const binding = bindingsByAccount.get(payment.debtorAccountId)!;
    if (binding.kind !== "corporation") continue;
    const keys = producerPayableReceiptKeys(binding.corporationId);
    const paid = Number(payableMeta[keys.amount] ?? 0) + payment.amount * binding.localPerAnchor;
    if (!Number.isFinite(paid)) throw new Error("Producer payable native payment overflow");
    payableMeta[keys.amount] = paid;
    payableMeta[keys.currency] = binding.currency;
  }
  transition.event.meta = { ...transition.event.meta, ...payableMeta };
  const createdAt = new Date(payload.createdAt);
  if (!Number.isFinite(createdAt.getTime())) throw new Error("Invalid producer receipt time");
  if (ledgerLegs.length) {
    const entry: LedgerEntry = {
      _id: new ObjectId(
        createHash("sha256").update(`${transition.key}:ledger`).digest("hex").slice(0, 24)
      ),
      turn: payload.request.turn,
      createdAt,
      txType: "producer_market_settlement",
      legs: ledgerLegs,
      balanced: true,
      emitSite: "producerMarket/settlement",
    };
    transition.projections.push({
      collection: "ledgerEntries",
      insert: { ...entry },
      note: "Complete producer cash witness, all balance changes are primary",
    });
  }
  return transition;
}

function validateTargets(payload: FrozenProducerTurn): void {
  const plans = new Map(payload.request.producers.map((p) => [p.id, p]));
  const bindings = new Map(payload.bindings.map((binding) => [binding.accountId, binding]));
  const sectors = new Set<string>();
  const producers = new Set<string>();
  const capacities = new Map(payload.capacities.map((row) => [row.producerId, row.closing]));
  for (const target of payload.targets) {
    const plan = plans.get(target.producerId);
    const binding = plan && bindings.get(plan.accountId);
    if (
      !plan ||
      !binding ||
      binding.kind !== "corporation" ||
      binding.corporationId !== target.corporationId ||
      !/^[a-f0-9]{24}$/i.test(target.sectorId) ||
      !/^[a-f0-9]{24}$/i.test(target.corporationId) ||
      sectors.has(target.sectorId) ||
      producers.has(target.producerId)
    )
      throw new Error("Invalid producer receipt target");
    const physical = capacities.get(target.producerId);
    if (
      !physical ||
      physical.state.completedTurn !== payload.request.turn ||
      plan.capacityUnits !== physical.capacityUnits
    )
      throw new Error("Producer plan differs from frozen physical capacity");
    sectors.add(target.sectorId);
    producers.add(target.producerId);
  }
  if (producers.size !== plans.size) throw new Error("Missing producer receipt target");
  if (capacities.size !== plans.size || payload.capacities.length !== plans.size)
    throw new Error("Invalid frozen physical capacity targets");
}

function physicalImage(state: ProducerCapacityState) {
  return {
    capitalStock: state.ownedDailyUnits,
    capacityBookAnchor: state.paidBookAnchor,
    buildQueue: [...state.buildQueue],
  };
}

function samePhysicalImage(sector: CorporateSector, state: ProducerCapacityState): boolean {
  return (
    sector.capitalStock === state.ownedDailyUnits &&
    sector.capacityBookAnchor === state.paidBookAnchor &&
    JSON.stringify(sector.buildQueue) === JSON.stringify(state.buildQueue)
  );
}

function physicalWrite(
  target: ProducerSectorTarget,
  closing: ReturnType<typeof advanceProducerCapacity>
) {
  const whole = closing.state.wholePlants;
  return {
    ...physicalImage(closing.state),
    ...(whole
      ? {
          plantCount: Math.round(closing.state.ownedDailyUnits / whole.plantUnits),
          plantUnitRemainder: whole.creditUnits,
          plantWearUnits: whole.wearUnits,
        }
      : seedPlantLedger(target.plantType, closing.state.ownedDailyUnits)),
    constructionInProgressAnchor: closing.constructionInProgressAnchor,
  };
}

function inventoryImages(frozen: FrozenProducerTurn, closing: boolean) {
  const producers = closing ? frozen.result.producers : frozen.request.producers;
  return new Map(
    producers.map((producer) => [
      producer.id,
      {
        worldEpoch: frozen.worldEpoch,
        turn: frozen.request.turn - (closing ? 0 : 1),
        inputStock: [...producer.inputStock],
        outputStock: [...producer.outputStock],
      },
    ])
  );
}

/** An inventory image as JSON, with country-scoped books made comparable (scopeNeutralBook). */
function comparableInventory(image: unknown): string {
  return JSON.stringify(image, (key, value) =>
    key === "book" || !value || typeof value !== "object" || Array.isArray(value)
      ? value
      : typeof value.book === "string" && typeof value.commodity === "string"
        ? { ...value, book: scopeNeutralBook(value.book, value.commodity) }
        : value
  );
}

interface PhysicalVerification {
  /** Deterministic turn warnings for sectors whose owner drifted after the plan froze. */
  turnWarnings: string[];
  /** Frozen corporation account -> the corporation account that receives its cash. */
  cashRedirect: Map<string, string>;
  /**
   * The stored opening inventory of a producer whose image matched the plan's
   * only after scopeNeutralBook. The receipt write must match what is stored.
   */
  storedOpeningInventory: Map<string, unknown>;
}

async function verifyPhysicalTargets(
  db: Db,
  frozen: FrozenProducerTurn
): Promise<PhysicalVerification> {
  const turn = frozen.request.turn;
  // Projected reads verify all sectors and the corporations that own them now
  // before any cash lands. The ownership read follows the sector read because
  // a mid-turn transfer can name a corporation the plan never saw.
  const sectors = db.collection<CorporateSector>("corporateSectors");
  const existing = await sectors
    .find(
      { _id: { $in: frozen.targets.map((t) => new ObjectId(t.sectorId)) } },
      {
        projection: {
          _id: 1,
          corporationId: 1,
          "producerSettlement.worldEpoch": 1,
          "producerSettlement.turn": 1,
          capitalStock: 1,
          capacityBookAnchor: 1,
          buildQueue: 1,
          producerCapacity: 1,
          sectorType: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          producerInventory: 1,
        },
      }
    )
    .toArray();
  const byId = new Map(existing.map((sector) => [sector._id.toHexString(), sector]));
  const corporationIds = [
    ...new Set([
      ...frozen.targets.map((target) => target.corporationId),
      ...existing.map((sector) => sector.corporationId.toHexString()),
    ]),
  ];
  const corporations = await db
    .collection<Corporation>("corporations")
    .find(
      { _id: { $in: corporationIds.map((id) => new ObjectId(id)) } },
      { projection: { _id: 1 } }
    )
    .toArray();
  const existingCorporations = new Set(corporations.map((corp) => corp._id.toHexString()));
  const capacities = new Map(frozen.capacities.map((row) => [row.producerId, row.closing]));
  const openingInventories = inventoryImages(frozen, false);
  const closingInventories = inventoryImages(frozen, true);
  const turnWarnings: string[] = [];
  const storedOpeningInventory = new Map<string, unknown>();
  const ownersByFrozenOwner = new Map<string, Set<string>>();
  for (const target of frozen.targets) {
    const sector = byId.get(target.sectorId);
    const prior = sector?.producerSettlement;
    if (!sector || (prior && (prior.worldEpoch !== frozen.worldEpoch || prior.turn > turn)))
      throw new Error(
        `Producer receipt generation changed: sector ${target.sectorId} ${
          !sector
            ? "is missing"
            : `carries receipt ${prior?.worldEpoch}:${prior?.turn} at turn ${turn}`
        }`
      );
    const currentOwner = sector.corporationId.toHexString();
    const owners = ownersByFrozenOwner.get(target.corporationId) ?? new Set<string>();
    owners.add(currentOwner);
    ownersByFrozenOwner.set(target.corporationId, owners);
    if (currentOwner !== target.corporationId) {
      // Ownership drift is not a settlement error. The plan froze this turn's
      // cash with the corporation that owned the sector then, and the physical
      // receipt belongs to the sector document, which is keyed by id. The new
      // owner takes over from the next turn, so spin-offs, sales and takeovers
      // never block the turn.
      turnWarnings.push(
        `producer settlement booked sector ${target.sectorId} for frozen owner ${target.corporationId}, now owned by ${currentOwner}`
      );
    }
    const state = prior?.turn === turn ? capacities.get(target.producerId)!.state : target.capacity;
    if (
      sector.producerCapacity?.worldEpoch !== frozen.worldEpoch ||
      sector.producerCapacity.turn !== state.completedTurn ||
      !samePhysicalImage(sector, state)
    )
      throw new Error("Producer physical opening changed or was not reconciled");
    if (
      comparableInventory(sector.producerInventory) !==
      comparableInventory(
        (prior?.turn === turn ? closingInventories : openingInventories).get(target.producerId)
      )
    )
      throw new Error("Producer inventory opening changed or was not reconciled");
    if (
      prior?.turn !== turn &&
      JSON.stringify(sector.producerInventory) !==
        JSON.stringify(openingInventories.get(target.producerId))
    )
      storedOpeningInventory.set(target.producerId, sector.producerInventory);
    if (
      sector.sectorType !== target.plantType.sectorType ||
      (sector.industryModel ?? null) !== (target.plantType.industryModel ?? null) ||
      (sector.mediaDiscriminator ?? null) !== (target.plantType.mediaDiscriminator ?? null)
    )
      throw new Error("Producer physical plant type changed");
  }
  const cashRedirect = new Map<string, string>();
  for (const [frozenOwner, currentOwners] of ownersByFrozenOwner) {
    if (existingCorporations.has(frozenOwner)) continue;
    // The frozen owner is gone, so its credit has no account to land in. The
    // producer market has no treasury or write-off fallback for a dissolved
    // owner, so book the turn's cash to the corporation that holds the sectors
    // now. That only works when every one of its sectors moved to one
    // corporation that is already settling this turn; otherwise the cash has
    // nowhere to go and the turn must still stop.
    if (currentOwners.size !== 1)
      throw new Error(`Dissolved producer owner ${frozenOwner} has no single cash target`);
    const currentOwner = [...currentOwners][0];
    const frozenBinding = frozen.bindings.find(
      (binding) => binding.kind === "corporation" && binding.corporationId === frozenOwner
    );
    const currentBinding = frozen.bindings.find(
      (binding) => binding.kind === "corporation" && binding.corporationId === currentOwner
    );
    if (!currentBinding || !existingCorporations.has(currentOwner))
      throw new Error(`Dissolved producer owner ${frozenOwner} has nowhere to book its cash`);
    if (frozenBinding) cashRedirect.set(frozenBinding.accountId, currentBinding.accountId);
  }
  return { turnWarnings, cashRedirect, storedOpeningInventory };
}

/**
 * Retarget the frozen owner's account balance change at the account that now
 * owns its sectors. Opening balances are untouched, so the corporation write
 * guard still sees the current owner's stored cash; only the closing change
 * moves. Payables follow the same debtor so no claim is dropped.
 */
function redirectFrozenOwnerCash(
  frozen: FrozenProducerTurn,
  cashRedirect: ReadonlyMap<string, string>
): FrozenProducerTurn {
  if (cashRedirect.size === 0) return frozen;
  const opening = new Map(frozen.request.accounts.map((account) => [account.id, account.cash]));
  const closing = new Map(frozen.result.accounts.map((account) => [account.id, account.cash]));
  const changes = new Map<string, number>();
  for (const [from, to] of cashRedirect) {
    const change = closing.get(from)! - opening.get(from)!;
    changes.set(to, (changes.get(to) ?? 0) + change);
  }
  const accounts = (
    rows: readonly { id: string; cash: number }[],
    applyChange: boolean
  ): { id: string; cash: number }[] =>
    rows
      .filter((row) => !cashRedirect.has(row.id))
      .map((row) =>
        applyChange ? { ...row, cash: row.cash + (changes.get(row.id) ?? 0) } : { ...row }
      );
  const claims = (rows: readonly ProducerPayable[]): ProducerPayable[] =>
    rows.map((claim) =>
      cashRedirect.has(claim.debtorAccountId)
        ? { ...claim, debtorAccountId: cashRedirect.get(claim.debtorAccountId)! }
        : claim
    );
  return {
    ...frozen,
    bindings: frozen.bindings.filter((binding) => !cashRedirect.has(binding.accountId)),
    request: {
      ...frozen.request,
      accounts: accounts(frozen.request.accounts, false),
      payables: claims(frozen.request.payables ?? []),
    },
    result: {
      ...frozen.result,
      accounts: accounts(frozen.result.accounts, true),
      payables: claims(frozen.result.payables),
      payablePayments: frozen.result.payablePayments.map((payment) =>
        cashRedirect.has(payment.debtorAccountId)
          ? {
              ...payment,
              debtorAccountId: cashRedirect.get(payment.debtorAccountId)!,
            }
          : payment
      ),
    },
  };
}

export async function assertProducerTurnFence(
  db: Db,
  worldEpoch: string,
  turn: number
): Promise<void> {
  const state = await db
    .collection<{
      _id: string;
      worldEpochId?: string;
      isActive?: boolean;
      isProcessing?: boolean;
      processingKind?: string | null;
      processingTargetTurn?: number;
    }>("gameState")
    .findOne(
      { _id: "current" },
      {
        projection: {
          worldEpochId: 1,
          isActive: 1,
          isProcessing: 1,
          processingKind: 1,
          processingTargetTurn: 1,
        },
      }
    );
  if (
    state?.worldEpochId !== worldEpoch ||
    state.isActive !== true ||
    state.isProcessing !== true ||
    state.processingKind !== "turn" ||
    state.processingTargetTurn !== turn
  )
    throw new Error("Producer settlement requires the matching active turn fence");
}

/**
 * A retry uses the original complete receipt, including its native cash guards.
 * Current prices, policy changes or partially applied cash never re-quote it.
 * This shell is called inside the corporation phase's exclusive turn fence.
 */
/** One closing transfer between two bound accounts, anchor units. */
export interface SettlementCloseTransfer {
  reason: string;
  fromAccountId: string;
  toAccountId: string;
  amountAnchor: number;
}

/** Transfers settled with the market in the same receipt, plus what the caller wants kept. */
export interface SettlementClose {
  transfers: SettlementCloseTransfer[];
  meta?: Record<string, unknown>;
}

export type SettledEconomyResult = EconomyResult & {
  close?: SettlementClose;
  /**
   * Deterministic warnings for sectors that settled with their frozen owner,
   * for the corporation host to forward to the turn warning channel.
   */
  turnWarnings?: string[];
};

/**
 * Apply closing transfers to the settled account balances before the receipt
 * is frozen. Transfers stay between bound accounts and sum to zero, so the
 * settlement still publishes, and witnesses, one balanced set of balance
 * changes: distributions and support land with the market in one write
 * instead of thousands of separate money moves.
 */
export function applySettlementClose(
  result: EconomyResult,
  close: SettlementClose,
  boundAccountIds: ReadonlySet<string>
): SettledEconomyResult {
  const cash = new Map(result.accounts.map((a) => [a.id, a.cash]));
  for (const t of close.transfers) {
    if (!Number.isFinite(t.amountAnchor) || t.amountAnchor < 0)
      throw new Error(`Invalid closing transfer ${t.reason}`);
    if (!boundAccountIds.has(t.fromAccountId) || !boundAccountIds.has(t.toAccountId))
      throw new Error(`Closing transfer ${t.reason} names an unbound account`);
    if (!cash.has(t.fromAccountId)) throw new Error("Closing transfer source has no balance");
    cash.set(t.fromAccountId, cash.get(t.fromAccountId)! - t.amountAnchor);
    cash.set(t.toAccountId, (cash.get(t.toAccountId) ?? 0) + t.amountAnchor);
  }
  for (const [id, value] of cash)
    if (value < -1e-6) throw new Error(`Closing transfers overdraw ${id}`);
  return {
    ...result,
    accounts: [...cash].map(([id, value]) => ({ id, cash: Math.max(0, value) })),
    close,
  };
}

export async function settleProducerTurn(
  db: Db,
  input: {
    worldEpoch: string;
    production: ProducerTurnProduction;
    bindings: readonly ProducerCashBinding[];
    targets: readonly ProducerSectorTarget[];
    /** Closing transfers computed from the settled market, frozen with it. */
    close?: (result: EconomyResult) => SettlementClose;
  }
): Promise<SettledEconomyResult> {
  const turn = input.production.turn;
  const key = JSON.stringify([input.worldEpoch, turn]);
  await assertProducerTurnFence(db, input.worldEpoch, turn);
  const turns = db.collection<ProducerTurnRecord>("producerEconomyTurns");
  let record = await turns.findOne({ _id: key });
  let claimedPayload: FrozenProducerTurn | undefined;
  if (!record) {
    await verifyOpeningProducerPayables(db, {
      worldEpoch: input.worldEpoch,
      turn,
      bindings: input.bindings,
      payables: input.production.payables ?? [],
    });
    const plans = new Map(input.production.producers.map((plan) => [plan.id, plan]));
    const capacities = input.targets.map((target) => {
      const plan = plans.get(target.producerId);
      if (!plan) throw new Error("Missing physical producer plan");
      return {
        producerId: target.producerId,
        closing: advanceProducerCapacity({
          state: target.capacity,
          turn,
          activeFraction: plan.activeFraction,
          operatingRecipeRatio: target.operatingRecipeRatio,
          recessionCapacityFactor: target.recessionCapacityFactor,
        }),
      };
    });
    const capacityByProducer = new Map(capacities.map((row) => [row.producerId, row.closing]));
    const production: EconomyInput = {
      ...input.production,
      producers: input.production.producers.map((plan) => ({
        ...plan,
        capacityUnits: capacityByProducer.get(plan.id)?.capacityUnits ?? NaN,
      })),
    };
    const payload: FrozenProducerTurn = {
      version: 1,
      createdAt: new Date().toISOString(),
      worldEpoch: input.worldEpoch,
      request: production,
      bindings: input.bindings,
      targets: input.targets,
      capacities,
      result: (() => {
        const market = advanceProducerEconomy(production);
        return input.close
          ? applySettlementClose(
              market,
              input.close(market),
              new Set(input.bindings.map((b) => b.accountId))
            )
          : market;
      })(),
    };
    validateTargets(payload);
    const encoded = encodeReceipt(payload);
    const candidate: ProducerTurnRecord = {
      _id: key,
      worldEpoch: input.worldEpoch,
      turn,
      status: "frozen",
      digest: encoded.digest,
      payload: encoded.payload,
    };
    // Validate native balances and restricted cash targets before claiming any receipt.
    const verification = await verifyPhysicalTargets(db, payload);
    cashWithLedger(redirectFrozenOwnerCash(payload, verification.cashRedirect), candidate.digest);
    candidate.settlementWarnings = verification.turnWarnings;
    await stageReceiptChunks(db, encoded.chunks);
    try {
      await turns.insertOne(candidate);
      record = candidate;
      claimedPayload = payload;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000))
        throw error;
      record = await turns.findOne({ _id: key });
      if (!record) throw new Error("Missing claimed producer receipt");
    }
  }
  const frozen = claimedPayload ?? (await readFrozen(db, record));
  if (
    frozen.worldEpoch !== input.worldEpoch ||
    frozen.request.turn !== turn ||
    (record.status !== "frozen" && record.status !== "settled")
  )
    throw new Error("Invalid frozen producer turn");
  if (record.status === "settled")
    return { ...frozen.result, turnWarnings: record.settlementWarnings ?? [] };
  validateTargets(frozen);
  const verification = await verifyPhysicalTargets(db, frozen);
  const prepared = redirectFrozenOwnerCash(frozen, verification.cashRedirect);
  const sectors = db.collection<CorporateSector>("corporateSectors");
  const capacities = new Map(frozen.capacities.map((row) => [row.producerId, row.closing]));
  const openingInventories = inventoryImages(frozen, false);
  const closingInventories = inventoryImages(frozen, true);
  const cash = cashWithLedger(prepared, record.digest);
  await assertProducerTurnFence(db, frozen.worldEpoch, turn);
  const settled = await settleTransition(db, cash);
  if (settled.status !== "applied" && settled.status !== "replayed")
    throw new Error(settled.error ?? "Producer cash settlement is incomplete");
  await publishProducerPayables(db, {
    worldEpoch: frozen.worldEpoch,
    turn,
    bindings: prepared.bindings,
    openingPayables: prepared.request.payables ?? [],
    closingPayables: prepared.result.payables,
  });
  const results = new Map(frozen.result.producers.map((p) => [p.id, p]));
  // Only turn-owned absolute receipt fields are published here. Replaying a
  // completed batch changes no cash, stock quantity or user command field.
  // One bulk write for every target; the driver splits it into server batches.
  {
    const targets = frozen.targets;
    const published = await sectors.bulkWrite(
      targets.map((target) => ({
        updateOne: {
          filter: {
            // Keyed by sector id only: a sector sold or spun off mid-turn keeps
            // its physical receipt. Cash still settled with the frozen owner.
            _id: new ObjectId(target.sectorId),
            $or: [
              {
                "producerSettlement.worldEpoch": frozen.worldEpoch,
                "producerSettlement.turn": turn,
                "producerCapacity.worldEpoch": frozen.worldEpoch,
                "producerCapacity.turn": turn,
                ...physicalImage(capacities.get(target.producerId)!.state),
                producerInventory: closingInventories.get(target.producerId),
              },
              {
                "producerCapacity.worldEpoch": frozen.worldEpoch,
                "producerCapacity.turn": target.capacity.completedTurn,
                ...physicalImage(target.capacity),
                producerInventory:
                  verification.storedOpeningInventory.get(target.producerId) ??
                  openingInventories.get(target.producerId),
                $or: [
                  { producerSettlement: { $exists: false } },
                  {
                    "producerSettlement.worldEpoch": frozen.worldEpoch,
                    "producerSettlement.turn": { $lt: turn },
                  },
                ],
              },
            ],
          },
          update: {
            $set: {
              ...physicalWrite(target, capacities.get(target.producerId)!),
              producerCapacity: { worldEpoch: frozen.worldEpoch, turn },
              producerInventory: closingInventories.get(target.producerId),
              producerSettlement: {
                ...results.get(target.producerId)!,
                worldEpoch: frozen.worldEpoch,
                turn,
              },
            },
          },
        },
      })),
      { ordered: false }
    );
    if (published.matchedCount !== targets.length)
      throw new Error("Producer receipt publication lost its target");
  }
  await turns.updateOne(
    { _id: key, digest: record.digest, status: "frozen" },
    { $set: { status: "settled", settlementWarnings: verification.turnWarnings } }
  );
  return { ...frozen.result, turnWarnings: verification.turnWarnings };
}

/** Recover before preparing a new turn from sectors that may already have advanced. */
export async function resumeProducerTurn(db: Db, input: { worldEpoch: string; turn: number }) {
  await assertProducerTurnFence(db, input.worldEpoch, input.turn);
  const record = await db.collection<ProducerTurnRecord>("producerEconomyTurns").findOne({
    _id: JSON.stringify([input.worldEpoch, input.turn]),
  });
  if (!record) return null;
  const frozen = await readFrozen(db, record);
  const result = await settleProducerTurn(db, {
    worldEpoch: input.worldEpoch,
    production: frozen.request,
    bindings: frozen.bindings,
    targets: frozen.targets,
  });
  return {
    result,
    bindings: frozen.bindings,
    targets: frozen.targets,
    openingAccounts: frozen.request.accounts,
  };
}
