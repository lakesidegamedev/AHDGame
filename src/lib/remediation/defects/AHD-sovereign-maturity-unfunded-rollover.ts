/**
 * Sovereign bonds past maturity that were neither repaid nor refinanced.
 *
 * WHAT WENT WRONG
 *
 * A matured sovereign claim is paid from spendable Treasury cash. When that
 * cash was short, two paths existed and both stopped short:
 *
 * - the forced pool rollover (forcedSovereignRollover.ts) exchanged only the
 *   bond pool's own float for new paper, and only when the pool still held
 *   float. Every other holder (index funds, NPPs, corporations, characters)
 *   waited for cash that never came, and a novated bond with no float left
 *   could not roll at all;
 * - bank lots settle through the bank claim book first, and an unfunded bank
 *   claim returned before the pool rollover ever ran. A failed bank's claim
 *   also refused to pay into its open estate, while the estate refused to
 *   close because it could not sell a bond whose quote was frozen.
 *
 * The scheduled quarterly rollover only prefunds bonds maturing in the coming
 * interval, so an overdue bond was never refinanced again. The Treasury's cash
 * was spent long before, and the claim sat unpaid every turn.
 *
 * THE CODE HALF
 *
 * A short Treasury now refinances: it sells a refunding issue to the bond pool
 * for exactly the cash it lacks (sovereignMaturityRefunding.ts), capped at the
 * face the claim retires, then pays every holder through the ordinary funded
 * journal. Bank claims refinance the same way before the claim book is swept,
 * an open failed estate receives its matured principal in its vault, and the
 * estate liquidation skips bonds that are already in redemption.
 *
 * THIS HEAL
 *
 * Moves no money. Every overdue bond is still a maturity candidate, so the
 * first bond turn on the fixed code refinances and pays each one through the
 * journaled settlement path, with the ledger rows the bond phase emits. Doing
 * the refunding here, outside the bond phase, would park the proceeds in
 * Treasury cash where the budget turn could spend them before the maturity
 * runs, and would skip the phase's ledger rows.
 *
 * `plan` is the operator's statement of what that turn will do: every overdue
 * bond, its holders and amounts, the pool float that rolls in kind, the cash
 * the Treasury lacks, and the refunding face the market is asked for. `apply`
 * stamps that approved figure on each bond under a marker, guarded on its
 * absence, so a re-run is a no-op and the post-turn audit can compare what was
 * approved with what landed. `verify` is clean once no overdue bond remains.
 */
import { ObjectId, type Db } from "mongodb";
import type { Bond } from "@/lib/db/types/bond";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { BankSovereignClaim, FederalBudget } from "@/lib/db/types/budget";
import type { BondMarketPool } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { planSovereignUnderwriting } from "@/lib/bonds/primaryMarket";
import { planSovereignMaturityRefunding } from "@/lib/bonds/rules/sovereignMaturityRefunding";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

export const DEFECT_ID = "AHD-sovereign-maturity-unfunded-rollover";
const MARKER_PATH = `remediation.${DEFECT_ID}`;

interface HolderSummary {
  kind: string;
  count: number;
  amountLocal: number;
}

export interface OverdueBondPlan {
  bondId: string;
  countryId: string;
  currencyCode: string;
  dueTurn: number;
  turnsOverdue: number;
  totalIssuedLocal: number;
  holders: HolderSummary[];
  bankLots: Array<{ bankId: string; charteredTurn: number; units: number; amountLocal: number }>;
  /** Pool float the existing forced rollover exchanges for new paper, no cash. */
  poolRolledInKindLocal: number;
  /** Cash owed to bank claims for this bond not yet escrowed. */
  bankCashLocal: number;
  /**
   * Bank claim cash already escrowed from the Treasury but never released,
   * because the claim refused to pay a failed bank's open estate. The fixed
   * claim release pays it into the estate vault; no new cash is needed.
   */
  bankEscrowedLocal: number;
  /** Cash owed to every other holder, after the pool's in-kind roll. */
  holderCashLocal: number;
  /** Treasury cash this bond can draw on, after earlier bonds in the country. */
  treasuryCashAvailableLocal: number;
  /** Face the next bond turn is planned to sell to the pool. */
  refundingFaceLocal: number;
  refusal?: string;
}

