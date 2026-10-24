/**
 * Producer-market shadow phase (market recovery Phase 2, telemetry only).
 *
 * After the live corporation phase has computed this turn's sectors, prepare
 * every plant with the unified producer host and run the funded market in
 * memory on its own carried books (funded-market cutover phase A): cash, stock,
 * unpaid bills and prices continue from the previous shadow turn; households
 * spend wages, distributed AI profit and savings; public buyers spend the
 * plant economy's share of their budget. Writes one summary per turn to
 * `producerMarketShadows` and the carried state to
 * `producerMarketShadowState`, nothing else. It never moves live money, never
 * touches a sector or corporation, and a failure is logged, never thrown.
 */
import type { Db } from "mongodb";
import { runProducerShadowDetailed } from "@/lib/market/producerMarket/shadowRules";
import {
  checkCohort,
  checkConservation,
  closeShadowTurn,
  MONEY_LOOP_TOLERANCE,
  resolveShadowContinuity,
  SHADOW_STATE_SCHEMA_VERSION,
  type CohortFlows,
  type ShadowCarryState,
  type ShadowPlantCarry,
} from "@/lib/market/producerMarket/shadowCarryRules";
import { producerFillSpend } from "@/lib/market/producerMarket/rules";
import type { ProducerPhysicalEnv } from "./producerPhysicalPreparation";
import type { CorporationLookups } from "./types";
import { buildProducerTurnDemand } from "./producerTurnDemand";

export const PRODUCER_SHADOW_COLLECTION = "producerMarketShadows";
/** Shadow-only carried state, one document per run and turn. Never read by live code. */
export const PRODUCER_SHADOW_STATE_COLLECTION = "producerMarketShadowState";

