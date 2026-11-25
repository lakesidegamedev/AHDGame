import type { NewHouseholdIncomeRow } from "@/lib/market/producerMarket/newHouseholdIncomeRules";
import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { resumeProducerTurn } from "@/lib/market/producerMarket/settlement";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { getMacroCountriesCollection } from "@/lib/db/collections/macroCountries";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { FISCAL_SCALE_STAGE } from "@/lib/budget/rules/fiscalScale";
import { producerWalletId, type ProducerWalletScope } from "./producerWallets";
import { publishHostState } from "./producerMarketPhase";
import { stateAdvanceKey } from "./stateRunAdvance";
import {
  fundedReceiptOf,
  producerMoveApplier,
  type RunFundedProducerTurnStageContext as C,
} from "./fundedProducerTurn";
import {
  publishFundedProducerTurn,
  type FundedPublicationContext as P,
} from "./settleFundedProducerTurn";

export function snapshotFundedHost(context: P) {
  return {
    version: 1 as const,
    openingTurn: context.openingTurn,
    idleSectorIds: context.idleSectorIds,
    rates: [...context.advanceCtx.rates],
    countryCurrency: [...context.countryCurrency],
    budgetIdByCountry: [...context.budgetIdByCountry],
    scopeById: [...context.scopeById],
    traders: context.traders.map((t) => ({ ...t, macroId: String(t.macroId) })),
    backgroundWarnings: context.background.warnings,
    stateAdvances: [...context.stateAdvances],
    treasuryFunded: context.treasuryFunded ? [...context.treasuryFunded] : null,
    openingShareByCountry: context.openingShareByCountry
      ? [...context.openingShareByCountry]
      : null,
    shortageOn: context.shortageOn,
    carryShare: context.carryShare,
    tariffScopes: context.tariffScopes,
    tariffCollector: [...context.tariffCollector],
    priorPostureAnchors: context.priorPostureAnchors ?? null,
    env: {
      captiveDeliveryStage: context.input.env.captiveDeliveryStage ?? 0,
      nationalPublicDemandStage: context.input.env.nationalPublicDemandStage ?? 0,
      fundedRestartStage: context.input.env.fundedRestartStage ?? 0,
      shortageBuildFactor: context.input.env.shortageBuildFactor ?? 0,
      clearingReferenceStage: context.input.env.clearingReferenceStage ?? 0,
      fundedBookStage: context.input.env.fundedBookStage ?? 0,
    },
    firstFundedTurn: context.input.firstFundedTurn,
    demand: {
      headcountBySectorId: [...context.demand.headcountBySectorId],
      firstWalletByCorp: [...context.demand.firstWalletByCorp],
      planSector: [...context.demand.planSector],
      backgroundOffers: context.demand.backgroundOffers,
      backgroundOrders: context.demand.backgroundOrders,
      householdSource: context.demand.householdSource,
      // Absent on older snapshots and on legacy recovery: the audit then skips.
      newHouseholdIncome: (context.demand.newHouseholdIncome ?? []) as
        readonly NewHouseholdIncomeRow[] | undefined,
      funding: context.demand.funding.map((f) => ({ countryId: f.countryId })),
      investmentFunding: context.demand.investmentFunding.map((f) => ({ countryId: f.countryId })),
    },
  };
}
type Snapshot = ReturnType<typeof snapshotFundedHost>;
type Input = C["input"];
type Resumed = NonNullable<Awaited<ReturnType<typeof resumeProducerTurn>>>;

