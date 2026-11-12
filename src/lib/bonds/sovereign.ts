/**
 * Government debt and why it grows: sovereign bond issuance. Every 12 turns
 * (shouldIssueQuarterlySovereignBondSeries) a country running a deficit issues a
 * quarter of its annual deficit as bonds (calculateQuarterlyIssuanceAmount) at
 * prime plus a term premium (getSovereignCouponRate); maturing bonds roll over
 * (calculateSovereignRolloverAmount) and unsold units are monetized. The budget's
 * debt principal and debt interest line move with each issue.
 */
/**
 * Sovereign bond issuance + gov-budget accounting.
 *
 * **Currency (v0.2.6):** Sovereign bonds are issued in the country's currency
 * (stamped onto `Bond.currencyCode` via `resolveCountryCurrencyCode`, matching
 * the issuing federal budget's currency). Because `bondDoc.totalIssued`,
 * `annualCouponCost`, and `federalBudget.debt.principal` /
 * `spending.debtInterest` all live in the same country currency, the
 * `applySovereignDebtAdjustment` arithmetic here is same-currency — no FX is
 * needed on issuance.
 *
 * Cross-currency flows (a holder whose home currency differs from the bond's)
 * settle at coupon-payment time in the bond turn processor, not here.
 */
import { ObjectId, type Db } from "mongodb";
import type {
  Bond,
  BondMaturityTurns,
  CreditRating,
  Corporation,
  FederalBudget,
  GameConfig,
  GameState,
} from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import {
  calculateSovereignCouponRate,
  sovereignCreditSpreadPp,
} from "@/lib/bonds/rules/sovereignCreditSpread";
import {
  consolidateSovereignTranches,
  planSovereignTranches,
  SOVEREIGN_MIN_TRANCHE_UNITS,
} from "@/lib/bonds/sovereignIssueDiagnostics";
import { COUNTRY_CONFIGS, getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { getBankId } from "@/lib/centralBank/helpers";

export { sovereignMaturityCentralBankId } from "./sovereignMaturityPayoutTargets";
import { federalSurplus } from "@/lib/budget/federalSurplus";
import {
  calculateCreditRating,
  calculateInterestRate,
  getSovereignConfidencePremium,
} from "@/lib/budget/debt";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { sovereignCredibilitySpread } from "@/lib/centralBank/marketEffects";
import { readPoolForPrimary } from "@/lib/bonds/primaryMarket";
import { loadPrimaryAccounting, primarySettlementExists } from "./sovereignPrimarySettlement";
import {
  sumOutstandingSovereignPrincipal,
  sovereignDebtTerms,
} from "@/lib/bonds/sovereignPrincipal";
import { loadDemocraticHealth } from "@/lib/governanceStyle/loadDemocraticHealth";
import { democraticHealthSovereignSpread } from "@/lib/governanceStyle/rules/democraticConsequences";
import { publicFloatNovationShare } from "./rules/publicFloatNovation";
import { debtManagerMaturityMix, presetUsesLongSovereignTenors } from "./rules/sovereignTenors";
export {
  settleSovereignBondMaturity,
  marketSovereignRolloverCoupon,
  buildSovereignMaturityPayoutLegs,
  freezeFundedSovereignBondMaturityQuote,
  settleFundedSovereignBondMaturity,
  resyncSovereignPrincipalFromBonds,
  type SovereignMaturitySettlement,
  type SovereignPrincipalResync,
} from "./sovereignMaturity";
import { fundSovereignSeries } from "./sovereignFunding";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
export { refreshSovereignDebtTerms } from "./sovereignFunding";

export const SOVEREIGN_ISSUANCE_INTERVAL_TURNS = 12;
/** Policy-rate history (turns) the debt manager compares the current rate against: four years. */
export const DEBT_MANAGER_RATE_HISTORY_TURNS = 192;
export const SOVEREIGN_BOND_MATURITY_TURNS: BondMaturityTurns = 48;

/**
 * Term premium (pp over prime rate) added to sovereign bond coupon for longer-dated paper.
 * Mirrors real-world yield-curve steepening: 1yr T-bills at par prime, 2yr notes +0.25pp,
 * 5yr bonds +0.75pp, 10yr +1.25pp and 30yr +1.75pp (the long tenors issue only in worlds
 * that opt in, see ./rules/sovereignTenors). Used by issuance and the admin auto-reconcile
 * endpoint.
 */
export const SOVEREIGN_BOND_TERM_PREMIUMS: Partial<Record<BondMaturityTurns, number>> = {
  48: 0,
  96: 0.25,
  240: 0.75,
  480: 1.25,
  1440: 1.75,
};

/**
 * Default stagger distribution for the admin auto-reconcile.
 * Values are fractional shares of the uncovered gap; they must sum to 1.
 * Includes 1yr (48t) paper — reconcile bonds are stamped `reconcile: true`
 * so the quarterly scheduler's dedup query (which excludes reconcile bonds)
 * never treats them as a reason to skip regular issuance.
 */
export const SOVEREIGN_RECONCILE_DISTRIBUTION: Partial<Record<BondMaturityTurns, number>> = {
  48: 0.25,
  96: 0.35,
  240: 0.4,
};

export async function loadDemocraticSovereignSpread(db: Db, countryId: CountryId): Promise<number> {
  const gameState = await gameStateCollection(db).findOne({ _id: "current" });
  const health = await loadDemocraticHealth(db, countryId, gameState);
  return health == null ? 0 : democraticHealthSovereignSpread(health);
}

/**
 * Effective sovereign coupon rate = primeRate + term premium, issuer credit risk,
 * and any central-bank credibility or democratic spread.
 * Rounds to 2 dp so stored rates stay human-readable.
 *
 * Both optional spread inputs default to 0 for legacy callers that lack current
 * issuer-risk or scrutiny inputs.
 */
export function getSovereignCouponRate(
  primeRate: number,
  maturityTurns: BondMaturityTurns,
  credibilitySpreadPp = 0,
  issuerRiskSpreadPp = 0
): number {
  const termPremium = SOVEREIGN_BOND_TERM_PREMIUMS[maturityTurns] ?? 0;
  return calculateSovereignCouponRate({
    primeRate,
    termPremiumPp: termPremium,
    credibilitySpreadPp,
    issuerRiskSpreadPp,
  });
}

export function isSovereignBond(bond: Pick<Bond, "issuerType">): boolean {
  return bond.issuerType === "sovereign";
}

export function isCorporateBond(bond: Pick<Bond, "issuerType">): boolean {
  return !isSovereignBond(bond);
}

export function getBondCountryId(bond: Pick<Bond, "issuerType" | "countryId">): CountryId {
  if (isSovereignBond(bond) && bond.countryId) {
    return bond.countryId;
  }

  return COUNTRY_CONFIGS.US.id;
}

export function getNationalBudgetId(countryId: CountryId): string {
  // The US federal budget uses the legacy "federal" document ID.
  // Every other country's national budget document uses its country code as _id.
  return countryId === COUNTRY_CONFIGS.US.id ? "federal" : countryId;
}

/**
 * Resolve the sovereign-bond issuer corporation for a country: the primary
 * National Corporation. Prefers the `isPrimaryNationalCorporation` flag; falls
 * back to any `{ countryOwnerId }` so unflagged countries still resolve.
 * Sorted on `_id` so duplicate flagged primaries resolve deterministically.
 */
async function findPrimaryNationalCorporation(
  db: Db,
  countryId: CountryId
): Promise<Pick<Corporation, "_id" | "name"> | null> {
  const corps = corporationsCollection(db);
  return (
    (await corps
      .find({ countryOwnerId: countryId, isPrimaryNationalCorporation: true })
      .sort({ _id: 1 })
      .limit(1)
      .next()) ?? (await corps.find({ countryOwnerId: countryId }).sort({ _id: 1 }).limit(1).next())
  );
}

/**
 * Infer countryId from a federalBudget document's _id.
 * - "federal" → US (historical naming, presidential system)
 * - Otherwise, the _id is the countryId directly (UK, JP, BR, etc.)
 */
function getCountryIdFromBudgetId(budgetId: string): CountryId {
  if (budgetId === "federal") return COUNTRY_CONFIGS.US.id;
  if (budgetId in COUNTRY_CONFIGS) return budgetId as CountryId;
  return COUNTRY_CONFIGS.US.id;
}

export function shouldIssueQuarterlySovereignBondSeries(turn: number): boolean {
  return turn > 0 && turn % SOVEREIGN_ISSUANCE_INTERVAL_TURNS === 0;
}

export function calculateQuarterlyIssuanceAmount(annualDeficit: number): number {
  if (annualDeficit <= 0) return 0;
  const quarterlyAmount = annualDeficit / 4;
  return Math.floor(quarterlyAmount / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
}

export function getSovereignIssuerName(countryId: CountryId): string {
  return COUNTRY_CONFIGS[countryId].name;
}

export function getBondIssuerDisplayName(
  bond: Pick<Bond, "issuerType" | "issuerName" | "countryId">,
  fallbackName?: string
): string {
  if (isSovereignBond(bond)) {
    if (bond.issuerName) return bond.issuerName;
    if (bond.countryId) return getSovereignIssuerName(bond.countryId);
  }

  return fallbackName ?? bond.issuerName ?? "Unknown Issuer";
}

export interface SovereignBondIssueResult {
  countryId: CountryId;
  requestedAmount: number;
  unsoldAmount: number;
  issueAmount: number;
  couponRate: number;
  bondId: ObjectId;
  newPrincipal: number;
  newDebtInterest: number;
  newSurplus: number;
}

export function applySovereignDebtAdjustment(
  budget: FederalBudget,
  principalDelta: number,
  annualInterestDelta: number
): Pick<FederalBudget, "debt" | "spending" | "surplus" | "debtToGdpRatio" | "creditRating"> {
  const newPrincipal = Math.max(0, budget.debt.principal + principalDelta);
  const newDebtInterest = Math.max(0, budget.spending.debtInterest + annualInterestDelta);
  const newSpendingTotal = Math.max(0, budget.spending.total + annualInterestDelta);
  const newSurplus = budget.revenue.total - newSpendingTotal;
  // Read the EMA-smoothed national GDP (design §5.4 / §6.1) so a one-year GDP
  // swing — now that state.gdp moves every turn (P1c) — can't trip the
  // sovereign-default threshold. Falls back to raw gdp for cutover safety.
  const ratioGdp = budget.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : budget.gdp;
  const debtToGdpRatio = ratioGdp > 0 ? newPrincipal / ratioGdp : 0;
  const creditRating: CreditRating = calculateCreditRating(
    debtToGdpRatio,
    budget.sovereignRiskAnchor
  );
  // Low investor confidence adds a sovereign risk premium (spec §12.4 feed 2).
  const interestRate =
    calculateInterestRate(
      debtToGdpRatio,
      budget.imfSovereignBailoutActive,
      budget.sovereignRiskAnchor
    ) + getSovereignConfidencePremium(budget.investorConfidence);

  return {
    debt: {
      ...budget.debt,
      principal: newPrincipal,
      interestRate,
    },
    spending: {
      ...budget.spending,
      debtInterest: newDebtInterest,
      total: newSpendingTotal,
    },
    surplus: newSurplus,
    debtToGdpRatio,
    creditRating,
  };
}

function buildSovereignBondDoc(params: {
  countryId: CountryId;
  turn: number;
  now: Date;
  issueAmount: number;
  maturityTurns: BondMaturityTurns;
  primeRate: number;
  countryCorporation: Pick<Corporation, "_id" | "name"> | null;
  /** B4: percentage points of credibility spread. 0 for a clean or absent bank. */
  credibilitySpreadPp?: number;
  /** Democratic backsliding premium in percentage points. */
  democraticSpreadPp?: number;
  /** Existing sovereign credit-tier premium in percentage points. */
  issuerRiskSpreadPp?: number;
  /**
   * Explicit home currency (usually the budget's `currencyCode`). Preferred
   * over the era-blind map fallback, so 2027 euro members issue in EUR.
   */
  currencyCode?: CurrencyCode | string | null;
}): { bondDoc: Omit<Bond, "_id">; annualCouponCost: number } {
  const { countryId, turn, now, issueAmount, maturityTurns, primeRate, countryCorporation } =
    params;
  const normalizedIssueAmount =
    Math.floor(issueAmount / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
  const totalUnits = Math.floor(normalizedIssueAmount / BOND_UNIT_FACE_VALUE);
  const couponRate = getSovereignCouponRate(
    primeRate,
    maturityTurns,
    (params.credibilitySpreadPp ?? 0) + (params.democraticSpreadPp ?? 0),
    params.issuerRiskSpreadPp ?? 0
  );

  const bondDoc: Omit<Bond, "_id"> = {
    issuerType: "sovereign",
    corporationId: countryCorporation?._id ?? new ObjectId(),
    countryId,
    issuerName: countryCorporation?.name ?? getSovereignIssuerName(countryId),
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate,
    maturityTurns,
    issuedAtTurn: turn,
    maturityTurn: turn + maturityTurns,
    marketPrice: 1.0,
    totalIssued: normalizedIssueAmount,
    publicFloat: totalUnits,
    holders: [],
    defaulted: false,
    defaultedAtTurn: null,
    matured: false,
    // Sovereign-default audit fields — set null at creation so the
    // sovereignDefaultPhase1Bonds migration doesn't need to backfill them.
    restructureHaircutPercent: null,
    restructureExtendedMaturityTurn: null,
    originalMaturityTurn: null,
    originalTotalIssued: null,
    // Sovereign bonds denominate in the issuing country's currency: the
    // caller's explicit code (the budget row) wins, the era-blind map is
    // only the fallback for callers without a budget in hand.
    currencyCode: resolveCountryCurrencyCode({ countryId, currencyCode: params.currencyCode }),
    createdAt: now,
    updatedAt: now,
  };

  const annualCouponCost = (couponRate / 100) * bondDoc.totalIssued;
  return { bondDoc, annualCouponCost };
}

async function issueSovereignBondSeries(
  db: Db,
  params: {
    countryId: CountryId;
    turn: number;
    now: Date;
    issueAmount: number;
    maturityTurns?: BondMaturityTurns;
    issuanceKey: string;
    poolOnly?: boolean;
  }
): Promise<SovereignBondIssueResult | null> {
  const { countryId, turn, now, issueAmount } = params;
  const maturityTurns = params.maturityTurns ?? SOVEREIGN_BOND_MATURITY_TURNS;
  if (issueAmount < BOND_UNIT_FACE_VALUE) return null;

  const budgetId = getNationalBudgetId(countryId);
  const [budget, centralBank, countryCorporation, democraticSpreadPp] = await Promise.all([
    federalBudgetCollection(db).findOne({ _id: budgetId }),
    centralBanksCollection(db).findOne(
      { _id: getBankId(countryId) },
      {
        projection: {
          primeRate: 1,
          chairInfamy: 1,
          chairMode: 1,
          chairControlsLocked: 1,
          chairCharacterId: 1,
        },
      }
    ),
    findPrimaryNationalCorporation(db, countryId),
    loadDemocraticSovereignSpread(db, countryId),
  ]);
  if (!budget) return null;

  const normalizedIssueAmount =
    Math.floor(issueAmount / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
  if (normalizedIssueAmount < BOND_UNIT_FACE_VALUE) return null;

  const primeRate =
    centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;

  const { bondDoc } = buildSovereignBondDoc({
    countryId,
    turn,
    now,
    issueAmount: normalizedIssueAmount,
    maturityTurns,
    primeRate,
    countryCorporation,
    currencyCode: budget.currencyCode,
    issuerRiskSpreadPp: sovereignCreditSpreadPp(budget.creditRating),
    // B4: a discredited central bank makes its government borrow dearer. No
    // bank document means no scrutiny to read, so the spread is 0, not a guess.
    credibilitySpreadPp: centralBank ? sovereignCredibilitySpread(centralBank.chairInfamy ?? 0) : 0,
    democraticSpreadPp,
  });

  const key = params.issuanceKey;
  const accounting = await loadPrimaryAccounting(db);
  const funded = await fundSovereignSeries(db, {
    key,
    countryId,
    turn,
    now,
    budget,
    centralBank: params.poolOnly ? null : centralBank,
    bondDocs: [bondDoc],
    accounting,
  });
  const updatedBudget = await federalBudgetCollection(db).findOne({ _id: budgetId });
  const issued = funded[0];
  if (!issued || !updatedBudget) return null;
  return {
    countryId,
    issueAmount: issued.totalIssued,
    requestedAmount: (issued.requestedUnits ?? 0) * BOND_UNIT_FACE_VALUE,
    unsoldAmount: (issued.unsoldUnits ?? 0) * BOND_UNIT_FACE_VALUE,
    couponRate: issued.couponRate,
    bondId: issued._id,
    newPrincipal: updatedBudget.debt.principal,
    newDebtInterest: updatedBudget.spending.debtInterest,
    newSurplus: updatedBudget.surplus,
  };
}

/**
 * Issue a sovereign bond solely against the currency bond pool for a deposit
 * insurance backstop. Unsold units remain unissued until the normal primary
 * placement pass finds pool cash; this path never uses central bank money.
 */
export async function issueDepositInsuranceBackstopBond(
  db: Db,
  args: {
    countryId: CountryId;
    turn: number;
    now: Date;
    amount: number;
    issuanceKey: string;
  }
): Promise<SovereignBondIssueResult | null> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) return null;
  const units = Math.ceil(args.amount / BOND_UNIT_FACE_VALUE);
  if (!Number.isSafeInteger(units)) return null;
  const rounded = units * BOND_UNIT_FACE_VALUE;
  return issueSovereignBondSeries(db, {
    countryId: args.countryId,
    turn: args.turn,
    now: args.now,
    issueAmount: rounded,
    issuanceKey: args.issuanceKey,
    poolOnly: true,
  });
}

export async function issueAdminSovereignBondSeries(
  db: Db,
  params: {
    countryId: CountryId;
    turn: number;
    now: Date;
    faceValue?: number;
    maturityTurns?: BondMaturityTurns;
    useQuarterDeficit?: boolean;
  }
): Promise<SovereignBondIssueResult | null> {
  const { countryId, turn, now, faceValue, maturityTurns, useQuarterDeficit = true } = params;
  let issueAmount = faceValue ?? 0;

  if (issueAmount <= 0 && useQuarterDeficit) {
    const budgetId = getNationalBudgetId(countryId);
    const budget = await federalBudgetCollection(db).findOne({ _id: budgetId });
    if (!budget) return null;
    // Derived, not read. `surplus` is a cache of `revenue.total - spending.total`
    // that drifts intra-turn through every writer's read-modify-write, and this runs
    // inside the turn, before the end-of-turn reconciliation lands. Reading the cache
    // here sized a quarter's sovereign issuance off a stale deficit.
    issueAmount = calculateQuarterlyIssuanceAmount(Math.max(0, -federalSurplus(budget)));
  }

  return issueSovereignBondSeries(db, {
    countryId,
    turn,
    now,
    issueAmount,
    maturityTurns,
    issuanceKey: `sovereign-primary:admin:${countryId}:${turn}:${maturityTurns ?? SOVEREIGN_BOND_MATURITY_TURNS}:${faceValue && faceValue > 0 ? faceValue : "quarter-deficit"}`,
  });
}

/**
 * Sum the totalIssued of active sovereign bonds for `countryId` that will mature
 * during the upcoming issuance interval (`[turn, turn + SOVEREIGN_ISSUANCE_INTERVAL_TURNS)`).
 *
 * Used to roll over maturing debt so the bond market never drains to zero when a
 * country runs a surplus. Without this, surplus countries stop issuing entirely
 * and existing bonds progressively mature out of the public float.
 */
export async function calculateSovereignRolloverAmount(
  db: Db,
  countryId: CountryId,
  turn: number
): Promise<number> {
  const activeBonds = await bondsCollection(db)
    .find({
      issuerType: "sovereign",
      countryId,
      matured: false,
      defaulted: false,
    })
    .toArray();
  const budget = await federalBudgetCollection<
    Pick<FederalBudget, "_id" | "debt" | "countryId" | "currencyCode">
  >(db).findOne(
    { _id: getNationalBudgetId(countryId) },
    { projection: { debt: 1, countryId: 1, currencyCode: 1 } }
  );
  // The pool exchanges its maturing float at par for fresh 48-turn paper
  // (publicFloatSovereignNovation.ts), so that share never needs cash. Only
  // the share that maturity will actually pay out is worth prefunding.
  const currency =
    (budget ? resolveCountryCurrencyCode(budget) : null) ?? COUNTRY_CURRENCY_MAP[countryId];
  const pool = currency ? await readPoolForPrimary(db, currency) : null;
  const novationShare = publicFloatNovationShare(pool?.appetiteByCountry?.[countryId]);
  return sovereignRolloverFromBonds(activeBonds, budget?.debt?.principal, turn, novationShare);
}

/**
 * Rollover for a country from its live (unmatured, undefaulted) sovereign
 * bonds and its budget principal. Pure, so a caller holding both for many
 * countries at once gets the same figure without a read per country.
 *
 * `novationShare` (0..1) is the share of each maturing public float the pool
 * will take in kind at par. A novated unit is already refinanced by the
 * exchange: it leaves principal unchanged, so issuing cash for it as well
 * counts the same debt twice and parks the proceeds in the Treasury. Default 0
 * keeps the gross maturing face, which is what default-risk callers want.
 */
export function sovereignRolloverFromBonds(
  activeBonds: ReadonlyArray<Pick<Bond, "maturityTurn" | "totalIssued"> & { publicFloat?: number }>,
  principal: unknown,
  turn: number,
  novationShare = 0
): number {
  const maturingSoon = activeBonds.filter(
    (bond) =>
      bond.maturityTurn >= turn && bond.maturityTurn < turn + SOVEREIGN_ISSUANCE_INTERVAL_TURNS
  );

  const share = Math.min(1, Math.max(0, novationShare));
  const maturingFace = maturingSoon.reduce((sum, bond) => {
    const face = bond.totalIssued ?? 0;
    const novated = Math.min(face, (bond.publicFloat ?? 0) * BOND_UNIT_FACE_VALUE) * share;
    return sum + (face - novated);
  }, 0);
  const activeFace = activeBonds.reduce((sum, bond) => sum + (bond.totalIssued ?? 0), 0);

  // Rollover refinances debt that still exists. A country that has paid its
  // debt down (or never owed it) must not keep reissuing paper just because an
  // old series is maturing: FR carried 4.2T FRF of bonds against a principal of
  // zero that way, and with a real market pool that paper would have drawn
  // coupons from nothing. Cap the rollover so bonds outstanding after this
  // quarter never exceed the budget's principal. A missing budget keeps the
  // old behaviour (roll everything) so seeds and tests without one still work.
  const rollover =
    typeof principal === "number" && Number.isFinite(principal)
      ? Math.min(maturingFace, Math.max(0, principal - (activeFace - maturingFace)))
      : maturingFace;
  return Math.floor(rollover / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
}

export async function issueScheduledSovereignBondSeries(
  db: Db,
  turn: number,
  now: Date,
  options: { preset?: string } = {}
): Promise<number> {
  if (!shouldIssueQuarterlySovereignBondSeries(turn)) {
    return 0;
  }
  const longTenors = presetUsesLongSovereignTenors(options.preset);

  // One read per scheduled quarter: the tranche-consolidation dark
  // gate. Absent or false keeps the historical ladder exactly as issued.
  const issuanceGate = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { sovereignIssuanceConsolidationEnabled: 1 } }
  );
  const consolidationEnabled = issuanceGate?.sovereignIssuanceConsolidationEnabled === true;

  // Registered, not the raw static list: a dissolved country keeps its budget
  // doc, and the scheduler would otherwise keep rolling over its debt.
  const configuredCountries: CountryId[] = await getRegisteredCountryIds(db);
  const budgets = await federalBudgetCollection(db)
    .find({
      _id: { $in: configuredCountries.map((countryId) => getNationalBudgetId(countryId)) },
    })
    .toArray();

  const budgetByCountry = new Map<CountryId, FederalBudget>();
  for (const budget of budgets) {
    const countryId =
      typeof budget.countryId === "string" && budget.countryId in COUNTRY_CONFIGS
        ? (budget.countryId as CountryId)
        : getCountryIdFromBudgetId(budget._id);
    budgetByCountry.set(countryId, budget);
  }

  const accounting = await loadPrimaryAccounting(db);
  let issuancesCreated = 0;
  const sovereignCountries = configuredCountries.filter((countryId) =>
    budgetByCountry.has(countryId)
  );
  // Long-tenor worlds: every country's recent policy-rate history in one read,
  // for the debt manager's maturity mix.
  const rateHistoryByCountry = new Map<CountryId, number[]>();
  if (longTenors && sovereignCountries.length > 0) {
    const banks = await centralBanksCollection(db)
      .find(
        { _id: { $in: [...new Set(sovereignCountries.map((countryId) => getBankId(countryId)))] } },
        { projection: { interestRateHistory: { $slice: -DEBT_MANAGER_RATE_HISTORY_TURNS } } }
      )
      .toArray();
    const historyByBank = new Map(
      banks.map((bank) => [bank._id, (bank.interestRateHistory ?? []).map((point) => point.rate)])
    );
    // A shared bank (a currency union) gives each member the same history.
    for (const countryId of sovereignCountries) {
      const history = historyByBank.get(getBankId(countryId));
      if (history) rateHistoryByCountry.set(countryId, history);
    }
  }
  for (const countryId of sovereignCountries) {
    const budget = budgetByCountry.get(countryId);
    if (!budget) continue;
    const key = `sovereign-primary:scheduled:${countryId}:${turn}`;
    if (await primarySettlementExists(db, key)) continue;

    // Derived, not read: `surplus` is a cache of `revenue.total - spending.total`
    // that drifts intra-turn through every writer's read-modify-write (same
    // reason the admin issuance path uses federalSurplus, above). Sizing a
    // quarter's sovereign issuance off the stale cache issues the wrong face.
    const annualDeficit = Math.max(0, -federalSurplus(budget));
    const deficitAmount = calculateQuarterlyIssuanceAmount(annualDeficit);
    // Always roll over bonds maturing in the next quarter on top of any deficit-
    // driven issuance. Mirrors real-world Treasury behavior: maturing principal
    // is refinanced by new issuance, so bond market supply stays stable even
    // when the budget is in surplus. Without rollover, surplus countries would
    // see their bond float drain to zero as existing issues mature.
    const rolloverAmount = await calculateSovereignRolloverAmount(db, countryId, turn);
    const issueAmount = deficitAmount + rolloverAmount;
    if (issueAmount < BOND_UNIT_FACE_VALUE) continue;

    // Exclude reconcile-flagged bonds: the admin reconcile endpoint may issue
    // 1yr (48t) tranches at any turn (stamped reconcile:true). Without this
    // guard the scheduler would see them and skip, silently dropping regular
    // deficit/rollover issuance for that quarter.
    // Also guard against ANY non-reconcile sovereign bond issued this turn,
    // since staggered issuance may issue multiple maturities in one turn.
    const existingSeries = await bondsCollection(db).findOne({
      issuerType: "sovereign",
      countryId,
      issuedAtTurn: turn,
      reconcile: { $ne: true },
    });
    if (existingSeries) continue;

    const budgetId = getNationalBudgetId(countryId);
    const [budgetDoc, centralBank, countryCorporation, democraticSpreadPp] = await Promise.all([
      federalBudgetCollection(db).findOne({ _id: budgetId }),
      centralBanksCollection(db).findOne(
        { _id: getBankId(countryId) },
        {
          projection: {
            primeRate: 1,
            chairInfamy: 1,
            chairMode: 1,
            chairControlsLocked: 1,
            chairCharacterId: 1,
          },
        }
      ),
      findPrimaryNationalCorporation(db, countryId),
      loadDemocraticSovereignSpread(db, countryId),
    ]);
    if (!budgetDoc) continue;

    const primeRate =
      centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;
    // A finance minister's profile always wins. Without one, worlds with long
    // tenors hand the mix to the debt manager, which lengthens maturity when
    // rates are low against their history; other worlds keep the fixed ladder.
    const distribution =
      budgetDoc.sovereignBondProfile ??
      (longTenors
        ? debtManagerMaturityMix({
            currentRate: primeRate,
            rateHistory: rateHistoryByCountry.get(countryId) ?? [],
          })
        : SOVEREIGN_RECONCILE_DISTRIBUTION);

    const bondDocs: Omit<Bond, "_id">[] = [];

    // Primary market: the currency's pool underwrites each tranche at par with
    // the cash it has and the appetite the demand model gives this issuer.
    // Without a funded pool, units remain unplaced unless monetary financing supplies cash.
    const poolCurrency: CurrencyCode =
      resolveCountryCurrencyCode({ countryId, currencyCode: budgetDoc.currencyCode }) ??
      COUNTRY_CURRENCY_MAP[countryId] ??
      "USD";
    // Plan the ladder first so the gated consolidation reshapes rungs
    // before pool underwriting sees them. Gate off: the same rungs, same order.
    const tranchePlans = consolidateSovereignTranches(
      planSovereignTranches(distribution, issueAmount),
      consolidationEnabled ? SOVEREIGN_MIN_TRANCHE_UNITS : 0
    );
    for (const tranche of tranchePlans) {
      const maturityTurns = tranche.maturityTurns;
      const trancheAmount = tranche.amount;

      const { bondDoc } = buildSovereignBondDoc({
        countryId,
        currencyCode: poolCurrency,
        turn,
        now,
        issueAmount: trancheAmount,
        maturityTurns,
        primeRate,
        countryCorporation,
        issuerRiskSpreadPp: sovereignCreditSpreadPp(budgetDoc.creditRating),
        democraticSpreadPp,
      });
      bondDocs.push(bondDoc);
    }
    if (bondDocs.length > 0) {
      const funded = await fundSovereignSeries(db, {
        key,
        countryId,
        turn,
        now,
        budget: budgetDoc,
        centralBank,
        bondDocs,
        accounting,
      });
      issuancesCreated += funded.length;
    }
  }

  return issuancesCreated;
}

export interface SovereignReconcileTranche {
  maturityTurns: BondMaturityTurns;
  issueAmount: number;
  couponRate: number;
  bondId: ObjectId;
  annualCouponCost: number;
}

export interface SovereignReconcileResult {
  countryId: CountryId;
  /** Debt principal already covered by active sovereign bonds before this run. */
  coveredByExistingBonds: number;
  /** Gap between budget debt.principal and bond coverage (what was available to issue). */
  gap: number;
  /** Tranches issued across staggered maturities. Empty if gap was zero. */
  tranches: SovereignReconcileTranche[];
  totalIssued: number;
  /** Increase in annual coupon service added to spending.debtInterest. */
  budgetInterestDelta: number;
  newPrincipal: number;
  newDebtInterest: number;
  newSurplus: number;
  newDebtToGdpRatio: number;
  newCreditRating: string;
}

/**
 * Converts unrepresented sovereign debt principal into tradeable bond series,
 * spread across staggered maturities with term-premium yields.
 *
 * The gap = budget.debt.principal minus the haircut-adjusted outstanding
 * sovereign stock (see sovereignPrincipal.ts). Each tranche in `distribution`
 * receives its share of the gap at getSovereignCouponRate(primeRate, maturity).
 *
 * Budget impact: new tranches add annual coupon service, so spending.debtInterest
 * rises by the new coupons. debt.principal is RE-POINTED at the canonical
 * post-write ledger (existing outstanding plus face just issued), never
 * incremented by the gap, since the gap was already inside stored principal.
 * debtToGdpRatio / creditRating are refreshed off the re-pointed stock.
 *
 * Retry-safe: the principal write is a pure function of the ledger read back, so
 * a crash between inserts and budget update converges on retry without double
 * issuance.
 */
export async function reconcileSovereignDebt(
  db: Db,
  params: {
    countryId: CountryId;
    turn: number;
    now: Date;
    distribution?: Partial<Record<BondMaturityTurns, number>>;
  }
): Promise<SovereignReconcileResult | null> {
  const { countryId, turn, now } = params;
  const distribution = params.distribution ?? SOVEREIGN_RECONCILE_DISTRIBUTION;

  const budgetId = getNationalBudgetId(countryId);
  const [budget, centralBank, countryCorporation, democraticSpreadPp] = await Promise.all([
    federalBudgetCollection(db).findOne({ _id: budgetId }),
    centralBanksCollection(db).findOne(
      { _id: getBankId(countryId) },
      {
        projection: {
          primeRate: 1,
          chairInfamy: 1,
          chairMode: 1,
          chairControlsLocked: 1,
          chairCharacterId: 1,
        },
      }
    ),
    findPrimaryNationalCorporation(db, countryId),
    loadDemocraticSovereignSpread(db, countryId),
  ]);
  if (!budget) return null;

  const primeRate =
    centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;
  // B4 credibility spread, same rule as scheduled issuance: no bank, no spread.
  const credibilitySpreadPp = centralBank
    ? sovereignCredibilitySpread(centralBank.chairInfamy ?? 0)
    : 0;

  // Canonical outstanding stock: active non-defaulted face minus any
  // restructure haircuts (a haircut bond contributes its written-down stock).
  const activeBonds = await bondsCollection(db)
    .find({ issuerType: "sovereign", countryId, matured: false, defaulted: false })
    .toArray();
  const coveredByExistingBonds = sumOutstandingSovereignPrincipal(activeBonds);

  const storedPrincipal = Math.max(0, budget.debt.principal ?? 0);
  const rawGap = storedPrincipal - coveredByExistingBonds;
  const gap = Math.floor(Math.max(0, rawGap) / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;

  const tranches: SovereignReconcileTranche[] = [];
  let totalIssued = 0;
  let totalInterestDelta = 0;

  if (gap >= BOND_UNIT_FACE_VALUE) {
    const corporationId = countryCorporation?._id ?? new ObjectId();
    const issuerName = countryCorporation?.name ?? getSovereignIssuerName(countryId);
    const currencyCode = resolveCountryCurrencyCode({
      countryId,
      currencyCode: budget.currencyCode,
    });

    for (const [maturityStr, fraction] of Object.entries(distribution)) {
      if (!fraction || fraction <= 0) continue;
      const maturityTurns = Number(maturityStr) as BondMaturityTurns;
      const trancheAmount =
        Math.floor((gap * fraction) / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
      if (trancheAmount < BOND_UNIT_FACE_VALUE) continue;

      const totalUnits = Math.floor(trancheAmount / BOND_UNIT_FACE_VALUE);
      const couponRate = getSovereignCouponRate(
        primeRate,
        maturityTurns,
        credibilitySpreadPp + democraticSpreadPp,
        sovereignCreditSpreadPp(budget.creditRating)
      );
      const annualCouponCost = (couponRate / 100) * trancheAmount;

      const bondDoc: Omit<Bond, "_id"> = {
        issuerType: "sovereign",
        corporationId,
        countryId,
        issuerName,
        faceValue: BOND_UNIT_FACE_VALUE,
        couponRate,
        maturityTurns,
        issuedAtTurn: turn,
        maturityTurn: turn + maturityTurns,
        marketPrice: 1.0,
        totalIssued: trancheAmount,
        publicFloat: totalUnits,
        holders: [],
        defaulted: false,
        defaultedAtTurn: null,
        matured: false,
        // Sovereign-default audit fields — set null at creation so the
        // sovereignDefaultPhase1Bonds migration doesn't need to backfill them.
        restructureHaircutPercent: null,
        restructureExtendedMaturityTurn: null,
        originalMaturityTurn: null,
        originalTotalIssued: null,
        // Marks this as an admin-reconcile bond so the quarterly scheduler's
        // dedup query never mistakes it for a regular scheduled issuance.
        reconcile: true,
        currencyCode,
        createdAt: now,
        updatedAt: now,
      };

      const insertResult = await bondsCollection<Omit<Bond, "_id">>(db).insertOne(bondDoc);
      tranches.push({
        maturityTurns,
        issueAmount: trancheAmount,
        couponRate,
        bondId: insertResult.insertedId,
        annualCouponCost,
      });
      totalIssued += trancheAmount;
      totalInterestDelta += annualCouponCost;
    }
  }

  // Re-point principal at the post-write ledger. New tranches carry no
  // haircut, so their face adds to the outstanding stock in full. This must
  // NOT be old principal + gap: the gap was already inside the stored
  // principal, and adding it again double-counts the same debt.
  // Interest is a flow, not a stock, so it still rises incrementally by the
  // genuine new coupon service. The write lands whenever the stock moved or
  // drifted, so a crash/retry replay that issued nothing still converges the
  // stored value onto the ledger.
  const postWriteOutstanding = coveredByExistingBonds + totalIssued;
  const newPrincipal = Math.round(postWriteOutstanding);
  const newDebtInterest = Math.max(0, (budget.spending?.debtInterest ?? 0) + totalInterestDelta);
  const newSpendingTotal = Math.max(0, (budget.spending?.total ?? 0) + totalInterestDelta);
  const newSurplus = (budget.revenue?.total ?? 0) - newSpendingTotal;
  const terms = sovereignDebtTerms(newPrincipal, {
    gdp: budget.gdp ?? 0,
    gdpSmoothed: budget.gdpSmoothed,
    investorConfidence: budget.investorConfidence,
    imfBailoutActive: budget.imfSovereignBailoutActive,
    sovereignRiskAnchor: budget.sovereignRiskAnchor,
  });
  if (totalIssued > 0 || newPrincipal !== Math.round(storedPrincipal)) {
    await federalBudgetCollection(db).updateOne(
      { _id: budgetId },
      {
        $set: {
          debt: { ...budget.debt, principal: newPrincipal, interestRate: terms.interestRate },
          spending: {
            ...budget.spending,
            debtInterest: newDebtInterest,
            total: newSpendingTotal,
          },
          surplus: newSurplus,
          debtToGdpRatio: terms.debtToGdpRatio,
          creditRating: terms.creditRating,
          updatedAt: now,
        },
      }
    );
  }

  return {
    countryId,
    coveredByExistingBonds,
    gap,
    tranches,
    totalIssued,
    budgetInterestDelta: totalInterestDelta,
    newPrincipal,
    newDebtInterest,
    newSurplus,
    newDebtToGdpRatio: terms.debtToGdpRatio,
    newCreditRating: terms.creditRating,
  };
}