export async function runProducerMarketShadowPhase(
  db: Db,
  input: {
    enabled: boolean;
    turn: number;
    worldEpoch: string | null | undefined;
    lookups: CorporationLookups;
    env: ProducerPhysicalEnv;
    /** This turn's sector writes; the legacy plantsPnl is read from them. */
    sectorOps: readonly unknown[];
    /**
     * Run the market, close and evidence after the turn instead of inline.
     * Only the demand build reads live phase state; the rest is pure over a
     * detached copy of it, so it can leave the turn's critical path.
     */
    defer?: (label: string, run: () => Promise<void>) => void;
  }
): Promise<void> {
  if (!input.enabled || !input.worldEpoch) return;
  try {
    const started = Date.now();
    const worldEpoch = input.worldEpoch;
    const stateCollection = db.collection<ShadowCarryState & { _id: string; at: Date }>(
      PRODUCER_SHADOW_STATE_COLLECTION
    );
    const predecessor = await stateCollection.findOne(
      { worldEpoch, turn: input.turn - 1, schemaVersion: SHADOW_STATE_SCHEMA_VERSION },
      { sort: { at: -1 } }
    );
    const continuity = resolveShadowContinuity(predecessor, { worldEpoch, turn: input.turn });
    // Where the shadow's time goes, so it can be moved off the turn with
    // evidence rather than a guess (#4828).
    const stageMs: Record<string, number> = {};
    let stageStarted = Date.now();
    const stage = (name: string) => {
      const now = Date.now();
      stageMs[name] = now - stageStarted;
      stageStarted = now;
    };
    const carry = continuity.mode === "continue" ? continuity.predecessor : null;

    const demand = await buildProducerTurnDemand(db, {
      turn: input.turn,
      worldEpoch,
      lookups: input.lookups,
      env: input.env,
      sectorOps: input.sectorOps,
      carry,
      stage,
    });
    stage("demand.orders");
    const msOnTurn = Date.now() - started;

    const settle = async (d: ShadowDemand, deferred: boolean) => {
      const settleStarted = Date.now();
      stageStarted = settleStarted;
      const {
        accounts,
        cashByCorp,
        eligibleOffersByOrder,
        firstWalletByCorp,
        funding,
        householdForPayee,
        householdSeed,
        householdTransferTotal,
        householdWallets,
        households,
        investmentBuyerOrders,
        investmentFundingTotal,
        marketingOrders,
        newCompanyCash,
        openingById,
        ownerKindByCompany,
        planCountry,
        planSector,
        producers,
        publicBuyerOrders,
        publicFunding,
        publicShareByCountry,
        references,
        roles,
        skipReasons,
        skipped,
        states,
      } = d;
      const { summary, result } = runProducerShadowDetailed({
        turn: input.turn,
        references,
        producers,
        skipped,
        accounts,
        households,
        publicOrders: publicBuyerOrders,
        investmentOrders: investmentBuyerOrders,
        marketingOrders,
        eligibleOffersByOrder,
        payables: (carry?.payables ?? []).filter((p) => cashByCorp.has(p.debtorAccountId)),
      });
      stage("market");

      // 6. Close: AI profit to households, operating payees to their state's
      //    households, unspent public funding back to the treasury.
      const profitByCompany = new Map<string, number>();
      const planAccount = new Map(producers.map((p) => [p.plan.id, p.plan.accountId]));
      for (const r of result.producers) {
        const id = planAccount.get(r.id);
        if (id) profitByCompany.set(id, (profitByCompany.get(id) ?? 0) + r.profit);
      }
      const close = closeShadowTurn({
        closingAccounts: result.accounts,
        roles,
        profitByCompany,
        ownerKindByCompany,
        householdFor: (id) =>
          householdForPayee.get(id) ?? firstWalletByCorp.get(id)?.wallet ?? null,
      });

      stage("close");
      // 7. Gate A: money loop per household wallet, per country and globally.
      const wagesByWallet = new Map<string, number>();
      const planRecipient = new Map(
        producers.map((p) => [p.plan.id, p.plan.labourRecipientAccountId])
      );
      for (const r of result.producers) {
        const w = planRecipient.get(r.id);
        if (w) wagesByWallet.set(w, (wagesByWallet.get(w) ?? 0) + r.labourPaid);
      }
      for (const pay of result.payablePayments)
        if (householdWallets.has(pay.creditorAccountId))
          wagesByWallet.set(
            pay.creditorAccountId,
            (wagesByWallet.get(pay.creditorAccountId) ?? 0) + pay.amount
          );
      const spendByBuyer = new Map<string, number>();
      for (const t of producerFillSpend(result.tradeReceipt))
        spendByBuyer.set(t.buyerAccountId, (spendByBuyer.get(t.buyerAccountId) ?? 0) + t.amount);
      const distByWallet = new Map<string, number>();
      const opIncomeByWallet = new Map<string, number>();
      for (const t of close.transfers) {
        const m =
          t.reason === "ai_dividend"
            ? distByWallet
            : t.reason === "operating_income"
              ? opIncomeByWallet
              : null;
        if (m) m.set(t.to, (m.get(t.to) ?? 0) + t.amount);
      }
      const flowsFor = (ids: readonly string[]): CohortFlows => {
        const sum = (f: (id: string) => number) => ids.reduce((s, id) => s + f(id), 0);
        return {
          opening: sum((id) => openingById.get(id) ?? 0),
          wagesPaid: sum((id) => wagesByWallet.get(id) ?? 0),
          distributionsPaid: sum((id) => distByWallet.get(id) ?? 0),
          operatingIncome: sum((id) => opIncomeByWallet.get(id) ?? 0),
          settledSpend: sum((id) => spendByBuyer.get(id) ?? 0),
          closing: sum((id) => close.accounts[id] ?? 0),
        };
      };
      const walletIds = [...householdWallets.keys()].sort();
      const walletChecks = walletIds.map((id) => checkCohort(id, flowsFor([id])));
      const byCountry = new Map<string, string[]>();
      for (const w of householdWallets.values())
        byCountry.set(w.countryId, [...(byCountry.get(w.countryId) ?? []), w.accountId]);
      const countryChecks = [...byCountry]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([c, ids]) => checkCohort(c, flowsFor(ids)));
      const globalCheck = checkCohort("households", flowsFor(walletIds));
      const publicChecks = funding.map((f) => {
        const id = `public:${f.countryId}`;
        const spent = spendByBuyer.get(id) ?? 0;
        const returned = close.transfers
          .filter((t) => t.from === id && t.reason === "public_return")
          .reduce((s, t) => s + t.amount, 0);
        const residual = f.fundingLocal - spent - returned;
        return {
          countryId: f.countryId,
          funded: f.fundingLocal,
          spent,
          returned,
          residual,
          pass: Math.abs(residual) <= MONEY_LOOP_TOLERANCE * Math.max(f.fundingLocal, 1),
        };
      });
      const carriedIds = new Set(Object.keys(carry?.accounts ?? {}));
      const exited = [...carriedIds]
        .filter((id) => !openingById.has(id))
        .reduce((s, id) => s + (carry?.accounts[id] ?? 0), 0);
      const conservation = checkConservation({
        openingTotal: Object.values(carry?.accounts ?? {}).reduce((s, v) => s + v, 0),
        closingTotal: Object.values(close.accounts).reduce((s, v) => s + v, 0),
        sources: {
          householdSeed,
          householdTransfer: householdTransferTotal,
          newCompanyCash: newCompanyCash.total,
          publicFunding,
          investmentFunding: investmentFundingTotal,
        },
        sinks: {
          exitedAccounts: exited,
          publicReturned: close.publicReturned,
          stateRemitted: close.stateRemitted,
        },
      });
      const moneyLoop = {
        pass:
          conservation.pass &&
          globalCheck.pass &&
          walletChecks.every((c) => c.pass) &&
          publicChecks.every((c) => c.pass),
        tolerance: MONEY_LOOP_TOLERANCE,
        conservation: {
          ...conservation,
          sources: {
            householdSeed,
            householdTransfer: householdTransferTotal,
            newCompanyCash: newCompanyCash.total,
            publicFunding,
            investmentFunding: investmentFundingTotal,
          },
          sinks: {
            exitedAccounts: exited,
            publicReturned: close.publicReturned,
            stateRemitted: close.stateRemitted,
          },
        },
        households: globalCheck,
        countries: countryChecks,
        failingWallets: walletChecks.filter((c) => !c.pass).slice(0, 50),
        walletCount: walletChecks.length,
        zeroActivityWallets: walletChecks.filter((c) => c.zeroActivity).length,
        public: publicChecks,
        distributed: close.distributed,
        operatingSwept: close.operatingSwept,
      };

      // 8. Requested vs offered per commodity and country.
      const stateCountry = new Map(states.map((s) => [String(s._id), String(s.countryId ?? "")]));
      const scopeOf = (book: string) =>
        book === "world"
          ? "world"
          : book.startsWith("state:")
            ? (stateCountry.get(book.slice(6)) ?? "")
            : book.slice("country:".length);
      const demand = new Map<
        string,
        {
          commodity: string;
          scope: string;
          requested: number;
          delivered: number;
          offered: number;
          sold: number;
        }
      >();
      const row = (commodity: string, book: string) => {
        const scope = scopeOf(book);
        const key = `${commodity}|${scope}`;
        const r = demand.get(key) ?? {
          commodity,
          scope,
          requested: 0,
          delivered: 0,
          offered: 0,
          sold: 0,
        };
        demand.set(key, r);
        return r;
      };
      for (const o of result.orderOutcomes) {
        const r = row(o.commodity, o.book);
        r.requested += o.requestedUnits;
        r.delivered += o.deliveredUnits;
      }
      for (const p of result.producers)
        for (const prod of p.products) {
          const r = row(prod.commodity, prod.book);
          r.offered += prod.offeredUnits;
          r.sold += prod.soldUnits;
        }
      const demandRatios = [...demand.values()]
        .map((r) => ({
          ...r,
          requestedPerOffered: r.offered > 0 ? r.requested / r.offered : null,
          note: r.offered > 0 ? undefined : r.requested > 0 ? "no offer" : "no activity",
        }))
        .sort((a, b) =>
          a.commodity === b.commodity
            ? a.scope < b.scope
              ? -1
              : 1
            : a.commodity < b.commodity
              ? -1
              : 1
        );

      // Per-sector legacy and funded revenue (anchor per turn): the evidence the
      // cutover's transition classification is frozen from.
      const fundedByPlan = new Map(result.producers.map((r) => [r.id, r.revenue]));
      const sectorRevenue = producers.flatMap((p) => {
        const sectorId = planSector.get(p.plan.id);
        if (!sectorId || !p.legacy) return [];
        return [{ sectorId, legacy: p.legacy.revenue, funded: fundedByPlan.get(p.plan.id) ?? 0 }];
      });

      stage("evidence");
      // 9. Persist next turn's opening (shadow-only) and the turn summary.
      const valueAddedByCountry: Record<string, number> = {};
      const plants: Record<string, ShadowPlantCarry> = {};
      for (const r of result.producers) {
        const country = planCountry.get(r.id) ?? "";
        valueAddedByCountry[country] =
          (valueAddedByCountry[country] ?? 0) + (r.revenue - r.inputsConsumed);
        const sectorId = planSector.get(r.id);
        if (sectorId)
          plants[sectorId] = {
            inputStock: r.inputStock,
            outputStock: r.outputStock,
            receipt: {
              activeUnits: r.activeUnits,
              producedUnits: r.producedUnits,
              offeredUnits: r.offeredUnits,
              soldUnits: r.soldUnits,
              revenue: r.revenue,
              inputsConsumed: r.inputsConsumed,
            },
          };
      }
      const nextState: ShadowCarryState = {
        runId: continuity.runId,
        worldEpoch,
        turn: input.turn,
        predecessorTurn: carry ? carry.turn : null,
        schemaVersion: SHADOW_STATE_SCHEMA_VERSION,
        codeSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
        accounts: close.accounts,
        plants,
        payables: result.payables,
        references: Object.fromEntries(summary.nextPrices.map((p) => [p.commodity, p.next])),
        valueAddedByCountry,
      };
      const stateId = `${continuity.runId}:${input.turn}`;
      await stateCollection.replaceOne(
        { _id: stateId },
        { ...nextState, at: new Date() },
        { upsert: true }
      );
      await stateCollection.deleteMany({ runId: continuity.runId, turn: { $lt: input.turn - 1 } });
      stage("stateWrite");
      await db.collection(PRODUCER_SHADOW_COLLECTION).replaceOne(
        { _id: input.turn as never },
        {
          ...summary,
          runId: continuity.runId,
          continuity:
            continuity.mode === "continue"
              ? { mode: "continue", predecessorTurn: carry!.turn }
              : { mode: "new", reason: continuity.reason },
          moneyLoop,
          demandRatios,
          sectorRevenue,
          publicShareByCountry,
          legacyPrices: references,
          skipReasons,
          worldEpoch,
          codeSha: nextState.codeSha,
          // Compute time, not wall time: a deferred run waits for the turn to end.
          ms: msOnTurn + (Date.now() - settleStarted),
          msOnTurn,
          deferred,
          stageMs,
          at: new Date(),
        },
        { upsert: true }
      );
    };

    const shadowDemand = pickShadowDemand(demand);
    const detached = input.defer ? detachShadowDemand(shadowDemand) : null;
    if (input.defer && detached) {
      input.defer("producerMarketShadow", async () => {
        try {
          await settle(detached, true);
        } catch (error) {
          console.warn(
            "[producerMarketShadow] deferred shadow run failed (telemetry only):",
            error
          );
        }
      });
      return;
    }
    await settle(shadowDemand, false);
  } catch (error) {
    console.warn("[producerMarketShadow] shadow run failed (telemetry only):", error);
  }
}