interface Payload {
  turn: number;
  bonds: OverdueBondPlan[];
}

type OverdueBond = Pick<
  Bond,
  | "_id"
  | "countryId"
  | "currencyCode"
  | "maturityTurn"
  | "totalIssued"
  | "publicFloat"
  | "holders"
  | "centralBankHoldings"
  | "sovereignMaturityClaim"
  | "restructureHaircutPercent"
>;

async function currentTurn(db: Db): Promise<number> {
  const state = await db
    .collection<{ _id: string; currentTurn?: number; turn?: number }>("gameState")
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, turn: 1 } });
  return state?.currentTurn ?? state?.turn ?? 0;
}

async function loadOverdue(db: Db, turn: number): Promise<OverdueBond[]> {
  return db
    .collection<Bond>("bonds")
    .find(
      {
        issuerType: "sovereign",
        maturityTurn: { $lt: turn },
        matured: { $ne: true },
        defaulted: { $ne: true },
      },
      {
        projection: {
          countryId: 1,
          currencyCode: 1,
          maturityTurn: 1,
          totalIssued: 1,
          publicFloat: 1,
          holders: 1,
          centralBankHoldings: 1,
          sovereignMaturityClaim: 1,
          restructureHaircutPercent: 1,
        },
      }
    )
    .sort({ countryId: 1, maturityTurn: 1, _id: 1 })
    .toArray();
}

function holderKind(holder: NonNullable<Bond["holders"]>[number]): string {
  const row = holder as unknown as Record<string, unknown>;
  if (row.bankId) return "bank";
  for (const key of ["characterId", "imperialCharacterId", "corporationId", "fundId", "nppId"])
    if (row[key]) return key.replace(/Id$/, "");
  return "other";
}

function summarizeHolders(bond: OverdueBond): HolderSummary[] {
  const byKind = new Map<string, HolderSummary>();
  const add = (kind: string, units: number) => {
    if (!(units > 0)) return;
    const row = byKind.get(kind) ?? { kind, count: 0, amountLocal: 0 };
    row.count += 1;
    row.amountLocal += units * BOND_UNIT_FACE_VALUE;
    byKind.set(kind, row);
  };
  for (const holder of bond.holders ?? []) add(holderKind(holder), holder.units);
  add("bondPool", bond.publicFloat);
  add("centralBank", bond.centralBankHoldings ?? 0);
  return [...byKind.values()];
}

