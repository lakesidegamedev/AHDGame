/**
 * The absorbed country's national balance sheet moves to the survivor:
 * treasury, defence account, sovereign bonds held by players, and the
 * national law book. Regions transfer separately via `transferRegion`, but
 * the national layer has no region to ride; left behind it pays coupons from
 * a ghost ledger until it defaults for a country that no longer exists.
 *
 * CURRENCY. Everything crosses at ONE scale (`resolveMergeFxScale`). Bonds
 * convert by scaling UNITS, not per-unit face, because `BOND_UNIT_FACE_VALUE`
 * is a global constant. `avgCostPerUnit` is invariant under that transform
 * and left untouched. Fractional units are a display quirk only.
 *
 * IDEMPOTENT by filters: a re-run finds no bonds/laws keyed to the absorbed
 * country and a zeroed treasury, so every write is a no-op. The `mergedInto`
 * stamp is the audit trail, not the guard.
 */
import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { EnactedLaw } from "@/lib/db/types/budget";
import type { GameState } from "@/lib/db/types/gameState";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { resyncSovereignPrincipalFromBonds } from "@/lib/bonds/sovereign";
import { countryFiscalBase } from "@/lib/politicalLegislation/fiscalBase";
import { resolveMergeFxScale } from "./mergeFxScale";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";

export interface MergeNationalFiscArgs {
  fromCountryId: CountryId;
  toCountryId: CountryId;
  currentTurn: number;
  /**
   * Whether the absorbed side's legislated levers govern the unified state.
   * The absorbed side is usually the winner (merge runs winner-into-shell), so
   * its law carries. But if the SURVIVOR is the victor, this must be false or
   * the loser's law would govern the winner. Quantities (treasury, defence,
   * bonds, debt ceiling) are not levers and always cross.
   */
  carryLegislatedLevers?: boolean;
  /**
   * Fiscal bases (gdp and population sums) captured BEFORE region transfers,
   * plus each side's live income-band index.
   *
   * Fraction-priced laws price against the LIVE fiscal base of their country.
   * Without a re-base, the unified treasury inherits laws sized for one economy
   * priced against a much larger base, while revenue stays under its cap,
   * producing a permanent structural deficit. With the bases present, every
   * national law keeps the ABSOLUTE cost it priced at in its own country.
   * Optional only for backwards compatibility.
   */
  mergeBases?: MergeFiscalBases;
}

export interface MergeFiscalBases {
  fromGdp: number;
  fromPopulation: number;
  fromIncomeBand: number;
  toGdp: number;
  toPopulation: number;
  toIncomeBand: number;
}

export interface MergeNationalFiscResult {
  fxScale: number;
  /** Signed amount (survivor-local) added to the survivor's treasury. */
  treasuryMoved: number;
  bondsRescoped: number;
  lawsRescoped: number;
}

/** EnactedLaw money fields (local currency). Ratio/fraction fields must NOT convert. */
const LAW_MONEY_FIELDS = ["annualCostUsd", "annualCostPerCapita", "annualRevenueV2"] as const;