/** The parts of the demand build the shadow's market, close and evidence read. */
const SHADOW_DEMAND_FIELDS = [
  "accounts",
  "cashByCorp",
  "eligibleOffersByOrder",
  "firstWalletByCorp",
  "funding",
  "householdForPayee",
  "householdSeed",
  "householdTransferTotal",
  "householdWallets",
  "households",
  "investmentBuyerOrders",
  "investmentFundingTotal",
  "marketingOrders",
  "newCompanyCash",
  "openingById",
  "ownerKindByCompany",
  "planCountry",
  "planSector",
  "producers",
  "publicBuyerOrders",
  "publicFunding",
  "publicShareByCountry",
  "references",
  "roles",
  "skipReasons",
  "skipped",
  "states",
] as const;
type DemandBuild = Awaited<ReturnType<typeof buildProducerTurnDemand>>;
export type ShadowDemand = Pick<DemandBuild, (typeof SHADOW_DEMAND_FIELDS)[number]>;

/** Only these leave the phase: the rest (prepared sectors) is live documents. */
export function pickShadowDemand(demand: DemandBuild): ShadowDemand {
  return Object.fromEntries(SHADOW_DEMAND_FIELDS.map((key) => [key, demand[key]])) as ShadowDemand;
}

/**
 * A copy of the demand build the live phase can no longer touch, or null when
 * it holds anything a structured clone would not reproduce faithfully (a
 * driver ObjectId, a function, a class instance). Null keeps the run inline.
 * `states` is this call's own read and is never written, so it is shared.
 */
