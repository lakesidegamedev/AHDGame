/**
 * One journaled funding move and a run of journaled payout moves for a whole
 * Treasury's maturing sovereign bonds.
 *
 * A wave of 688 bonds used to cost about 74 database round trips each: freeze
 * the quote, read the receipts, read the budget, move the Treasury's cash into
 * one bond's escrow, then pay that bond's holders, then retire it. Every step
 * except the holder credits is per Treasury, so the wave is expressed the way
 * the loan service batch expresses a bank's book:
 *
 * - one funding move: one Treasury debit of the summed principal, one escrow
 *   credit per bond, one signed-position projection;
 * - one payout move per chunk of bonds: one escrow debit per bond (independent
 *   targets, delivered in one batch), one credit per distinct payee summed
 *   across the chunk's bonds, one budget retirement projection and one
 *   retirement per bond.
 *
 * The money is the same money in the same places. The per-bond path remains for
 * anything the batch cannot express: a novatable public float, a forced
 * rollover, a half-applied receipt, bank lots and their claims, and a Treasury
 * whose phase-start cash cannot cover the whole wave. Each of those shapes is
 * named in `sovereignMaturityWaveIneligibility`; a country is settled wholly
 * one way or wholly the other, never a mix inside the wave.
 *
 * A wave interrupted after it claimed a key is owned by that receipt until it
 * finishes. Re-running the country's bonds on their own keys would move money
 * twice, so the orchestrator resumes the receipt first and reports its bonds as
 * settled, or holds them for the next turn while the repair queue lists it.
 */
import { ObjectId, type Db } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { buildSovereignMaturityPayoutLegs } from "@/lib/bonds/sovereign";
import {
  resolveSovereignMaturityPayoutLegs,
  type SovereignMaturityLiveTargets,
} from "@/lib/bonds/sovereignMaturityPayoutTargets";
import { sovereignMaturityRetirementFigures } from "@/lib/bonds/sovereignMaturityRetirement";
import {
  isCashSovereignMaturityDisposition,
  noPublicFloatMaturityDisposition,
  planSovereignMaturityCountryWaves,
  sovereignMaturityWaveFundingTransition,
  sovereignMaturityWavePayoutTransition,
  type SovereignMaturityPlan,
  type SovereignMaturityWave,
  type SovereignMaturityWaveCountry,
} from "@/lib/bonds/sovereignMaturityWave";
import { resumeSettlement, settleTransition } from "@/lib/banking/settlementJournal";
import { interleaveByKey, runInLanes, type KeyedQueue } from "@/lib/turn/settlementLanes";
import type { PartialTxEntry } from "@/lib/turn/bondTurnLedger";

type MaturityClaim = NonNullable<Bond["sovereignMaturityClaim"]>;
type WaveBond = SovereignMaturityWaveCountry["bonds"][number];

/**
 * Bonds per payout receipt.
 *
 * The journal re-reads a receipt's frozen projection list every time it applies
 * one projection, so one receipt per Treasury would ship the whole plan (a few
 * hundred KB) N times over. A chunk keeps that read bounded while still paying
 * each payee once for every bond in it. The funding move stays per Treasury:
 * its only projection is the signed-position update.
 */
const PAYOUT_CHUNK_BONDS = 25;

/** Bonds a wave settled, and bonds the caller must still settle one at a time. */
export interface SovereignMaturityWaveSettlement {
  /** Ledger rows for every bond the wave path handled; null when it did not settle. */
  settled: Map<string, PartialTxEntry[] | null>;
  /** Bonds no wave covered, for the per-bond path. */
  perBond: Bond[];
}

interface WaveOutcome {
  /** Ledger rows for bonds whose payout finished this turn. */
  entries: Map<string, PartialTxEntry[]>;
  /** Bonds the wave moved nothing for; the per-bond path may take them. */
  skipped: string[];
  /** Bonds a half-applied receipt owns; nothing else may touch them this turn. */
  held: string[];
}