function restore(snapshot: Snapshot, db: Db, input: Input): P {
  if (snapshot.version !== 1) throw new Error("Unsupported funded host recovery version");
  const rates = new Map(snapshot.rates);
  const countryCurrency = new Map(snapshot.countryCurrency);
  const rateOf = (code: string | null | undefined) => {
    const rate = rates.get(code as CurrencyCode);
    if (!rate || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Missing frozen producer currency rate");
    return rate;
  };
  const wallet = (kind: "publicBuyer" | "investmentBuyer", countryId: string) => {
    const currency = countryCurrency.get(countryId);
    if (!currency) throw new Error("Missing frozen producer budget currency");
    return producerWalletId(input.worldEpoch, { kind, countryId, currency });
  };
  return {
    ...snapshot,
    db,
    turn: input.turn,
    worldEpoch: input.worldEpoch,
    lookups: input.lookups,
    input: {
      ...input,
      firstFundedTurn: snapshot.firstFundedTurn,
      env: { ...input.env, ...snapshot.env },
    },
    advanceCtx: {
      worldEpoch: input.worldEpoch,
      turn: input.turn,
      now: new Date(),
      rates,
      treasuryCurrency: (c) => countryCurrency.get(c),
    },
    stateAdvances: new Map(snapshot.stateAdvances),
    countryCurrency,
    budgetIdByCountry: new Map(snapshot.budgetIdByCountry),
    scopeById: new Map(snapshot.scopeById),
    traders: snapshot.traders,
    background: { traders: [], warnings: snapshot.backgroundWarnings },
    openingShareByCountry: snapshot.openingShareByCountry
      ? new Map(snapshot.openingShareByCountry)
      : undefined,
    treasuryFunded: snapshot.treasuryFunded ? new Map(snapshot.treasuryFunded) : null,
    tariffCollector: new Map(snapshot.tariffCollector),
    corpById: new Map(input.lookups.corporations.map((c) => [String(c._id), c])),
    rateOf,
    publicWallet: (c) => wallet("publicBuyer", c),
    investmentWallet: (c) => wallet("investmentBuyer", c),
    apply: producerMoveApplier(db, input.turn),
    fundedReceiptOf,
    demand: {
      ...snapshot.demand,
      headcountBySectorId: new Map(snapshot.demand.headcountBySectorId),
      firstWalletByCorp: new Map(snapshot.demand.firstWalletByCorp),
      planSector: new Map(snapshot.demand.planSector),
    },
  };
}

async function legacySnapshot(db: Db, input: Input, resumed: Resumed): Promise<Snapshot> {
  const scopes = new Map<string, ProducerWalletScope>();
  const rates = new Map(input.lookups.exchangeRatesByCurrency);
  for (const binding of resumed.bindings) {
    rates.set(binding.currency as CurrencyCode, binding.localPerAnchor);
    if (binding.kind === "corporation") continue;
    const [epoch, kind, countryId, stateId, currency] = JSON.parse(binding.accountId);
    const scope = {
      kind,
      countryId,
      ...(stateId ? { stateId } : {}),
      currency,
    } as ProducerWalletScope;
    if (epoch !== input.worldEpoch || producerWalletId(epoch, scope) !== binding.accountId)
      throw new Error("Invalid frozen producer wallet identity");
    scopes.set(binding.accountId, scope);
  }
  const budgets = await federalBudgetCollection(db)
    .find({}, { projection: { countryId: 1, currencyCode: 1, currency: 1 } })
    .toArray();
  const countryCurrency = new Map<string, CurrencyCode>();
  const budgetIds = new Map<string, string>();
  for (const b of budgets) {
    const currency = resolveCountryCurrencyCode(b);
    if (currency) countryCurrency.set(String(b.countryId), currency as CurrencyCode);
    budgetIds.set(String(b.countryId), String(b._id));
  }
  for (const scope of scopes.values())
    if (["publicBuyer", "investmentBuyer", "wideEconomy"].includes(scope.kind))
      countryCurrency.set(scope.countryId, scope.currency);
  const stateIds = input.lookups.corporations
    .filter((c) => c.countryOwnerId)
    .map((c) => String(c._id));
  const moves = await bankMoneyMovesCollection<{
    _id: string;
    legs?: {
      collection?: string;
      filter: { _id: ObjectId };
      amount: number;
      valuation?: { localPerAnchor: number };
    }[];
    status?: string;
  }>(db)
    .find(
      { _id: { $in: stateIds.map((id) => stateAdvanceKey(input.worldEpoch, input.turn, id)) } },
      { projection: { legs: 1, status: 1 } }
    )
    .toArray();
  const advances: [string, number][] = [];
  for (const move of moves) {
    const leg = move.legs?.find((l: { collection?: string }) => l.collection === "corporations");
    if (move.status !== "rejected" && leg?.valuation?.localPerAnchor)
      advances.push([String(leg.filter._id), leg.amount / leg.valuation.localPerAnchor]);
  }
  const background = [...scopes].filter(([, s]) => s.kind === "backgroundEconomy");
  const macros = background.length
    ? await (
        await getMacroCountriesCollection(db)
      )
        .find(
          { entityId: { $in: background.map(([, s]) => s.countryId) } },
          { projection: { entityId: 1, fundedTrade: 1 } }
        )
        .toArray()
    : [];
  const macroByCountry = new Map(macros.map((m) => [String(m.entityId), m]));
  const traders: Snapshot["traders"] = background.map(([accountId, scope]) => {
    const macro = macroByCountry.get(scope.countryId);
    if (!macro) throw new Error("Missing frozen background country");
    return {
      countryId: scope.countryId,
      accountId,
      scope,
      currency: scope.currency,
      macroId: String(macro._id),
      byCommodity: {},
      fundedTrade: macro.fundedTrade,
    };
  });
  const targets = new Map(resumed.targets.map((t) => [t.producerId, t]));
  const first = new Map<string, { sectorId: string; wallet: string }>();
  for (const plan of resumed.request.producers) {
    const target = targets.get(plan.id)!;
    const old = first.get(plan.accountId);
    if (!old || target.sectorId < old.sectorId)
      first.set(plan.accountId, {
        sectorId: target.sectorId,
        wallet: plan.labourRecipientAccountId,
      });
  }
  const fund = (kind: ProducerWalletScope["kind"]) =>
    [...scopes.values()].filter((s) => s.kind === kind).map((s) => ({ countryId: s.countryId }));
  return {
    version: 1,
    openingTurn: Math.min(input.turn - 1, ...resumed.targets.map((t) => t.capacity.completedTurn)),
    idleSectorIds: [],
    rates: [...rates],
    countryCurrency: [...countryCurrency],
    budgetIdByCountry: [...budgetIds],
    scopeById: [...scopes],
    traders,
    backgroundWarnings: [],
    stateAdvances: advances,
    treasuryFunded:
      (input.env.fiscalScaleStage ?? 0) >= FISCAL_SCALE_STAGE.TAX_AND_SPEND
        ? budgets.map((b) => [
            String(b.countryId),
            { budgetId: String(b._id), cashLocal: 0, scale: 1, bookPrimaryPerTurn: 0 },
          ])
        : null,
    openingShareByCountry: null,
    shortageOn: (input.env.shortageGrowthStage ?? 0) >= 1,
    carryShare: input.env.publicCarryShare ?? 0,
    tariffScopes: [...scopes.values()].filter((s) => s.kind === "tariffCollector"),
    tariffCollector: [...scopes]
      .filter(([, s]) => s.kind === "tariffCollector")
      .map(([id, s]) => [s.countryId, id]),
    priorPostureAnchors: null,
    env: {
      captiveDeliveryStage: input.env.captiveDeliveryStage ?? 0,
      nationalPublicDemandStage: input.env.nationalPublicDemandStage ?? 0,
      fundedRestartStage: input.env.fundedRestartStage ?? 0,
      shortageBuildFactor: input.env.shortageBuildFactor ?? 0,
      clearingReferenceStage: input.env.clearingReferenceStage ?? 0,
      fundedBookStage: input.env.fundedBookStage ?? 0,
    },
    firstFundedTurn: input.firstFundedTurn,
    demand: {
      headcountBySectorId: [],
      firstWalletByCorp: [...first],
      planSector: resumed.targets.map((t) => [t.producerId, t.sectorId]),
      backgroundOffers: [...(resumed.request.externalOffers ?? [])],
      backgroundOrders: (resumed.request.externalOrders ?? []).filter(
        (o) => scopes.get(o.accountId)?.kind === "backgroundEconomy"
      ),
      householdSource: null,
      newHouseholdIncome: undefined,
      funding: fund("publicBuyer"),
      investmentFunding: fund("investmentBuyer"),
    },
  };
}

export async function resumeFundedProducerTurn(db: Db, input: Input) {
  const resumed = await resumeProducerTurn(db, input);
  if (!resumed) return null;
  const snapshot = resumed.result.close?.meta?.fundedHost as Snapshot | undefined;
  const context = restore(snapshot ?? (await legacySnapshot(db, input, resumed)), db, input);
  if (!snapshot) {
    context.zeroSalesPreviouslyPublished = !!(await producerMarketOutcomesCollection<{
      _id: string;
    }>(db).findOne({ _id: `${input.worldEpoch}:${input.turn}` }, { projection: { _id: 1 } }));
  }
  return publishFundedProducerTurn(
    context,
    await publishHostState(db, input.lookups.corporations, resumed)
  );
}
