/**
 * The live funded producer turn (funded-market cutover, phase B slice S3).
 *
 * Runs only when `resolveProducerPath` selects the funded path, before the
 * legacy per-sector pass. In order:
 * 1. build this turn's funded demand with the same builder the shadow uses;
 * 2. create any missing wallets, mint each public buyer's funding (the plant
 *    share of the outlay the treasury already spends) and, on the world's
 *    first funded turn only, the owner-approved household opening cash;
 * 3. settle the market (cash, stock, payables and receipts, idempotent per turn);
 * 4. book the close: AI profit (60%) and operating income to households, state
 *    remittances to the treasury, unspent public funding burned.
 *
 * Returns each sector's settled receipt so the legacy pass can take revenue and
 * margin from it, and the producer profit per corporation the settlement paid.
 */
import { markStrugglingTransitionSectors } from "./transitionStruggling";
import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { LedgerEntry } from "@/lib/ledger/types";
import type { CorporateSector, Corporation } from "@/lib/db/types/corporation";
import { applyMoneyMove, resumeMoneyMove } from "@/lib/banking/moneyMove";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { resolveSectorHostCurrencyCode } from "@/lib/currency/corporationCapital";
import { HOUSEHOLD_OPENING_TURNS } from "@/lib/market/producerMarket/householdOpeningRules";
import {
  distributeProfits,
  type ProfitOwnerKind,
} from "@/lib/market/producerMarket/profitDistributionRules";
import {
  householdOpeningMoves,
  PRODUCER_ACCOUNTS,
  investmentFundingMoves,
  producerMoveLedgerLegs,
  investmentReturnMoves,
  batchProducerMoves,
  publicFundingMoves,
  publicReturnMoves,
  type CloseParty,
  type CloseTransfer,
} from "@/lib/market/producerMarket/liveFundingRules";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import { transitionSupport } from "@/lib/market/producerMarket/transitionRules";
import {
  fundedLedgerRows,
  PRODUCER_MARKET_OUTCOMES,
} from "@/lib/market/producerMarket/fundedLedgerRules";
import type { ShadowCarryState } from "@/lib/market/producerMarket/shadowCarryRules";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { ProducerPhysicalEnv } from "./producerPhysicalPreparation";
import type { CorporationLookups } from "./types";
import { buildProducerTurnDemand } from "./producerTurnDemand";
import type { SettlementClose } from "@/lib/market/producerMarket/settlement";
import type { EconomyResult } from "@/lib/market/producerMarket/settlement";
import { NO_PHYSICAL_CAPACITY } from "./producerSectorPlan";
import { newEntrantProducerBooks } from "@/lib/market/producerMarket/openingState";
import {
  createProducerWallets,
  producerWalletId,
  runCorporationProducerMarket,
  type ProducerWalletScope,
} from "./producerMarketPhase";

/** Owner decision 2026-10-18: households open with about 3 turns of wages. */
export const HOUSEHOLD_OPENING_APPROVAL = "owner 2026-10-18: household opening cash about 3 turns";

export interface FundedProducerTurnResult {
  receiptsBySectorId: Map<string, FundedReceipt>;
  /** Anchor per turn, by corporation id. */
  settledProfitByCorp: Map<string, number>;
  /** Staffed headcount of each plant at its funded run; plants with no plan are absent. */
  headcountBySectorId: ReadonlyMap<string, { desiredWorkers: number; workers: number }>;
}