/**
 * Settle every maturing sovereign bond this phase can settle as a wave.
 *
 * Resumed receipts run first and alone: a receipt pays holders across a whole
 * chunk, so it must not race a wave that credits the same payees. New waves then
 * run in the bond phase's lanes, each holding its Treasury, its bonds and its
 * holder targets.
 */
export async function settleSovereignMaturityWaves(
  db: Db,
  input: {
    turn: number;
    now: Date;
    dueSovereignBonds: readonly Bond[];
    maturityPlans: ReadonlyMap<string, SovereignMaturityPlan>;
    wave: SovereignMaturityWave;
    liveTargets?: SovereignMaturityLiveTargets;
    lock: KeyedQueue;
    lanes: number;
  }
): Promise<SovereignMaturityWaveSettlement> {
  const { waves, perBond } = planSovereignMaturityCountryWaves(
    input.dueSovereignBonds,
    input.maturityPlans,
    input.wave
  );
  const settled = new Map<string, PartialTxEntry[] | null>();
  const { recovered, stuckCountries } = await resumeWaveReceipts(db, input, settled);
  const fallback: Set<string> = new Set();
  const waveByCountry = new Map(waves.map((wave) => [wave.countryId, wave] as const));
  // A Treasury whose interrupted wave still cannot finish owns its cash until it
  // does. Starting a fresh wave on the same Treasury could spend what the old
  // receipt's debit leg is still owed, so the country waits a turn.
  for (const countryId of stuckCountries) {
    const stuck = waveByCountry.get(countryId);
    if (!stuck) continue;
    waveByCountry.delete(countryId);
    for (const { bond } of stuck.bonds) settled.set(bond._id.toHexString(), null);
  }
  if (waveByCountry.size > 0) {
    await runInLanes(
      interleaveByKey([...waveByCountry.values()], (wave) => wave.countryId),
      input.lanes,
      async (wave) => {
        const keys = [
          `federalBudget:${wave.budgetId}`,
          ...wave.bonds.flatMap(({ bond, plan }) => [
            `bonds:${bond._id.toHexString()}`,
            ...plan.holderLegs.map((leg) => `${leg.collection}:${String(leg.filter._id)}`),
          ]),
        ];
        const outcome = await input.lock.run(keys, () => settleCountryWave(db, input, wave));
        for (const [bondId, entries] of outcome.entries) settled.set(bondId, entries);
        for (const bondId of outcome.held) settled.set(bondId, null);
        // Bonds the wave moved nothing for go back to the per-bond path, which
        // reads the truth and handles rollover, bank lots and cash shortfalls
        // exactly as it did before the batch existed.
        for (const bondId of outcome.skipped) fallback.add(bondId);
      }
    );
  }
  // A funding receipt finished this turn leaves its bonds funded but unpaid,
  // which is the state the per-bond path pays from.
  for (const bondId of recovered) fallback.add(bondId);
  const fallbackBonds = input.dueSovereignBonds.filter(
    (bond) =>
      fallback.has(bond._id.toHexString()) && input.maturityPlans.has(bond._id.toHexString())
  );
  return {
    settled,
    perBond: [...perBond, ...fallbackBonds].filter((bond) => !settled.has(bond._id.toHexString())),
  };
}

/**
 * Finish a wave a crash left half applied, then report the bonds it matured.
 * Its receipt froze the legs and the retirements, so finishing it moves exactly
 * the money the interrupted turn planned; re-deriving that plan from today's
 * documents would pay the payees of bonds that already settled.
 *
 * Returns the bonds a finished funding receipt left funded but unpaid: their
 * escrow holds the cash, and the per-bond path is what pays it out.
 */
