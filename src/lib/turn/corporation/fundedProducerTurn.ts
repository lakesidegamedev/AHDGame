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
import { ObjectId, type Db } from "mongodb";
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
  closeTransferMoves,
  householdOpeningMoves,
  transitionSupportMoves,
  PRODUCER_ACCOUNTS,
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
import { NO_PHYSICAL_CAPACITY } from "./producerSectorPlan";
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

  const demand = await buildProducerTurnDemand(db, {
    turn,
    worldEpoch,
    lookups,
    env: input.env,
    sectorOps: [],
    carry: liveCarry(lookups, worldEpoch, turn),
    publicAccountId: publicWallet,
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
  const walletScopes = [...demand.walletScopes, ...publicScopes];
  const scopeById = new Map(walletScopes.map((s) => [producerWalletId(worldEpoch, s), s]));
  await createProducerWallets(db, worldEpoch, walletScopes);

  const apply = async (moves: ReturnType<typeof publicFundingMoves>) => {
    for (const move of moves) {
      let result = await applyMoneyMove(db, move);
      // An existing key may be a move a crash left half done: finish it.
      if (result.status === "replayed") result = await resumeMoneyMove(db, move.key);
      if (result.status !== "applied" && result.status !== "replayed")
        throw new Error(`Producer money move ${move.key} ${result.status}`);
    }
  };

  await apply(
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
      externalOrders: demand.publicBuyerOrders,
      eligibleOffersByOrder: demand.eligibleOffersByOrder,
    },
  });

  const receiptsBySectorId = new Map<string, FundedReceipt>();
  for (const sector of settled.closingSectors) {
    const r = sector.producerSettlement;
    if (r && r.worldEpoch === worldEpoch && r.turn === turn)
      receiptsBySectorId.set(sector._id.toHexString(), {
        revenue: r.revenue,
        profit: r.profit,
        producedUnits: r.producedUnits,
        soldUnits: r.soldUnits,
      });
  }
  for (const sectorId of idleSectorIds)
    if (!receiptsBySectorId.has(sectorId))
      receiptsBySectorId.set(sectorId, { revenue: 0, profit: 0, producedUnits: 0, soldUnits: 0 });
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

  // Close. Cash read from the settled account balances (anchor units).
  const closingCash = new Map(settled.result.accounts.map((a) => [a.id, a.cash]));
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

  const transfers = planFundedClose({
    settledProfitByCorp,
    closingCash,
    ownerKindByCompany: demand.ownerKindByCompany,
    householdFor: (corpId) => demand.firstWalletByCorp.get(corpId)?.wallet ?? null,
    householdForPayee: demand.householdForPayee,
    corpParty,
    walletParty,
  });
  await apply(closeTransferMoves(worldEpoch, turn, transfers));

  // Transition package: over-built sectors get a fading revenue floor, paid
  // only from public funding that would otherwise be burned below.
  const support = input.firstFundedTurn
    ? transitionSupport({
        turn,
        firstFundedTurn: input.firstFundedTurn,
        sectors: lookups.corporations.flatMap((corp) =>
          (lookups.sectorsByCorp.get(corp._id.toString()) ?? []).map((sector) => ({
            sectorId: sector._id.toHexString(),
            countryId: String(sector.countryId ?? corp.countryId ?? ""),
            transition: sector.cutoverTransition,
            settledRevenue: receiptsBySectorId.get(sector._id.toHexString())?.revenue ?? 0,
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
  const sectorOwner = new Map<string, string>();
  for (const corp of lookups.corporations)
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? [])
      sectorOwner.set(sector._id.toHexString(), corp._id.toHexString());
  const paidByCountry = new Map<string, number>();
  await apply(
    transitionSupportMoves(
      worldEpoch,
      turn,
      support.payments.map((p) => {
        paidByCountry.set(p.countryId, (paidByCountry.get(p.countryId) ?? 0) + p.claim);
        return {
          sectorId: p.sectorId,
          amountAnchor: p.claim,
          from: walletParty(publicWallet(p.countryId)),
          to: corpParty(sectorOwner.get(p.sectorId)!),
        };
      })
    )
  );
  for (const [country, paid] of paidByCountry) {
    const id = publicWallet(country);
    closingCash.set(id, (closingCash.get(id) ?? 0) - paid);
  }
  await db.collection<{ _id: string }>(PRODUCER_MARKET_OUTCOMES).updateOne(
    { _id: `${worldEpoch}:${turn}` },
    {
      $set: {
        transitionSupport: {
          paid: Object.fromEntries(paidByCountry),
          coverage: Object.fromEntries(support.coverageByCountry),
        },
      },
    }
  );

  await apply(
    publicReturnMoves(
      worldEpoch,
      turn,
      demand.funding.flatMap((f) => {
        const id = publicWallet(f.countryId);
        const left = closingCash.get(id) ?? 0;
        if (!(left > 0)) return [];
        const currency = countryCurrency.get(f.countryId)!;
        const rate = rateOf(currency);
        return [
          {
            countryId: f.countryId,
            walletId: id,
            amountLocal: left * rate,
            currencyCode: currency,
            localPerAnchor: rate,
          },
        ];
      })
    )
  );

  // The close moved company cash after settlement published it in memory.
  // Later steps of this turn (NPP decisions) price from these objects, so
  // re-read the real balances once rather than let them spend paid-out cash.
  const paidOut = [
    ...new Set(transfers.filter((t) => t.from.collection === "corporations").map((t) => t.from.id)),
  ];
  if (paidOut.length > 0) {
    const fresh = await db
      .collection<{ _id: ObjectId; liquidCapital?: number }>("corporations")
      .find(
        { _id: { $in: paidOut.map((id) => new ObjectId(id)) } },
        { projection: { liquidCapital: 1 } }
      )
      .toArray();
    for (const row of fresh) {
      const corp = corpById.get(row._id.toHexString());
      if (corp && typeof row.liquidCapital === "number") corp.liquidCapital = row.liquidCapital;
    }
  }

  return { receiptsBySectorId, settledProfitByCorp };
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