export async function runFundedProducerTurn(
  db: Db,
  input: {
    turn: number;
    worldEpoch: string;
    lookups: CorporationLookups;
    env: ProducerPhysicalEnv;
    /** True when no funded turn has run for this world yet: seed household cash. */
    seedHouseholds: boolean;
    /** First funded turn of the world (opening turn + 1), for the transition window. */
    firstFundedTurn?: number;
  }
): Promise<FundedProducerTurnResult> {
  const { lookups, worldEpoch, turn } = input;
  await admitNewProducerEntrants(db, lookups, worldEpoch, turn);
  const rates = lookups.exchangeRatesByCurrency;
  const rateOf = (code: string | null | undefined) => {
    const r = code ? rates.get(code as CurrencyCode) : undefined;
    if (!r || !Number.isFinite(r) || r <= 0)
      throw new Error(`Funded producer turn requires an observed rate for ${code}`);
    return r;
  };

  // Public buyer wallet per country, in the country's budget currency.
  const countryCurrency = new Map<string, CurrencyCode>();
  for (const b of lookups.federalBudgets) {
    const code = resolveCountryCurrencyCode(b);
    if (code) countryCurrency.set(String(b.countryId), code as CurrencyCode);
  }
  const publicScope = (countryId: string): ProducerWalletScope => {
    const currency = countryCurrency.get(countryId);
    if (!currency) throw new Error(`No budget currency for ${countryId}`);
    return { kind: "publicBuyer", countryId, currency };
  };
  const publicWallet = (countryId: string) => producerWalletId(worldEpoch, publicScope(countryId));
  // Construction buyer wallet per country, same currency as its public buyer.
  const investmentScope = (countryId: string): ProducerWalletScope => ({
    ...publicScope(countryId),
    kind: "investmentBuyer",
  });
  const investmentWallet = (countryId: string) =>
    producerWalletId(worldEpoch, investmentScope(countryId));

  const demand = await buildProducerTurnDemand(db, {
    turn,
    worldEpoch,
    lookups,
    env: input.env,
    sectorOps: [],
    carry: liveCarry(lookups, worldEpoch, turn),
    publicAccountId: publicWallet,
    investmentAccountId: investmentWallet,
  });
  // A live turn must settle every plant: a skipped one would run on legacy
  // revenue beside the funded market. Fail the turn instead.
  // A sector with no physical capacity yet (a new founding awaiting its first
  // build) produces nothing: it settles as an explicit zero receipt below. Any
  // other preparation failure would leave a plant on legacy revenue beside the
  // funded market, so the turn fails instead.
  const idleSectorIds = demand.skippedSectors
    .filter((s) => s.reason === NO_PHYSICAL_CAPACITY)
    .map((s) => s.sectorId);
  const failed = demand.skippedSectors.filter((s) => s.reason !== NO_PHYSICAL_CAPACITY);
  if (failed.length > 0)
    throw new Error(
      `Funded producer turn could not prepare ${failed.length} sector(s): ${[...new Set(failed.map((f) => f.reason))].slice(0, 5).join("; ")}`
    );
  const publicScopes = demand.funding.map((f) => publicScope(f.countryId));
  const investmentScopes = demand.investmentFunding.map((f) => investmentScope(f.countryId));
  const walletScopes = [...demand.walletScopes, ...publicScopes, ...investmentScopes];
  const scopeById = new Map(walletScopes.map((s) => [producerWalletId(worldEpoch, s), s]));
  await createProducerWallets(db, worldEpoch, walletScopes);

  const apply = async (moves: ReturnType<typeof publicFundingMoves>) => {
    const entries: LedgerEntry[] = [];
    for (const move of moves) {
      let result = await applyMoneyMove(db, move);
      // An existing key may be a move a crash left half done: finish it.
      if (result.status === "replayed") result = await resumeMoneyMove(db, move.key);
      if (result.status !== "applied" && result.status !== "replayed")
        throw new Error(`Producer money move ${move.key} ${result.status}`);
      // Witness the move in the ledger, like the settlement witnesses its own
      // cash; the id derives from the move key, so a replay adds nothing.
      const legs = producerMoveLedgerLegs(move);
      if (legs)
        entries.push({
          _id: new ObjectId(
            createHash("sha256").update(`${move.key}:ledger`).digest("hex").slice(0, 24)
          ),
          turn,
          createdAt: new Date(),
          txType: "producer_market_transfer",
          legs,
          balanced: Math.abs(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)) < 1e-6,
          emitSite: "producerMarket/fundedProducerTurn",
        });
    }
    if (entries.length > 0)
      await db
        .collection<LedgerEntry>("ledgerEntries")
        .insertMany(entries, { ordered: false })
        .catch((error: unknown) => {
          // Duplicate ids are replays already witnessed; anything else is real.
          const writeErrors = (error as { writeErrors?: { code?: number }[] }).writeErrors;
          if (!writeErrors || writeErrors.some((e) => e.code !== 11000)) throw error;
        });
  };

  await apply(
    batchProducerMoves(
      worldEpoch,
      turn,
      publicFundingMoves(
        worldEpoch,
        turn,
        demand.funding.map((f) => {
          const currency = countryCurrency.get(f.countryId)!;
          const rate = rateOf(currency);
          return {
            countryId: f.countryId,
            walletId: publicWallet(f.countryId),
            amountLocal: f.fundingLocal * rate,
            currencyCode: currency,
            localPerAnchor: rate,
          };
        })
      )
    )
  );
  await apply(
    batchProducerMoves(
      worldEpoch,
      turn,
      investmentFundingMoves(
        worldEpoch,
        turn,
        demand.investmentFunding.map((f) => {
          const currency = countryCurrency.get(f.countryId)!;
          const rate = rateOf(currency);
          return {
            countryId: f.countryId,
            walletId: investmentWallet(f.countryId),
            amountLocal: f.fundingLocal * rate,
            currencyCode: currency,
            localPerAnchor: rate,
          };
        })
      )
    )
  );

  if (input.seedHouseholds) {
    const wageBill = new Map<string, number>();
    for (const p of demand.preparedSectors)
      wageBill.set(
        p.plan.labourRecipientAccountId,
        (wageBill.get(p.plan.labourRecipientAccountId) ?? 0) + p.plan.labourCost
      );
    await apply(
      householdOpeningMoves(
        worldEpoch,
        HOUSEHOLD_OPENING_APPROVAL,
        [...wageBill].map(([walletId, perTurnAnchor]) => {
          const scope = scopeById.get(walletId);
          const rate = rateOf(scope?.currency);
          return {
            walletId,
            amountLocal: HOUSEHOLD_OPENING_TURNS * perTurnAnchor * rate,
            currencyCode: scope!.currency,
            localPerAnchor: rate,
          };
        })
      )
    );
  }

  const corpById = new Map(lookups.corporations.map((c) => [c._id.toHexString(), c]));
  const corpParty = (id: string): CloseParty => {
    const corp = corpById.get(id)!;
    const currency = corp.liquidCurrencyCode ?? "USD";
    return {
      collection: "corporations",
      filter: { _id: new ObjectId(id) },
      path: "liquidCapital",
      id,
      currencyCode: currency,
      localPerAnchor: rateOf(currency),
    };
  };
  const walletParty = (id: string): CloseParty => {
    const scope = scopeById.get(id);
    return {
      collection: PRODUCER_ACCOUNTS,
      filter: { _id: id },
      path: "cash",
      id,
      currencyCode: scope?.currency ?? "USD",
      localPerAnchor: rateOf(scope?.currency),
    };
  };

  const corpOfPlan = new Map(
    demand.preparedSectors.map((row) => [row.plan.id, row.plan.accountId])
  );
  const sectorOwner = new Map<string, string>();
  for (const corp of lookups.corporations)
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? [])
      sectorOwner.set(sector._id.toHexString(), corp._id.toHexString());
  // Closing transfers computed from the settled market and frozen with it: AI
  // profit to households, operating income to households, and the transition
  // floor from unspent public funding. One settlement write instead of
  // thousands of money moves (each costs several prod round trips).
  const closeAtSettlement = (market: EconomyResult): SettlementClose => {
    const closingCash = new Map(market.accounts.map((a) => [a.id, a.cash]));
    const settledProfitByCorp = new Map<string, number>();
    const revenueBySector = new Map<string, number>();
    for (const r of market.producers) {
      const corp = corpOfPlan.get(r.id);
      if (corp) settledProfitByCorp.set(corp, (settledProfitByCorp.get(corp) ?? 0) + r.profit);
      const sectorId = demand.planSector.get(r.id);
      if (sectorId) revenueBySector.set(sectorId, r.revenue);
    }
    const transfers: SettlementClose["transfers"] = planFundedClose({
      settledProfitByCorp,
      closingCash,
      ownerKindByCompany: demand.ownerKindByCompany,
      householdFor: (corpId) => demand.firstWalletByCorp.get(corpId)?.wallet ?? null,
      householdForPayee: demand.householdForPayee,
      corpParty,
      walletParty,
    }).map((t) => ({
      reason: t.reason,
      fromAccountId: t.from.id,
      toAccountId: t.to.id,
      amountAnchor: t.amountAnchor,
    }));
    const support = input.firstFundedTurn
      ? transitionSupport({
          turn,
          firstFundedTurn: input.firstFundedTurn,
          sectors: lookups.corporations.flatMap((corp) =>
            (lookups.sectorsByCorp.get(corp._id.toString()) ?? []).map((sector) => ({
              sectorId: sector._id.toHexString(),
              countryId: String(sector.countryId ?? corp.countryId ?? ""),
              transition: sector.cutoverTransition,
              settledRevenue: revenueBySector.get(sector._id.toHexString()) ?? 0,
              mothballed: sector.mothballed === true,
              converted: sector.cutoverConvertedAtTurn != null,
            }))
          ),
          poolByCountry: new Map(
            demand.funding.map((f) => [
              f.countryId,
              Math.max(0, closingCash.get(publicWallet(f.countryId)) ?? 0),
            ])
          ),
        })
      : { payments: [], coverageByCountry: new Map<string, number>() };
    const byPayee = new Map<string, SettlementClose["transfers"][number]>();
    const paid: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    for (const p of support.payments) {
      paid[p.countryId] = (paid[p.countryId] ?? 0) + p.claim;
      bySector[p.sectorId] = (bySector[p.sectorId] ?? 0) + p.claim;
      const owner = sectorOwner.get(p.sectorId)!;
      const from = publicWallet(p.countryId);
      const key = `${owner}:${from}`;
      const row = byPayee.get(key) ?? {
        reason: "transition_support",
        fromAccountId: from,
        toAccountId: owner,
        amountAnchor: 0,
      };
      row.amountAnchor += p.claim;
      byPayee.set(key, row);
    }
    transfers.push(...byPayee.values());
    return {
      transfers,
      meta: {
        paidByCountry: paid,
        supportBySector: bySector,
        coverageByCountry: Object.fromEntries(support.coverageByCountry),
      },
    };
  };

  const settled = await runCorporationProducerMarket(db, {
    worldEpoch,
    turn,
    corporations: lookups.corporations,
    prepare: () => demand.preparedSectors,
    walletScopes,
    rates,
    demand: {
      households: demand.households,
      // Marketing budgets keep their legacy settlement to media sellers this
      // turn; buying them here as well would spend each budget twice.
      externalOrders: [...demand.publicBuyerOrders, ...demand.investmentBuyerOrders],
      eligibleOffersByOrder: demand.eligibleOffersByOrder,
    },
    close: closeAtSettlement,
  });

  const supportBySector =
    (settled.result.close?.meta?.supportBySector as Record<string, number> | undefined) ?? {};
  const receiptsBySectorId = new Map<string, FundedReceipt>();
  for (const sector of settled.closingSectors) {
    const r = sector.producerSettlement;
    if (r && r.worldEpoch === worldEpoch && r.turn === turn)
      receiptsBySectorId.set(sector._id.toHexString(), {
        revenue: r.revenue,
        profit: r.profit,
        producedUnits: r.producedUnits,
        soldUnits: r.soldUnits,
        unsoldProductionCost: r.unsoldProductionCost ?? 0,
        transitionSupport: supportBySector[sector._id.toHexString()] ?? 0,
      });
  }
  // Consecutive zero-sales turns per settled sector (AI mothballing reads it).
  const zeroSales: ObjectId[] = [];
  const sold: ObjectId[] = [];
  for (const [id, r] of receiptsBySectorId)
    (r.soldUnits > 0 ? sold : zeroSales).push(new ObjectId(id));
  const sectorDocs = db.collection<CorporateSector>("corporateSectors");
  if (zeroSales.length > 0)
    await sectorDocs.updateMany(
      { _id: { $in: zeroSales } },
      { $inc: { producerZeroSalesTurns: 1 } }
    );
  if (sold.length > 0)
    await sectorDocs.updateMany(
      { _id: { $in: sold }, producerZeroSalesTurns: { $gt: 0 } },
      { $set: { producerZeroSalesTurns: 0 } }
    );
  for (const sectorId of idleSectorIds)
    if (!receiptsBySectorId.has(sectorId))
      receiptsBySectorId.set(sectorId, { revenue: 0, profit: 0, producedUnits: 0, soldUnits: 0 });
  // An idle sector settled this turn at zero: advance its generation with the
  // rest, or the next turn would reject it as unreconciled once it can produce.
  if (idleSectorIds.length > 0)
    await db.collection<CorporateSector>("corporateSectors").bulkWrite(
      idleSectorIds.map((id) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(id),
            "producerCapacity.worldEpoch": worldEpoch,
            "producerCapacity.turn": turn - 1,
          },
          update: {
            $set: {
              producerCapacity: { worldEpoch, turn },
              "producerInventory.worldEpoch": worldEpoch,
              "producerInventory.turn": turn,
            },
          },
        },
      })),
      { ordered: false }
    );
  const settledProfitByCorp = new Map(
    [...settled.operatingByCorporation].map(([id, o]) => [id, o.profit])
  );

  // Funded supply and demand for the price phase (slice S7).
  const sectorState = new Map<string, string>();
  for (const corp of lookups.corporations)
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? [])
      sectorState.set(sector._id.toString(), sector.stateId);
  const stateOfWallet = (id: string) => scopeById.get(id)?.stateId ?? null;
  const rows = fundedLedgerRows({
    outcomes: settled.result.orderOutcomes,
    products: settled.result.producers.flatMap((p) =>
      p.products.map((x) => ({
        producerId: p.id,
        commodity: x.commodity,
        book: x.book,
        offeredUnits: x.offeredUnits,
      }))
    ),
    stateOfAccount: (id) => {
      const wallet = stateOfWallet(id);
      if (wallet) return wallet;
      const first = demand.firstWalletByCorp.get(id);
      return first ? stateOfWallet(first.wallet) : null;
    },
    stateOfProducer: (id) => sectorState.get(demand.planSector.get(id) ?? "") ?? null,
    unitScale: TURNS_PER_DAY,
  });
  await db
    .collection<{ _id: string }>(PRODUCER_MARKET_OUTCOMES)
    .replaceOne(
      { _id: `${worldEpoch}:${turn}` },
      { _id: `${worldEpoch}:${turn}`, worldEpoch, turn, rows, at: new Date() } as never,
      { upsert: true }
    );

  // Close and transition support settled with the market (see closeAtSettlement).
  const close = settled.result.close;
  const paidByCountry = new Map(
    Object.entries((close?.meta?.paidByCountry as Record<string, number> | undefined) ?? {})
  );
  await db.collection<{ _id: string }>(PRODUCER_MARKET_OUTCOMES).updateOne(
    { _id: `${worldEpoch}:${turn}` },
    {
      $set: {
        transitionSupport: {
          paid: Object.fromEntries(paidByCountry),
          coverage: (close?.meta?.coverageByCountry as Record<string, number> | undefined) ?? {},
        },
        closeTransfers: close?.transfers.length ?? 0,
      },
    }
  );

  // Return what each public and construction buyer actually holds. Deriving
  // it from settled anchor cash times the rate drifted by float error past
  // the real balance, and the debit's guard refused the whole move.
  const returnWallets = [
    ...demand.funding.map((f) => ({ countryId: f.countryId, id: publicWallet(f.countryId) })),
    ...demand.investmentFunding.map((f) => ({
      countryId: f.countryId,
      id: investmentWallet(f.countryId),
    })),
  ];
  const heldLocal = new Map(
    (
      await db
        .collection<{ _id: string; cash: number }>(PRODUCER_ACCOUNTS)
        .find({ _id: { $in: returnWallets.map((w) => w.id) } }, { projection: { cash: 1 } })
        .toArray()
    ).map((w) => [w._id, w.cash])
  );
  const returnRow = (countryId: string, id: string) => {
    const left = heldLocal.get(id) ?? 0;
    if (!(Number.isFinite(left) && left > 0)) return [];
    const currency = countryCurrency.get(countryId)!;
    return [
      {
        countryId,
        walletId: id,
        amountLocal: left,
        currencyCode: currency,
        localPerAnchor: rateOf(currency),
      },
    ];
  };
  await apply(
    batchProducerMoves(
      worldEpoch,
      turn,
      publicReturnMoves(
        worldEpoch,
        turn,
        demand.funding.flatMap((f) => returnRow(f.countryId, publicWallet(f.countryId)))
      )
    )
  );
  await apply(
    batchProducerMoves(
      worldEpoch,
      turn,
      investmentReturnMoves(
        worldEpoch,
        turn,
        demand.investmentFunding.flatMap((f) =>
          returnRow(f.countryId, investmentWallet(f.countryId))
        )
      )
    )
  );

  // Transition relief for sectors that struggle after the switch (owner
  // decision 2026-10-21): mark them and tell their owners once.
  await markStrugglingTransitionSectors(
    db,
    lookups,
    receiptsBySectorId,
    turn,
    input.firstFundedTurn
  );

  return {
    receiptsBySectorId,
    settledProfitByCorp,
    headcountBySectorId: demand.headcountBySectorId,
  };
}