async function resumeWaveReceipts(
  db: Db,
  input: {
    turn: number;
    now: Date;
    maturityPlans: ReadonlyMap<string, SovereignMaturityPlan>;
    wave: SovereignMaturityWave;
  },
  settled: Map<string, PartialTxEntry[] | null>
): Promise<{ recovered: Set<string>; stuckCountries: Set<string> }> {
  const funded: Set<string> = new Set();
  const stuckCountries: Set<string> = new Set();
  const finished: string[][] = [];
  for (const [countryId, receipts] of input.wave.partialWaveReceipts) {
    for (const receipt of receipts) {
      const resumed = await resumeSettlement(db, receipt.key);
      const complete =
        resumed.status === "applied" || (resumed.status === "replayed" && !resumed.error);
      if (complete) finished.push(receipt.bondIds);
      else {
        stuckCountries.add(countryId);
        for (const bondId of receipt.bondIds) settled.set(bondId, null);
      }
    }
  }
  const ids = [...new Set(finished.flat())].flatMap((bondId) =>
    /^[0-9a-f]{24}$/i.test(bondId) ? [new ObjectId(bondId)] : []
  );
  const rows =
    ids.length === 0
      ? []
      : await db
          .collection<Bond>("bonds")
          .find(
            { _id: { $in: ids } },
            {
              projection: {
                _id: 1,
                countryId: 1,
                couponRate: 1,
                matured: 1,
                "sovereignMaturityClaim.paid": 1,
              },
            }
          )
          .toArray();
  const byId = new Map(rows.map((row) => [row._id.toHexString(), row] as const));
  for (const bondIds of finished) {
    for (const bondId of bondIds) {
      const row = byId.get(bondId);
      const plan = input.maturityPlans.get(bondId);
      if (row?.matured === true && row.sovereignMaturityClaim?.paid === true && plan) {
        settled.set(
          bondId,
          sovereignMaturityLedgerEntries(
            { bondId, countryId: row.countryId ?? "", couponRate: row.couponRate },
            plan,
            input.turn,
            input.now
          )
        );
        continue;
      }
      // Funded but unpaid: hand it to the per-bond path, which pays the frozen
      // quote from the escrow this receipt just filled.
      funded.add(bondId);
    }
  }
  return { recovered: funded, stuckCountries };
}

/**
 * Funding and payout for one country. The wave only claims its keys once every
 * quote is frozen and every funding turn reserved, so a refusal here moves no
 * money and the per-bond path can take over.
 */