/** Read-only survey of every overdue sovereign bond and the refunding it needs. */
export async function surveyOverdueSovereignBonds(db: Db): Promise<Payload> {
  const turn = await currentTurn(db);
  const bonds = await loadOverdue(db, turn);
  if (bonds.length === 0) return { turn, bonds: [] };
  const budgetIds = [
    ...new Set(bonds.flatMap((b) => (b.countryId ? [getNationalBudgetId(b.countryId)] : []))),
  ];
  const currencies = [...new Set(bonds.flatMap((b) => (b.currencyCode ? [b.currencyCode] : [])))];
  const [budgets, pools] = await Promise.all([
    db
      .collection<FederalBudget>("federalBudget")
      .find(
        { _id: { $in: budgetIds } },
        { projection: { _id: 1, countryId: 1, treasuryCashLocal: 1, bankSovereignClaims: 1 } }
      )
      .toArray(),
    db
      .collection<BondMarketPool>("bondMarketPools")
      .find({ _id: { $in: currencies } } as never, {
        projection: { _id: 1, cashLocal: 1, appetiteByCountry: 1 },
      })
      .toArray(),
  ]);
  const budgetById = new Map(budgets.map((row) => [String(row._id), row]));
  const poolById = new Map(pools.map((row) => [String(row._id), row]));
  const claims = budgets.flatMap((row) => row.bankSovereignClaims ?? []);
  const bankIds = [...new Set(claims.map((c) => c.bankId))].filter((id) => ObjectId.isValid(id));
  const banks = bankIds.length
    ? await db
        .collection<{
          _id: ObjectId;
          bankSovereignEscrows?: Record<string, { amountLocal?: number }>;
        }>("corporations")
        .find(
          { _id: { $in: bankIds.map((id) => new ObjectId(id)) } },
          { projection: { bankSovereignEscrows: 1 } }
        )
        .toArray()
    : [];
  const escrowOf = (claim: BankSovereignClaim) =>
    banks.find((row) => String(row._id) === claim.bankId)?.bankSovereignEscrows?.[claim.id]
      ?.amountLocal ?? 0;

  // Cash and pool depth are shared by every bond of a country or currency, so
  // allocate them in the order the bond turn settles (maturity, then id).
  const cashLeft = new Map(budgets.map((row) => [String(row._id), row.treasuryCashLocal ?? 0]));
  const poolLeft = new Map(pools.map((row) => [String(row._id), Math.max(0, row.cashLocal ?? 0)]));
  const out: OverdueBondPlan[] = [];
  for (const bond of bonds) {
    const bondId = bond._id.toHexString();
    const countryId = bond.countryId ?? "";
    const budgetId = countryId ? getNationalBudgetId(countryId) : "";
    const budget = budgetById.get(budgetId);
    const currencyCode = bond.currencyCode ?? "";
    const claim = bond.sovereignMaturityClaim;
    const bankLots = (bond.holders ?? [])
      .filter((h) => h.bankId && Number.isSafeInteger(h.charteredTurn) && h.units > 0)
      .map((h) => ({
        bankId: h.bankId!.toHexString(),
        charteredTurn: h.charteredTurn!,
        units: h.units,
        amountLocal: h.units * BOND_UNIT_FACE_VALUE,
      }));
    const paidBank = new Set(claim?.paidBankClaimIds ?? []);
    const bookClaims = (budget?.bankSovereignClaims ?? []).filter(
      (c) => c.kind === "maturity" && c.bondId === bondId && !paidBank.has(c.id)
    );
    const bankEscrowedLocal = bookClaims.reduce(
      (sum, c) => sum + Math.min(c.amountLocal, escrowOf(c)),
      0
    );
    const bankCashLocal = bookClaims.length
      ? bookClaims.reduce((sum, c) => sum + Math.max(0, c.amountLocal - escrowOf(c)), 0)
      : bankLots.reduce((sum, lot) => sum + lot.amountLocal, 0);
    const disposition = claim?.publicFloatDisposition;
    const frozenCash = claim
      ? disposition?.mode === "novation"
        ? (disposition.residualAmountLocal ?? 0)
        : claim.amountLocal
      : bond.totalIssued - bankLots.reduce((sum, lot) => sum + lot.amountLocal, 0);
    const poolLeg = claim?.holderLegs.some(
      (leg) => leg.collection === "bondMarketPools" && String(leg.filter._id) === currencyCode
    );
    const poolRolledInKindLocal =
      !claim?.forcedRollover &&
      (claim?.escrowLocal ?? 0) === 0 &&
      claim?.fundingAttemptTurn === undefined &&
      (bond.restructureHaircutPercent ?? 0) === 0 &&
      bond.publicFloat > 0 &&
      poolLeg !== false
        ? bond.publicFloat * BOND_UNIT_FACE_VALUE
        : 0;
    const holderCashLocal = Math.max(
      0,
      frozenCash - (claim?.escrowLocal ?? 0) - poolRolledInKindLocal
    );
    const available = Math.max(0, cashLeft.get(budgetId) ?? 0);
    const shortfall = bankCashLocal + holderCashLocal - available;
    const pool = poolById.get(currencyCode);
    const capacity = planSovereignUnderwriting({
      requestedUnits: Math.ceil(Math.max(0, shortfall) / BOND_UNIT_FACE_VALUE),
      poolCashLocal: poolLeft.get(currencyCode) ?? 0,
      appetite: countryId ? pool?.appetiteByCountry?.[countryId as CountryId] : undefined,
      pricePerUnitLocal: BOND_UNIT_FACE_VALUE,
    });
    const refunding = planSovereignMaturityRefunding({
      shortfallLocal: shortfall,
      retiringFaceLocal: bond.totalIssued - poolRolledInKindLocal,
      alreadyRefundedLocal: claim?.refundedFaceLocal ?? 0,
      marketCapacityUnits: capacity.placedUnits,
    });
    cashLeft.set(
      budgetId,
      Math.max(0, available + refunding.faceLocal - bankCashLocal - holderCashLocal)
    );
    poolLeft.set(
      currencyCode,
      Math.max(0, (poolLeft.get(currencyCode) ?? 0) - refunding.faceLocal)
    );
    out.push({
      bondId,
      countryId,
      currencyCode,
      dueTurn: bond.maturityTurn,
      turnsOverdue: turn - bond.maturityTurn,
      totalIssuedLocal: bond.totalIssued,
      holders: summarizeHolders(bond),
      bankLots,
      poolRolledInKindLocal,
      bankCashLocal,
      bankEscrowedLocal,
      holderCashLocal,
      treasuryCashAvailableLocal: available,
      refundingFaceLocal: refunding.faceLocal,
      ...(refunding.refusal && refunding.refusal !== "no_shortfall"
        ? { refusal: refunding.refusal }
        : {}),
    });
  }
  return { turn, bonds: out };
}