/**
 * End-of-turn transfers from settled profit and closing balances: AI profit
 * (60%, capped by cash) to the households where the company employs, and each
 * operating payee's receipts to the households of its state. Player companies
 * keep their profit; state companies remit through the existing SOE sweep.
 */
export function planFundedClose(input: {
  settledProfitByCorp: ReadonlyMap<string, number>;
  /** Closing cash per account, anchor units. */
  closingCash: ReadonlyMap<string, number>;
  ownerKindByCompany: ReadonlyMap<string, ProfitOwnerKind>;
  householdFor: (corpId: string) => string | null;
  householdForPayee: ReadonlyMap<string, string>;
  corpParty: (id: string) => CloseParty;
  walletParty: (id: string) => CloseParty;
}): CloseTransfer[] {
  const transfers: CloseTransfer[] = [];
  const rows = [...input.settledProfitByCorp].flatMap(([accountId, profit]) => {
    const kind = input.ownerKindByCompany.get(accountId);
    if (!kind) return [];
    // State companies keep their profit here: the existing SOE sweep remits
    // to the treasury later in the turn, and remitting twice would drain them.
    const recipient = kind === "ai" ? input.householdFor(accountId) : null;
    return [
      {
        accountId,
        kind,
        profit,
        cash: input.closingCash.get(accountId) ?? 0,
        recipientAccountId: recipient,
      },
    ];
  });
  for (const t of distributeProfits(rows))
    transfers.push({
      reason: t.reason,
      amountAnchor: t.amount,
      from: input.corpParty(t.fromAccountId),
      to: input.walletParty(t.toAccountId),
    });
  for (const [payee, household] of input.householdForPayee) {
    const cash = input.closingCash.get(payee) ?? 0;
    if (payee !== household && cash > 0)
      transfers.push({
        reason: "operating_income",
        amountAnchor: cash,
        from: input.walletParty(payee),
        to: input.walletParty(household),
      });
  }
  return transfers;
}