async function settleCountryWave(
  db: Db,
  input: {
    turn: number;
    now: Date;
    liveTargets?: SovereignMaturityLiveTargets;
  },
  waveCountry: SovereignMaturityWaveCountry
): Promise<WaveOutcome> {
  const skipped = waveCountry.bonds.map(({ bond }) => bond._id.toHexString());
  const claims = await freezeWaveQuotes(db, waveCountry, input.now);
  if (!claims) return { entries: new Map(), skipped, held: [] };
  if (!(await reserveWaveFundingTurn(db, waveCountry, claims, input.turn)))
    return { entries: new Map(), skipped, held: [] };
  const bonds: WaveBond[] = waveCountry.bonds.map(({ bond, plan }) => ({
    bond: { ...bond, sovereignMaturityClaim: claims.get(bond._id.toHexString()) },
    plan,
  }));
  const fundedWave: SovereignMaturityWaveCountry = { ...waveCountry, bonds };

  let funding = await settleTransition(
    db,
    sovereignMaturityWaveFundingTransition({ wave: fundedWave, turn: input.turn, now: input.now })
  );
  if (funding.status === "partial" || (funding.status === "replayed" && funding.error))
    funding = await resumeSettlement(db, funding.key);
  if (funding.status === "rejected") return { entries: new Map(), skipped, held: [] };
  if (!(funding.status === "applied" || (funding.status === "replayed" && !funding.error)))
    return { entries: new Map(), skipped: [], held: skipped };

  const entries = new Map<string, PartialTxEntry[]>();
  const payoutSkipped: string[] = [];
  const payoutHeld: string[] = [];
  for (let start = 0; start < bonds.length; start += PAYOUT_CHUNK_BONDS) {
    const chunk = bonds.slice(start, start + PAYOUT_CHUNK_BONDS);
    const chunkIds = chunk.map(({ bond }) => bond._id.toHexString());
    const payoutLegsByBond = new Map<string, ReturnType<typeof buildSovereignMaturityPayoutLegs>>();
    const figuresByBond = new Map<string, ReturnType<typeof sovereignMaturityRetirementFigures>>();
    // The payout pays the frozen quote, exactly as the per-bond shell does. Its
    // payees were preloaded for the whole maturity wave, so resolving them here
    // costs no read per bond.
    for (const { bond } of chunk) {
      const quote = bond.sovereignMaturityClaim!;
      const resolved = await resolveSovereignMaturityPayoutLegs(
        db,
        quote.holderLegs,
        { currencyCode: waveCountry.currencyCode, localPerAnchor: waveCountry.localPerAnchor },
        input.liveTargets
      );
      payoutLegsByBond.set(
        bond._id.toHexString(),
        buildSovereignMaturityPayoutLegs({
          bondId: bond._id,
          claimId: quote.id,
          currencyCode: waveCountry.currencyCode,
          treasuryLocalPerAnchor: waveCountry.localPerAnchor,
          amountLocal: quote.amountLocal,
          holderLegs: resolved,
        })
      );
      figuresByBond.set(bond._id.toHexString(), sovereignMaturityRetirementFigures(bond, quote));
    }
    let payout = await settleTransition(
      db,
      sovereignMaturityWavePayoutTransition({
        wave: { ...fundedWave, bonds: chunk },
        turn: input.turn,
        now: input.now,
        payoutLegsByBond,
        figuresByBond,
        chunk: start / PAYOUT_CHUNK_BONDS,
      })
    );
    if (payout.status === "partial" || (payout.status === "replayed" && payout.error))
      payout = await resumeSettlement(db, payout.key);
    // A refused payout moved nothing: the escrow stays funded and the per-bond
    // path pays from it, so the same cash reaches the same payees.
    if (payout.status === "rejected") {
      payoutSkipped.push(...chunkIds);
      continue;
    }
    if (!(payout.status === "applied" || (payout.status === "replayed" && !payout.error))) {
      payoutHeld.push(...chunkIds);
      continue;
    }
    for (const { bond, plan } of chunk)
      entries.set(
        bond._id.toHexString(),
        sovereignMaturityLedgerEntries(
          {
            bondId: bond._id.toHexString(),
            countryId: waveCountry.countryId,
            couponRate: bond.couponRate,
          },
          plan,
          input.turn,
          input.now
        )
      );
  }
  return { entries, skipped: payoutSkipped, held: payoutHeld };
}

/**
 * Freeze every due-turn quote the wave needs in one write, then read the frozen
 * claims back once. The guard is the per-bond freezer's guard, so a bond whose
 * holder snapshot moved under a concurrent write is left for the per-bond path.
 */
