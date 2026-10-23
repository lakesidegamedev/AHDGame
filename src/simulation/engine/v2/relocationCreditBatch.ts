/**
 * v2: cohort-batched NPP relocation-bond credit.
 *
 * `resolveNppMarketEntryCredit` is the only DB-touching call inside the NPP
 * decision loop, and it is a per-corporation fan of six reads plus one insert:
 *
 *   bonds (latest, for cooldown)      bonds (unmatured, for existing debt)
 *   corporateSectors (for the NPV)    gameConfig (market mode)
 *   bonds held as a creditor          gameState (currentYear)
 *   corporationHistory (latest income)
 *
 * On the production copy that is ~8 round trips for every corporation that asks
 * for entry credit — ~1.1k of them — which is most of corporationTurn's 9k
 * round trips and ~150s. None of those reads depends on another corporation:
 * every one is keyed by the corp's own id, and a new bond is issued with an
 * empty holder list, so no later corp in the loop can see it. That makes the
 * whole fan preloadable as one cohort bundle and the inserts deferrable to one
 * `insertMany`.
 *
 * The decision math is deliberately duplicated from `issueRelocationBond.ts`
 * rather than shared with it. Sharing would have changed the v1 code the bench
 * compares against, and a shared mistake would then be invisible to the parity
 * run: both engines would agree with each other and disagree with production.
 * v1 stays byte-for-byte what it was; this file is what the bench proves equal
 * to it on a full production-sized copy.
 */

import { ObjectId, type Db } from "mongodb";

import type {
  Bond,
  BondMaturityTurns,
  CentralBank,
  Corporation,
  CorporateSector,
} from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import {
  BOND_ISSUANCE_COOLDOWN_TURNS,
  MAX_BOND_ISSUANCE_FRACTION,
  MAX_BOND_ISSUANCE_EXIT_EQUITY_FRACTION,
  calculateCreditScore,
  getBondCouponRate,
} from "@/lib/constants/bonds";
import {
  corporateBondMaturityLiquidity,
  sumCorporateSectorConstructionInProgress,
  sumCorporateSectorNpv,
} from "@/lib/bonds/corporateCredit";
import { corpExitEquityAnchor } from "@/lib/bonds/corpExitEquity";
import { isBondDefaultCreditPenaltyActive } from "@/lib/bonds/corporateBondDefault";
import { sumBondAnnualInterestAnchor, sumBondPrincipalAnchor } from "@/lib/bonds/bondPrincipalSum";
import { buildPrimeRateByCountry } from "@/lib/centralBank/helpers";
import type { CountryId } from "@/lib/constants/countries";
import { getCountryConfig } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  anchorToCorpCapital,
  corpLiquidCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { getGameState } from "@/lib/gameState";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import type {
  RelocationBondPreflight,
  RelocationPrimeBank,
} from "@/lib/corporations/issueRelocationBond";
import type {
  NppMarketEntryDiagnostic,
  NppMarketEntryReason,
} from "@/lib/turn/npp/entryDiagnostics";

/** The longest corporate tenor (7yr = 336 turns), mirrored from `issueRelocationBond`. */
const RELOCATION_BOND_MATURITY_TURNS: BondMaturityTurns = 336;

export interface RelocationCreditDecision {
  shortageCreditRequest?: { amountLocal: number; sectorType: string };
  entryDiagnostic?: unknown;
}

/** What `resolveNppMarketEntryCredit` needs from its caller, minus the db fan. */
export interface RelocationCreditRequest<T extends RelocationCreditDecision> {
  corporation: Corporation;
  decision: T;
  turn: number;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  corpFxRate: number;
  retry: (creditLocal: number) => T;
}

export type NppEntryReasonWriter = (
  diagnostic: NppMarketEntryDiagnostic | undefined,
  reason: NppMarketEntryReason
) => NppMarketEntryDiagnostic | undefined;