/**
 * Live carry: physical stock and receipts live on the sector documents, cash in
 * the real accounts. Only the public-buyer basis is carried here: last turn's
 * settled plant value added per country, or on the first funded turn the
 * legacy realized revenue the sectors recorded.
 */
function liveCarry(
  lookups: CorporationLookups,
  worldEpoch: string,
  turn: number
): ShadowCarryState {
  const valueAddedByCountry: Record<string, number> = {};
  for (const corp of lookups.corporations)
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      const country = String(sector.countryId ?? corp.countryId ?? "");
      const r = sector.producerSettlement;
      let va: number;
      if (r && r.worldEpoch === worldEpoch && r.turn === turn - 1)
        va = r.revenue - r.inputsConsumed;
      else {
        const rate = lookups.exchangeRatesByCurrency.get(
          (resolveSectorHostCurrencyCode(sector, corp) ?? "USD") as CurrencyCode
        );
        va = rate && rate > 0 ? (sector.realizedRevenue ?? 0) / rate / TURNS_PER_DAY : 0;
      }
      if (Number.isFinite(va))
        valueAddedByCountry[country] = (valueAddedByCountry[country] ?? 0) + Math.max(0, va);
    }
  return {
    runId: `${worldEpoch}:live`,
    worldEpoch,
    turn: turn - 1,
    predecessorTurn: null,
    schemaVersion: 0,
    codeSha: null,
    accounts: {},
    plants: {},
    payables: [],
    references: {},
    valueAddedByCountry,
  };
}