async function freezeWaveQuotes(
  db: Db,
  waveCountry: SovereignMaturityWaveCountry,
  now: Date
): Promise<Map<string, MaturityClaim> | undefined> {
  const missing = waveCountry.bonds.filter(({ bond }) => !bond.sovereignMaturityClaim);
  if (missing.length > 0) {
    await db.collection<Bond>("bonds").bulkWrite(
      missing.map(({ bond, plan }) => ({
        updateOne: {
          filter: {
            _id: bond._id,
            issuerType: "sovereign",
            countryId: bond.countryId,
            maturityTurn: bond.maturityTurn,
            matured: false,
            defaulted: false,
            holders: bond.holders,
            publicFloat: bond.publicFloat,
            ...(bond.centralBankHoldings === undefined
              ? { centralBankHoldings: { $exists: false } }
              : { centralBankHoldings: bond.centralBankHoldings }),
            sovereignMaturityClaim: { $exists: false },
          },
          update: {
            $set: {
              sovereignMaturityClaim: {
                id: `sovereign-maturity:${bond._id.toHexString()}:${bond.maturityTurn}`,
                dueTurn: bond.maturityTurn,
                currencyCode: plan.currencyCode,
                treasuryLocalPerAnchor: plan.treasuryValuation.anchorRate,
                amountLocal: plan.nonBankRepaymentLocal,
                escrowLocal: 0,
                sourceHolders: bond.holders ?? [],
                sourcePublicFloat: bond.publicFloat,
                sourceCentralBankHoldings: bond.centralBankHoldings,
                holderLegs: plan.holderLegs.map((leg) => ({ ...leg })),
                // The per-bond path freezes this in a second write before it can
                // fund; with no pool float it is always the cash refusal.
                publicFloatDisposition: noPublicFloatMaturityDisposition(plan.currencyCode),
              },
              updatedAt: now,
            },
          },
        },
      }))
    );
  }
  const rows = await db
    .collection<Bond>("bonds")
    .find(
      { _id: { $in: waveCountry.bonds.map(({ bond }) => bond._id) } },
      { projection: { _id: 1, sovereignMaturityClaim: 1 } }
    )
    .toArray();
  const byId = new Map(rows.map((row) => [row._id.toHexString(), row] as const));
  const quotes = new Map<string, MaturityClaim>();
  for (const { bond, plan } of waveCountry.bonds) {
    const bondId = bond._id.toHexString();
    const claim = byId.get(bondId)?.sovereignMaturityClaim;
    if (
      !claim ||
      claim.id !== `sovereign-maturity:${bondId}:${bond.maturityTurn}` ||
      claim.dueTurn !== bond.maturityTurn ||
      claim.escrowLocal !== 0 ||
      claim.fundingAttemptTurn !== undefined ||
      claim.paid === true ||
      claim.forcedRollover !== undefined ||
      !isCashSovereignMaturityDisposition(claim.publicFloatDisposition) ||
      claim.amountLocal !== plan.nonBankRepaymentLocal
    )
      return undefined;
    quotes.set(bondId, claim);
  }
  return quotes;
}

/**
 * Reserve this turn's funding attempt on every claim in one write, with the
 * guard the per-bond path uses. A lost race leaves the whole country to the
 * per-bond path, which reads each reservation and funds under its own key.
 */
async function reserveWaveFundingTurn(
  db: Db,
  waveCountry: SovereignMaturityWaveCountry,
  claims: ReadonlyMap<string, MaturityClaim>,
  turn: number
): Promise<boolean> {
  const writes = waveCountry.bonds.map(({ bond }) => {
    const claim = claims.get(bond._id.toHexString())!;
    return {
      updateOne: {
        filter: {
          _id: bond._id,
          "sovereignMaturityClaim.id": claim.id,
          "sovereignMaturityClaim.escrowLocal": claim.escrowLocal,
          "sovereignMaturityClaim.fundingAttemptTurn": { $exists: false },
        },
        update: { $set: { "sovereignMaturityClaim.fundingAttemptTurn": turn } },
      },
    };
  });
  const result = await db.collection<Bond>("bonds").bulkWrite(writes);
  return result.matchedCount === writes.length;
}

/**
 * The ledger rows one settled maturity emits: its holder payments and the
 * government cash move. A wave never rolls a bond over, so the whole non-bank
 * principal left the Treasury.
 */
function sovereignMaturityLedgerEntries(
  bond: { bondId: string; countryId: string; couponRate: number },
  plan: SovereignMaturityPlan,
  turn: number,
  now: Date
): PartialTxEntry[] {
  const paidLocal = plan.nonBankRepaymentLocal;
  return [
    ...plan.maturityEntries,
    {
      type: "gov_bond_maturity_payment",
      turn,
      createdAt: now,
      subjectType: "government",
      countryId: bond.countryId,
      amount: -paidLocal,
      currencyCode: plan.currencyCode,
      anchorAmount: -paidLocal / plan.treasuryValuation.anchorRate,
      meta: {
        bondId: bond.bondId,
        units: paidLocal / BOND_UNIT_FACE_VALUE,
        couponRate: bond.couponRate,
        treasuryCashMovement: true,
        ...plan.treasuryValuation,
      },
    },
  ];
}