export interface RelocationCreditBatch {
  /**
   * Resolve one corporation's entry credit. Drop-in for
   * `resolveNppMarketEntryCredit`; the first call that actually needs credit
   * loads the cohort bundle once, and every bond is queued for `flush()`.
   */
  resolve<T extends RelocationCreditDecision>(request: RelocationCreditRequest<T>): Promise<T>;
  /** Insert every queued bond in loop order. No-op when nothing was issued. */
  flush(): Promise<void>;
  /** What the pass actually queued, for the turn log and the bench. */
  stats(): { corporations: number; issuedBonds: number; cohortQueries: number };
}

interface CohortInputs {
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  centralBanks: readonly CentralBank[];
  primeRateByCountry: Map<CountryId, number>;
  plantsEnabled: boolean;
  currentYear?: number | null;
  eraUnitScale: number;
  /** Every bond this corp issued, matured or not — cooldown needs the latest one. */
  issuedBondsByCorpId: Map<string, Bond[]>;
  /** Unmatured bonds this corp holds as a creditor, matched exactly like v1. */
  heldBondsByCorpId: Map<string, Bond[]>;
  /** Latest `corporationHistory.income` (home currency) per corp. */
  latestIncomeByCorpId: Map<string, number>;
}

/**
 * Build the cohort batcher for one NPP decision pass.
 *
 * `sectorsByCorp` is the map the decision pass already built for every corp, so
 * the NPV leg needs no read at all in v2. `heldBondsByCorpId` is the creditor
 * map the pass already loaded for debt service, so the exit-equity leg needs no
 * read either. `bankRates` is the same snapshot the per-corp path passes to
 * `previewRelocationBond`.
 */