export async function mergeNationalFisc(
  db: Db,
  args: MergeNationalFiscArgs
): Promise<MergeNationalFiscResult> {
  const {
    fromCountryId,
    toCountryId,
    currentTurn,
    carryLegislatedLevers = true,
    mergeBases,
  } = args;
  const now = new Date();
  const scale = await resolveMergeFxScale(db, fromCountryId, toCountryId);
  const budgets = federalBudgetCollection(db);

  // ── Treasury + defence account ─────────────────────────────────────────────
  const from = await budgets.findOne({ _id: fromCountryId });
  const to = await budgets.findOne({ _id: toCountryId });
  let treasuryMoved = 0;

  // The `mergedInto` stamp is the idempotency guard for this whole block: a
  // re-run after completion must not re-add a zero treasury, and must not
  // re-carry levers over anything the unified government has since legislated.
  if (from && to && !from.mergedInto) {
    const fromTreasury = from.treasuryBalance ?? 0;
    const fromDefence = from.defenseAppropriation?.balance ?? 0;
    treasuryMoved = fromTreasury * scale;

    // THE WINNER'S FISCAL LAW TAKES OVER. Where both states carry a legislated
    // version of the same lever, the absorbed (winning) side's governs the
    // unified state — the merge direction runs winner-into-shell, so keeping
    // the shell's levers would let the LOSER's tax code outlive its state.
    // Rates and ratios are scale-free; the debt ceiling is money and converts.
    // Levers the absorbed side never legislated are left alone rather than
    // unset — absence is not a law. Deliberately NOT carried: `creditRating`,
    // `sovereignRiskAnchor` and `debt.interestRate`, which are the market's
    // assessment of the issuer, not legislation, and the fiscal machinery
    // recomputes them from the combined balance sheet.
    const lawSet: Record<string, unknown> = {};
    if (carryLegislatedLevers) {
      if (from.taxRates) lawSet.taxRates = from.taxRates;
      if (from.taxRatePhaseIn) lawSet.taxRatePhaseIn = from.taxRatePhaseIn;
    }
    // Debt ceiling is the one carried lever that SUMS rather than replaces.
    // Rates/ratios/prohibitions are rules (winner replaces). A ceiling is a
    // quantity that survives absorption: the combined state keeps both capacities.
    // `ceilingLastRaisedYear` takes the LATER year (combined ceiling is new).
    //
    // A survivor that was itself absorbed (mergedInto) contributes 0: its ceiling
    // is already counted on the absorbed side; adding it double-counts.
    const survivorCeiling = to.mergedInto ? 0 : (to.debt?.ceiling ?? 0);
    const fromCeiling = from.debt?.ceiling;
    if (typeof fromCeiling === "number") {
      lawSet["debt.ceiling"] = survivorCeiling + fromCeiling * scale;
      const raisedYears = [from.debt?.ceilingLastRaisedYear, to.debt?.ceilingLastRaisedYear].filter(
        (year): year is number => typeof year === "number"
      );
      if (raisedYears.length > 0) {
        lawSet["debt.ceilingLastRaisedYear"] = Math.max(...raisedYears);
      }
    }
    if (carryLegislatedLevers) {
      if (typeof from.minimumWageKaitzRatio === "number") {
        lawSet.minimumWageKaitzRatio = from.minimumWageKaitzRatio;
      }
      if (typeof from.unionLawBias === "number") lawSet.unionLawBias = from.unionLawBias;
      if (typeof from.unionsBanned === "boolean") lawSet.unionsBanned = from.unionsBanned;
    }

    // The survivor's book: signed add of the same `treasuryMoved` the caller
    // records in its audit trail. Treasury cash crosses as cash: `debt.principal`
    // belongs to the sovereign bond ledger and is re-pointed at the rescoped
    // bond stock below, never derived from the combined balance.
    const newToTreasury = (to.treasuryBalance ?? 0) + treasuryMoved;
    await budgets.updateOne(
      { _id: toCountryId },
      {
        $set: {
          treasuryBalance: newToTreasury,
          ...lawSet,
          updatedAt: now,
        },
        ...(fromDefence !== 0
          ? { $inc: { "defenseAppropriation.balance": fromDefence * scale } }
          : {}),
      }
    );
    // The absorbed book: zeroed, stamped. NOT deleted — history and the wiki
    // still read it (its levers stay in place as the record of the law that
    // crossed), and the fiscal loop stops visiting it via the dissolved guard
    // rather than via absence. Its principal is re-pointed at its remaining
    // bond stock (matured paper stays behind) by the resync below.
    await budgets.updateOne(
      { _id: fromCountryId },
      {
        $set: {
          treasuryBalance: 0,
          ...(from.defenseAppropriation ? { "defenseAppropriation.balance": 0 } : {}),
          mergedInto: { countryId: toCountryId, turn: currentTurn },
          updatedAt: now,
        },
      }
    );
  }

  // ── Sovereign bonds ────────────────────────────────────────────────────────
  const toCurrency = COUNTRY_CURRENCY_MAP[toCountryId];
  const bonds = bondsCollection(db);
  const absorbedBonds = await bonds
    .find({ issuerType: "sovereign", countryId: fromCountryId, matured: false })
    .toArray();

  // One bulkWrite, not a per-doc await loop: the whole series re-scopes inside
  // a single turn phase.
  //
  // The corporationId is NOT touched here. The issuer corp is the absorbed
  // country's primary National Corporation, and swapping it here would point
  // the bonds at a primary the merge pipeline has not consolidated yet —
  // `mergeNationalCorporations` owns that side of the assumption, re-stamping
  // corporationId + issuerName onto the survivor primary along with the sectors
  // and shells. Two writers for one field in one pipeline is how the halves
  // drift; each owns what its name says.
  if (absorbedBonds.length > 0) {
    await bonds.bulkWrite(
      absorbedBonds.map((bond) => ({
        updateOne: {
          filter: { _id: bond._id, sovereignMaturityClaim: { $exists: false } },
          update: {
            $set: {
              countryId: toCountryId,
              totalIssued: (bond.totalIssued ?? 0) * scale,
              publicFloat: (bond.publicFloat ?? 0) * scale,
              ...(bond.centralBankHoldings != null
                ? { centralBankHoldings: bond.centralBankHoldings * scale }
                : {}),
              ...(bond.originalTotalIssued != null
                ? { originalTotalIssued: bond.originalTotalIssued * scale }
                : {}),
              holders: (bond.holders ?? []).map((h) => ({ ...h, units: h.units * scale })),
              ...(toCurrency ? { currencyCode: toCurrency } : {}),
              updatedAt: now,
            },
          },
        },
      }))
    );
  }

  // Re-point both budgets' stored principal at the ledger rather than the
  // combined cash. Safe to re-run: a retry after a crash converges since a
  // re-run finds no bonds left to rescope.
  await resyncSovereignPrincipalFromBonds(db, toCountryId);
  await resyncSovereignPrincipalFromBonds(db, fromCountryId);

  // ── National enacted laws ──────────────────────────────────────────────────
  // Region law books rode their regions across; the NATIONAL book (scope
  // "national", no stateId) is what nothing else moves. Money fields convert
  // (currency only) and the fraction terms re-base onto the merged economy
  // below, because their pricing base is changed BY the merge.
  const laws = db.collection<EnactedLaw>("enactedLaws");
  // `stateId: null` matches both an absent field and an explicit null in Mongo;
  // the cast is because `EnactedLaw.stateId` is `string | undefined` and the
  // driver's Filter type refuses a literal null for it.
  const nationalLaws = await laws
    .find({
      countryId: fromCountryId,
      $or: [{ stateId: { $exists: false } }, { stateId: null }],
    } as import("mongodb").Filter<EnactedLaw>)
    .toArray();

  // Fraction-priced terms (v2 costModelV2 and legacy fraction/multiplier fields)
  // price against the LIVE fiscal base of the country keying the law. The merge
  // re-keys the absorbed book and grows the survivor's base, so these laws would
  // silently reprice onto the merged economy. Rule: QUANTITIES CROSS. Each law
  // keeps its ABSOLUTE annual cost, re-expressed in the survivor frame; after the
  // merge every fraction tracks the unified economy from that anchor.
  //
  // Ownership decides each law's pre-merge base: absorbed-book laws price against
  // fromGdp/fromPopulation; shell-held laws against toGdp/toPopulation.
  //
  // Idempotency: every re-based law is stamped, and the stamp filter skips
  // stamped rows, so a re-entered merge cannot apply the ratio twice.
  const rebaseOps: Array<{
    updateOne: { filter: { _id: ObjectId }; update: { $set: Record<string, unknown> } };
  }> = [];
  if (mergeBases && from && to && !from.mergedInto) {
    // The merged base is the LIVE rollup over the states as they now stand
    // (both sides' regions plus any fused region). The two pre-merge bases are
    // what the caller captured BEFORE the region transfers moved; reading them
    // here would find every region already re-keyed and a zero absorbed side.
    const merged = await countryFiscalBase(db, toCountryId);
    if (merged.gdp > 0 && merged.population > 0) {
      // The v2 income term is `incomeCostFraction × incomeAnchor × band ×
      // population`. The anchor is per-law-prefix and does not move; the band
      // is the pricing country's live band, which for the survivor may differ
      // from the band each side priced at before the merge. Both the population
      // and the band change fold into the term's factor.
      const gs = await db
        .collection<GameState>("gameState")
        .findOne({ _id: "current" as const }, { projection: { incomeBandIndexByCountry: 1 } });
      const liveBandTo = gs?.incomeBandIndexByCountry?.[toCountryId] ?? mergeBases.toIncomeBand;

      const stamp = { from: fromCountryId, to: toCountryId, turn: currentTurn };
      const pushRebase = (
        law: EnactedLaw,
        own: { gdp: number; population: number; band: number }
      ): void => {
        const set: Record<string, unknown> = {};
        const gdpFactor = own.gdp / merged.gdp;
        const popBandFactor = (own.population * own.band) / (merged.population * liveBandTo);
        const v2 = law.costModelV2;
        if (v2) {
          if (typeof v2.gdpCostFraction === "number" && Number.isFinite(v2.gdpCostFraction)) {
            set["costModelV2.gdpCostFraction"] = v2.gdpCostFraction * gdpFactor;
          }
          if (typeof v2.gdpRevenueFraction === "number" && Number.isFinite(v2.gdpRevenueFraction)) {
            set["costModelV2.gdpRevenueFraction"] = v2.gdpRevenueFraction * gdpFactor;
          }
          if (typeof v2.incomeCostFraction === "number" && Number.isFinite(v2.incomeCostFraction)) {
            set["costModelV2.incomeCostFraction"] = v2.incomeCostFraction * popBandFactor;
          }
        }
        // Legacy Spec-B fraction fields price on the budget GDP (`frac × gdp`;
        // the income class via `frac × incomeToGdp × gdp`): the same GDP ratio.
        if (typeof law.gdpCostFraction === "number" && Number.isFinite(law.gdpCostFraction)) {
          set.gdpCostFraction = law.gdpCostFraction * gdpFactor;
        }
        if (typeof law.incomeCostFraction === "number" && Number.isFinite(law.incomeCostFraction)) {
          set.incomeCostFraction = law.incomeCostFraction * gdpFactor;
        }
        // `gdpPerCapitaMultiplier × budget.gdp` — the budget gdp converges on
        // the merged rollup at the next fiscal close, so the same factor keeps
        // the absolute cost in place.
        if (
          typeof law.gdpPerCapitaMultiplier === "number" &&
          Number.isFinite(law.gdpPerCapitaMultiplier)
        ) {
          set.gdpPerCapitaMultiplier = law.gdpPerCapitaMultiplier * gdpFactor;
        }
        if (Object.keys(set).length > 0) {
          rebaseOps.push({
            updateOne: {
              filter: { _id: law._id },
              update: { $set: { ...set, mergeRebased: stamp, updatedAt: now } },
            },
          });
        }
      };

      // The carried book: these are the rows this call is re-scoping, priced in
      // the absorbed country before it moved.
      for (const law of nationalLaws) {
        pushRebase(law, {
          gdp: mergeBases.fromGdp,
          population: mergeBases.fromPopulation,
          band: mergeBases.fromIncomeBand,
        });
      }
      // The shell's own book: everything national keyed to the survivor that is
      // not one of the carried rows and not already re-based. The `mergedInto`
      // gate above means only the first merge run gets here; the stamp covers
      // the re-entered attempt that arrives after a crash mid-write.
      const shellLaws = await laws
        .find({
          countryId: toCountryId,
          $or: [{ stateId: { $exists: false } }, { stateId: null }],
          _id: { $nin: nationalLaws.map((law) => law._id) },
          mergeRebased: { $exists: false },
        } as import("mongodb").Filter<EnactedLaw>)
        .toArray();
      for (const law of shellLaws) {
        pushRebase(law, {
          gdp: mergeBases.toGdp,
          population: mergeBases.toPopulation,
          band: mergeBases.toIncomeBand,
        });
      }
    }
  }

  // Scale 1 with no re-base needs no per-doc math and collapses to one
  // updateMany. Otherwise one bulkWrite carries each law's rescope, converted
  // money fields and re-based fraction terms TOGETHER, so a crash between them
  // cannot leave a law re-keyed but un-rebased (or re-keyed twice): the write
  // is the unit of recovery.
  const rebaseByCarried = new Map(
    rebaseOps.map((op) => [String(op.updateOne.filter._id), op.updateOne.update.$set])
  );
  if (nationalLaws.length > 0 && scale === 1 && rebaseOps.length === 0) {
    await laws.updateMany(
      { _id: { $in: nationalLaws.map((law) => law._id) } },
      { $set: { countryId: toCountryId } }
    );
  } else if (nationalLaws.length > 0) {
    await laws.bulkWrite(
      nationalLaws.map((law) => {
        const moneySet: Record<string, number> = {};
        for (const field of LAW_MONEY_FIELDS) {
          const value = law[field];
          if (typeof value === "number" && Number.isFinite(value)) {
            moneySet[field] = value * scale;
          }
        }
        const rebaseSet = rebaseByCarried.get(String(law._id));
        return {
          updateOne: {
            filter: { _id: law._id },
            update: {
              $set: {
                countryId: toCountryId,
                ...moneySet,
                ...(rebaseSet ?? {}),
              },
            },
          },
        };
      })
    );
  }

  // The shell's own book re-bases in its own write: these rows are not being
  // re-scoped (they already key to the survivor), and the stamp filter in the
  // query above is what keeps a re-run from applying the ratio twice.
  const carriedIdSet = new Set(nationalLaws.map((law) => String(law._id)));
  const shellOnlyOps = rebaseOps.filter((op) => !carriedIdSet.has(String(op.updateOne.filter._id)));
  if (shellOnlyOps.length > 0) {
    await laws.bulkWrite(shellOnlyOps);
  }

  return {
    fxScale: scale,
    treasuryMoved,
    bondsRescoped: absorbedBonds.length,
    lawsRescoped: nationalLaws.length,
  };
}