export function detachShadowDemand<T extends { states: unknown }>(demand: T): T | null {
  const { states, ...rest } = demand;
  if (!isPlainData(rest)) {
    console.warn("[producerMarketShadow] demand is not plain data; running inline");
    return null;
  }
  try {
    return { ...(structuredClone(rest) as Omit<T, "states">), states } as T;
  } catch (error) {
    console.warn("[producerMarketShadow] demand could not be cloned; running inline", error);
    return null;
  }
}

function isPlainData(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return typeof value !== "function";
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isPlainData(item, seen));
  if (value instanceof Map)
    return [...value].every(([k, v]) => isPlainData(k, seen) && isPlainData(v, seen));
  if (value instanceof Set) return [...value].every((item) => isPlainData(item, seen));
  if (value instanceof Date) return true;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((item) => isPlainData(item, seen));
}

export {
  isolatedShadowEnv,
  legacyPnlBySectorId,
  shadowCountryBooks,
  shadowOpeningSector,
} from "./producerTurnDemand";

/**
 * The shadow costs up to about two minutes on the live world. Run it only when
 * that much of the phase budget is left, with a safety margin.
 */
export const SHADOW_RESERVED_MS = 120_000;
export function shadowFitsPhaseBudget(elapsedMs: number, phaseTimeoutMs: number): boolean {
  const ok = elapsedMs + SHADOW_RESERVED_MS <= phaseTimeoutMs;
  if (!ok)
    console.warn(
      `[producerMarketShadow] skipped: corporation phase at ${Math.round(elapsedMs / 1000)}s of ${Math.round(phaseTimeoutMs / 1000)}s`
    );
  return ok;
}