export function createRelocationCreditBatch(input: {
  db: Db;
  corporations: readonly Corporation[];
  sectorsByCorp: ReadonlyMap<string, readonly CorporateSector[]>;
  heldBondsByCorpId: ReadonlyMap<string, readonly { bond: Bond; units: number }[]>;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  bankRates?: readonly RelocationPrimeBank[];
  writeReason: NppEntryReasonWriter;
}): RelocationCreditBatch {
  const { db, corporations, sectorsByCorp, heldBondsByCorpId, fxByCurrency, bankRates } = input;
  let inputsPromise: Promise<CohortInputs> | null = null;
  let cohortQueries = 0;
  let issuedBonds = 0;
  const pendingBonds: Bond[] = [];

  function withReason<T extends RelocationCreditDecision>(decision: T, reason: string): T {
    return {
      ...decision,
      entryDiagnostic: input.writeReason(
        decision.entryDiagnostic as NppMarketEntryDiagnostic | undefined,
        reason as NppMarketEntryReason
      ),
    };
  }

  async function loadCohort(): Promise<CohortInputs> {
    const corpIds = corporations.map((corp) => corp._id);
    // Five reads total, all cohort-wide. `loadWorldEraUnitScale` is phase-cached
    // by trace id, so it is normally free here; `getGameState` is the same
    // singleton the per-corp path reads.
    const [allIssuedBonds, latestIncomeRows, centralBanks, plantsEnabled, gameState, eraUnitScale] =
      await Promise.all([
        db
          .collection<Bond>("bonds")
          .find(
            { corporationId: { $in: corpIds } },
            {
              projection: {
                corporationId: 1,
                issuedAtTurn: 1,
                maturityTurn: 1,
                matured: 1,
                defaulted: 1,
                totalIssued: 1,
                currencyCode: 1,
                couponRate: 1,
                faceValue: 1,
              },
            }
          )
          .toArray(),
        db
          .collection<{ corporationId: ObjectId; income?: number }>("corporationHistory")
          .aggregate<{ _id: ObjectId; income: number }>([
            { $match: { corporationId: { $in: corpIds } } },
            { $sort: { corporationId: 1, turn: -1 } },
            { $group: { _id: "$corporationId", income: { $first: "$income" } } },
          ])
          .toArray(),
        bankRates
          ? Promise.resolve(bankRates as readonly CentralBank[])
          : db
              .collection<CentralBank>("centralBanks")
              .find({}, { projection: { _id: 1, countryId: 1, primeRate: 1 } })
              .toArray(),
        getMarketSystemModeForDb(db).then((mode) => marketAtLeast(mode, "plants")),
        getGameState(db),
        loadWorldEraUnitScale(db),
      ]);
    cohortQueries = 5;

    const issuedByCorp = new Map<string, Bond[]>();
    for (const bond of allIssuedBonds) {
      const id = bond.corporationId?.toString();
      if (!id) continue;
      const list = issuedByCorp.get(id);
      if (list) list.push(bond);
      else issuedByCorp.set(id, [bond]);
    }

    // Creditor holdings: exactly the set `loadCorpExitEquityAnchor` would read
    // for this corp (`holders.corporationId`, unmatured), deduped by bond id so
    // a bond with two holder rows for one corp is counted once.
    const heldByCorp = new Map<string, Map<string, Bond>>();
    for (const [corpId, holdings] of heldBondsByCorpId) {
      const byId = new Map<string, Bond>();
      for (const { bond } of holdings) {
        byId.set(bond._id.toString(), bond);
      }
      heldByCorp.set(corpId, byId);
    }

    const latestIncome = new Map<string, number>();
    for (const row of latestIncomeRows) {
      if (typeof row.income === "number") latestIncome.set(row._id.toString(), row.income);
    }

    return {
      fxByCurrency,
      centralBanks,
      primeRateByCountry: buildPrimeRateByCountry(centralBanks),
      plantsEnabled,
      currentYear: gameState?.currentYear ?? null,
      eraUnitScale,
      issuedBondsByCorpId: issuedByCorp,
      heldBondsByCorpId: new Map([...heldByCorp].map(([id, byId]) => [id, [...byId.values()]])),
      latestIncomeByCorpId: latestIncome,
    };
  }

  function cohort(): Promise<CohortInputs> {
    inputsPromise ??= loadCohort();
    return inputsPromise;
  }

  async function resolve<T extends RelocationCreditDecision>(
    request: RelocationCreditRequest<T>
  ): Promise<T> {
    const creditRequest = request.decision.shortageCreditRequest;
    if (!creditRequest) return request.decision;

    const corpId = request.corporation._id.toString();
    const roundedLocal =
      Math.ceil(creditRequest.amountLocal / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
    const requestedAnchor = corpLiquidCapitalToAnchor(
      roundedLocal,
      request.corporation,
      request.corpFxRate
    );
    const data = await cohort();

    const issued = data.issuedBondsByCorpId.get(corpId) ?? [];
    let latestBond: Bond | null = null;
    for (const bond of issued) {
      if (!latestBond || bond.issuedAtTurn > latestBond.issuedAtTurn) latestBond = bond;
    }
    const existingBonds = issued.filter((bond) => bond.matured !== true);
    const heldBonds = data.heldBondsByCorpId.get(corpId) ?? [];
    const sectors = [...(sectorsByCorp.get(corpId) ?? [])];

    const preflight = computePreflight({
      corporation: request.corporation,
      currentTurn: request.turn,
      relocationCostAnchor: requestedAnchor,
      latestBond,
      existingBonds,
      sectors,
      heldBonds,
      fxByCurrency: data.fxByCurrency,
      centralBanks: data.centralBanks,
      primeRateByCountry: data.primeRateByCountry,
      plantsEnabled: data.plantsEnabled,
      currentYear: data.currentYear,
      eraUnitScale: data.eraUnitScale,
      latestIncomeLocal: data.latestIncomeByCorpId.get(corpId) ?? 0,
    });

    if (!preflight.ok) {
      return withReason(
        request.decision,
        preflight.cooldownTurnsRemaining != null ? "credit_cooldown" : "credit_capacity"
      );
    }

    const planned = planBond({
      corporation: request.corporation,
      relocationCostAnchor: requestedAnchor,
      currentTurn: request.turn,
      preflight,
      fxByCurrency: data.fxByCurrency,
    });
    if (!planned.ok) return withReason(request.decision, "credit_issuance_failed");
    if (planned.plan.result.bondFaceValueLocal < creditRequest.amountLocal) {
      return withReason(request.decision, "credit_rounding_shortfall");
    }

    pendingBonds.push(planned.plan.doc);
    issuedBonds += 1;
    return request.retry(planned.plan.result.bondFaceValueLocal);
  }

  async function flush(): Promise<void> {
    if (pendingBonds.length === 0) return;
    const docs = [...pendingBonds];
    pendingBonds.length = 0;
    await db.collection<Bond>("bonds").insertMany(docs, { ordered: true });
  }

  return {
    resolve,
    flush,
    stats: () => ({
      corporations: corporations.length,
      issuedBonds,
      cohortQueries,
    }),
  };
}

/**
 * The pre-flight decision, mirroring `previewRelocationBond`'s post-read math
 * exactly. Every input is preloaded; nothing here touches the database.
 *
 * Deliberately uses `centralBanks.find(countryId)` for the prime rate, not the
 * member-aware `primeRateByCountry` map: v1 quotes the coupon from the exact
 * country's bank and falls back to the country default, and a shared-bank member
 * (IE → ECB) resolves its rate elsewhere. The map is still used where v1 uses
 * it, in the sector-NPV leg.
 */
function computePreflight(input: {
  corporation: Corporation;
  currentTurn: number;
  relocationCostAnchor: number;
  latestBond: Pick<Bond, "issuedAtTurn"> | null;
  existingBonds: Bond[];
  sectors: CorporateSector[];
  heldBonds: Bond[];
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  centralBanks: readonly CentralBank[];
  primeRateByCountry: Map<CountryId, number>;
  plantsEnabled: boolean;
  currentYear?: number | null;
  eraUnitScale: number;
  latestIncomeLocal: number;
}): RelocationBondPreflight {
  let cooldownTurnsRemaining: number | null = null;
  if (input.latestBond) {
    const cooldownEnd = input.latestBond.issuedAtTurn + BOND_ISSUANCE_COOLDOWN_TURNS;
    if (input.currentTurn < cooldownEnd) cooldownTurnsRemaining = cooldownEnd - input.currentTurn;
  }

  const existingDebt = sumBondPrincipalAnchor(input.existingBonds, input.fxByCurrency);
  const corpFxRate =
    input.fxByCurrency.get(resolveCorpLiquidCurrencyCode(input.corporation) ?? "USD") ?? 1;
  const liquidCapitalAnchor = corpLiquidCapitalToAnchor(
    input.corporation.liquidCapital,
    input.corporation,
    corpFxRate
  );
  const sectorNPV = sumCorporateSectorNpv(
    input.sectors,
    input.corporation._id,
    input.primeRateByCountry,
    input.corporation,
    input.fxByCurrency,
    input.plantsEnabled
  );
  const totalEquity =
    liquidCapitalAnchor +
    sectorNPV +
    sumCorporateSectorConstructionInProgress(
      input.sectors,
      input.corporation._id,
      input.currentTurn
    );

  const { exitEquityAnchor } = corpExitEquityAnchor({
    liquidCapitalAnchor,
    sectors: input.sectors,
    corporationId: input.corporation._id,
    corp: input.corporation,
    fxByCurrency: input.fxByCurrency,
    primeRateByCountry: input.primeRateByCountry,
    bonds: input.heldBonds,
    plantsEnabled: input.plantsEnabled,
    currentYear: input.currentYear,
    currentTurn: input.currentTurn,
    eraUnitScale: input.eraUnitScale,
  });

  const availableBondCapacity = Math.max(
    0,
    Math.min(
      totalEquity * MAX_BOND_ISSUANCE_FRACTION - existingDebt,
      exitEquityAnchor * MAX_BOND_ISSUANCE_EXIT_EQUITY_FRACTION - existingDebt
    )
  );

  const annualIncome = corpLiquidCapitalToAnchor(
    input.latestIncomeLocal * TURNS_PER_YEAR,
    input.corporation,
    corpFxRate
  );
  const annualInterest = sumBondAnnualInterestAnchor(input.existingBonds, input.fxByCurrency);
  const penaltyActive = isBondDefaultCreditPenaltyActive(input.corporation, input.currentTurn);
  const creditResult = calculateCreditScore(
    liquidCapitalAnchor,
    existingDebt + input.relocationCostAnchor,
    annualIncome,
    annualInterest,
    totalEquity,
    {
      bondDefaultCreditPenaltyActive: penaltyActive,
      nearTermLiquidityScore:
        corporateBondMaturityLiquidity({
          bonds: input.existingBonds,
          liquidCapitalAnchor,
          incomePerTurn: annualIncome / TURNS_PER_YEAR,
          annualCouponObligations: annualInterest,
          currentTurn: input.currentTurn,
          fxByCurrency: input.fxByCurrency,
        }).liquidityScore ?? undefined,
    }
  );
  const centralBank = input.centralBanks.find(
    (bank) => bank.countryId === input.corporation.countryId
  );
  const primeRate =
    centralBank?.primeRate ??
    getCountryConfig(input.corporation.countryId).centralBank.defaultPrimeRate;
  const couponRate = getBondCouponRate(
    primeRate,
    creditResult.rating,
    RELOCATION_BOND_MATURITY_TURNS
  );

  const withinLeverage =
    existingDebt + input.relocationCostAnchor <= totalEquity * MAX_BOND_ISSUANCE_FRACTION &&
    existingDebt + input.relocationCostAnchor <=
      exitEquityAnchor * MAX_BOND_ISSUANCE_EXIT_EQUITY_FRACTION;

  return {
    ok: cooldownTurnsRemaining === null && withinLeverage,
    cooldownTurnsRemaining,
    availableBondCapacity,
    creditRating: creditResult.rating,
    couponRate,
    existingDebt,
    totalEquity,
  };
}

interface PlannedBond {
  bondFaceValue: number;
  bondFaceValueLocal: number;
  couponRate: number;
  creditRating: string;
  totalUnits: number;
}

/** Mirrors the document `issueRelocationBond` inserts on its non-session path. */
function planBond(input: {
  corporation: Corporation;
  relocationCostAnchor: number;
  currentTurn: number;
  preflight: RelocationBondPreflight;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
}): { ok: true; plan: { doc: Bond; result: PlannedBond } } | { ok: false; message: string } {
  const corpCurrencyCode = resolveCorpLiquidCurrencyCode(input.corporation);
  const corpFxRate = input.fxByCurrency.get(corpCurrencyCode ?? "USD") ?? 1;
  const relocationCostLocal = anchorToCorpCapital(
    input.relocationCostAnchor,
    corpCurrencyCode,
    corpFxRate
  );
  const totalUnits = Math.floor(relocationCostLocal / BOND_UNIT_FACE_VALUE);
  if (totalUnits <= 0) return { ok: false, message: "Relocation cost too low for bond issuance" };
  const actualFaceValueLocal = totalUnits * BOND_UNIT_FACE_VALUE;
  const actualFaceValueAnchor = corpLiquidCapitalToAnchor(
    actualFaceValueLocal,
    input.corporation,
    corpFxRate
  );

  const now = new Date();
  const doc: Bond = {
    // Generated here, not at flush: v1 inserts each bond inside the decision
    // loop, so its id is consumed at this point in the run. Matching that order
    // is what keeps ids comparable across the two engines.
    _id: new ObjectId(),
    corporationId: input.corporation._id,
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate: input.preflight.couponRate!,
    maturityTurns: RELOCATION_BOND_MATURITY_TURNS,
    issuedAtTurn: input.currentTurn,
    maturityTurn: input.currentTurn + RELOCATION_BOND_MATURITY_TURNS,
    marketPrice: 1.0,
    totalIssued: actualFaceValueLocal,
    publicFloat: totalUnits,
    holders: [],
    defaulted: false,
    defaultedAtTurn: null,
    matured: false,
    restructureHaircutPercent: null,
    restructureExtendedMaturityTurn: null,
    originalMaturityTurn: null,
    originalTotalIssued: null,
    currencyCode: corpCurrencyCode,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    plan: {
      doc,
      result: {
        bondFaceValue: actualFaceValueAnchor,
        bondFaceValueLocal: actualFaceValueLocal,
        couponRate: input.preflight.couponRate!,
        creditRating: input.preflight.creditRating!,
        totalUnits,
      },
    },
  };
}