/**
 * Corporations and sectors founded since the opening join the funded market
 * with empty producer books at the last settled turn. Anything carrying legacy
 * stock or arrears is left alone, so preparation still fails closed on it.
 */
async function admitNewProducerEntrants(
  db: Db,
  lookups: CorporationLookups,
  worldEpoch: string,
  turn: number
): Promise<void> {
  const corpOps: AnyBulkWriteOperation<Corporation>[] = [];
  const sectorOps: AnyBulkWriteOperation<CorporateSector>[] = [];
  for (const corp of lookups.corporations) {
    const sectors = lookups.sectorsByCorp.get(corp._id.toString()) ?? [];
    if (sectors.length === 0) continue;
    const books = newEntrantProducerBooks(corp, "corporation", worldEpoch, turn - 1);
    if (books)
      corpOps.push({
        updateOne: {
          filter: { _id: corp._id, producerPayables: { $exists: false } },
          update: { $set: books },
        },
      });
    for (const sector of sectors) {
      const opening = newEntrantProducerBooks(sector, "sector", worldEpoch, turn - 1);
      if (!opening || !("producerCapacity" in opening)) continue;
      Object.assign(sector, opening);
      sectorOps.push({
        updateOne: {
          filter: { _id: sector._id, producerCapacity: { $exists: false } },
          update: { $set: opening },
        },
      });
    }
  }
  if (corpOps.length > 0)
    await db.collection<Corporation>("corporations").bulkWrite(corpOps, { ordered: false });
  if (sectorOps.length > 0)
    await db
      .collection<CorporateSector>("corporateSectors")
      .bulkWrite(sectorOps, { ordered: false });
}