async function detect(db: Db): Promise<DetectResult> {
  const { turn, bonds } = await surveyOverdueSovereignBonds(db);
  return {
    affected: bonds.length,
    sample: bonds.slice(0, 10).map((b) => ({
      bondId: b.bondId,
      countryId: b.countryId,
      dueTurn: b.dueTurn,
      turnsOverdue: b.turnsOverdue,
      cashOwedLocal: b.bankCashLocal + b.holderCashLocal,
      refundingFaceLocal: b.refundingFaceLocal,
    })),
    notes: [
      `turn ${turn}: ${bonds.length} sovereign bonds past maturity, unpaid and not defaulted`,
    ],
  };
}

function sumBy(bonds: OverdueBondPlan[], key: keyof OverdueBondPlan): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const bond of bonds)
    totals[bond.currencyCode] = (totals[bond.currencyCode] ?? 0) + Number(bond[key] ?? 0);
  return totals;
}

async function plan(db: Db): Promise<HealPlan> {
  const payload = await surveyOverdueSovereignBonds(db);
  const { bonds } = payload;
  if (bonds.length === 0)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `${DEFECT_ID}: no overdue sovereign bonds`,
    };
  const refused = bonds.filter((b) => b.refusal);
  const fmt = (totals: Record<string, number>) =>
    Object.entries(totals)
      .filter(([, value]) => value > 0)
      .map(([ccy, value]) => `${ccy} ${Math.round(value).toLocaleString("en-US")}`)
      .join(", ");
  return {
    affected: bonds.length,
    touched: [{ collection: "bonds", ids: bonds.map((b) => b.bondId) }],
    moneyDelta: 0,
    summary: `${DEFECT_ID}: ${bonds.length} overdue sovereign bonds in ${new Set(bonds.map((b) => b.countryId)).size} countries; the next bond turn refinances ${fmt(sumBy(bonds, "refundingFaceLocal")) || "nothing"} and pays every holder`,
    notes: [
      `cash owed to bank claims: ${fmt(sumBy(bonds, "bankCashLocal")) || "none"}`,
      `bank claim cash already escrowed, awaiting release to the bank estate: ${fmt(sumBy(bonds, "bankEscrowedLocal")) || "none"}`,
      `cash owed to other holders: ${fmt(sumBy(bonds, "holderCashLocal")) || "none"}`,
      `pool float rolled in kind (no cash): ${fmt(sumBy(bonds, "poolRolledInKindLocal")) || "none"}`,
      "money conserving: refunding moves pool cash to the Treasury and on to holders; principal is replaced, never added",
      "apply stamps a marker only; the next bond turn on the fixed code moves the money through the journaled maturity path",
      ...bonds.map(
        (b) =>
          `${b.countryId} ${b.bondId} due t${b.dueTurn} (${b.turnsOverdue} overdue): ` +
          `holders ${b.holders.map((h) => `${h.kind}x${h.count}=${Math.round(h.amountLocal)}`).join(" ")}; ` +
          `bank cash ${Math.round(b.bankCashLocal)} (escrowed ${Math.round(b.bankEscrowedLocal)}), holder cash ${Math.round(b.holderCashLocal)}, ` +
          `pool in kind ${Math.round(b.poolRolledInKindLocal)}, treasury ${Math.round(b.treasuryCashAvailableLocal)}, ` +
          `refunding ${Math.round(b.refundingFaceLocal)} ${b.currencyCode}` +
          (b.refusal ? ` REFUSED ${b.refusal}` : "")
      ),
      ...(refused.length
        ? [`${refused.length} bonds cannot refinance this turn and need an owner look`]
        : []),
    ],
    payload,
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Payload | undefined;
  const bonds = payload?.bonds ?? [];
  let stamped = 0;
  for (const bond of bonds) {
    const result = await db.collection<Bond>("bonds").updateOne(
      {
        _id: new ObjectId(bond.bondId),
        matured: { $ne: true },
        defaulted: { $ne: true },
        [MARKER_PATH]: { $exists: false },
      },
      {
        $set: {
          [MARKER_PATH]: {
            approvedAt: ctx.now,
            runId: ctx.runId ?? null,
            planTurn: payload!.turn,
            bankCashLocal: bond.bankCashLocal,
            holderCashLocal: bond.holderCashLocal,
            poolRolledInKindLocal: bond.poolRolledInKindLocal,
            refundingFaceLocal: bond.refundingFaceLocal,
          },
        },
      }
    );
    stamped += result.modifiedCount;
  }
  return {
    documentsScanned: bonds.length,
    documentsUpdated: stamped,
    notes: [
      `${stamped} overdue bonds stamped; the next bond turn refinances and pays them`,
      "no money moved by this heal",
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { bonds } = await surveyOverdueSovereignBonds(db);
  const settled = await db
    .collection<Bond>("bonds")
    .find(
      { [MARKER_PATH]: { $exists: true } },
      { projection: { matured: 1, totalIssued: 1, sovereignMaturityClaim: 1 } }
    )
    .toArray();
  const overRefunded = settled.filter(
    (b) => (b.sovereignMaturityClaim?.refundedFaceLocal ?? 0) > b.totalIssued
  );
  return {
    ok: bonds.length === 0 && overRefunded.length === 0,
    remaining: bonds.length,
    notes: [
      `${settled.filter((b) => b.matured).length} of ${settled.length} stamped bonds retired`,
      bonds.length === 0
        ? "no sovereign bond is past maturity and unpaid"
        : `${bonds.length} still overdue; expected until the first bond turn on the fixed code`,
      ...(overRefunded.length
        ? [`${overRefunded.length} claims refunded more than the face they retire`]
        : []),
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Matured sovereign bonds left unpaid when the Treasury lacked cash: refinance and pay",
  severity: "P1",
  seedFix: {
    status: "not-needed",
    note: "Runtime only: produced by maturity settlement against a short Treasury, not by any seed document.",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "money-conserving", "max-affected:100"],
  detect,
  plan,
  apply,
  verify,
};
