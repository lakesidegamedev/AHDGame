/**
 * Background country briefs shell. Rules live in `./rules/countryBriefs`.
 *
 * Every six turns, for each background country: read the national fiscal and
 * political state, the budget, the exchange rate, the nearest bond and the
 * national index fund in a few batched reads, ask the rules what is owed, then
 * store each brief, post it to the wire and the news feed, and save what was
 * seen. Countries nobody can play have no other voice, so this is how they
 * reach the players who trade with them.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { MACRO_COUNTRIES_COLLECTION } from "@/lib/db/collections/macroCountries";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getCountryBriefsCollection } from "@/lib/db/collections/countryBriefs";
import type { CountryBrief } from "@/lib/db/types/countryBrief";
import type { MacroCountryState } from "@/lib/world/macro/types";
import { ACTIVE_MACRO_COUNTRY_FILTER } from "@/lib/world/macro/retirement";
import { isBackgroundNation } from "@/lib/world/macro/backgroundNation";
import { createSystemNewsPost } from "@/lib/news";
import { logWireEvent } from "@/lib/wireEvent";
import type { NewsCategory } from "@/lib/db/types/newsPost";
import { planBriefs, type BriefKind, type BriefObservation } from "./rules/countryBriefs";
import { bondsCollection } from "@/lib/db/repositories/bonds";

/** Briefs are looked for this often. */
export const COUNTRY_BRIEF_INTERVAL_TURNS = 6;

const NEWS_CATEGORY: Record<BriefKind, NewsCategory> = {
  debt_stress: "sovereign",
  restructuring: "sovereign",
  austerity: "sovereign",
  election: "election",
  currency_move: "general",
  outlook: "general",
};

type CountryDoc = Pick<
  MacroCountryState,
  | "entityId"
  | "displayName"
  | "simulationTier"
  | "dataQuality"
  | "nationalFiscal"
  | "nationalPolitics"
  | "briefMemory"
>;

interface FxDoc {
  _id: string;
  currencyCode?: string;
  rate?: number;
  rateHistory?: { turn: number; rate: number }[];
}

interface BondDoc {
  _id: { toString(): string };
  countryId: string;
  couponRate: number;
  marketPrice: number;
}

interface FundDoc {
  slug: string;
  name: string;
  countryId?: string;
  nationalIndex?: { entityId: string };
}

export interface CountryBriefSummary {
  countries: number;
  briefs: number;
}

export async function processCountryBriefs(db: Db, turn: number): Promise<CountryBriefSummary> {
  const summary: CountryBriefSummary = { countries: 0, briefs: 0 };
  if (turn % COUNTRY_BRIEF_INTERVAL_TURNS !== 0) return summary;

  const macro = db.collection<CountryDoc>(MACRO_COUNTRIES_COLLECTION);
  const countries = (
    await macro
      .find(
        { simulationTier: "background-macro", ...ACTIVE_MACRO_COUNTRY_FILTER },
        {
          projection: {
            entityId: 1,
            displayName: 1,
            simulationTier: 1,
            dataQuality: 1,
            nationalFiscal: 1,
            nationalPolitics: 1,
            briefMemory: 1,
          },
        }
      )
      .toArray()
  ).filter(isBackgroundNation);
  if (countries.length === 0) return summary;
  summary.countries = countries.length;
  const ids = countries.map((c) => c.entityId);

  const [budgets, rates, bonds, funds] = await Promise.all([
    (await getFederalBudgetCollection(db))
      .find(
        { _id: { $in: ids.map((id) => getNationalBudgetId(id as never)) as never[] } },
        {
          projection: {
            debtToGdpRatio: 1,
            creditRating: 1,
            crisisFiredAt: 1,
            "economicFactors.gdpGrowth": 1,
            "economicFactors.inflationRate": 1,
          },
        }
      )
      .toArray(),
    db
      .collection<FxDoc>("exchangeRates")
      .find({ _id: { $in: ids } }, { projection: { currencyCode: 1, rate: 1, rateHistory: 1 } })
      .toArray(),
    // One nearest-maturity bond per country. A global limit would let a country
    // whose bonds all mature late be crowded out by the others.
    bondsCollection<BondDoc>(db)
      .aggregate<{ _id: string; couponRate: number; marketPrice: number }>([
        {
          $match: {
            issuerType: "sovereign",
            countryId: { $in: ids },
            matured: false,
            defaulted: false,
          },
        },
        { $sort: { maturityTurn: 1 } },
        {
          $group: {
            _id: "$countryId",
            couponRate: { $first: "$couponRate" },
            marketPrice: { $first: "$marketPrice" },
          },
        },
      ])
      .toArray(),
    db
      .collection<FundDoc>("indexFunds")
      .find(
        { "nationalIndex.entityId": { $in: ids } },
        { projection: { slug: 1, name: 1, countryId: 1, nationalIndex: 1 } }
      )
      .toArray(),
  ]);
  const budgetById = new Map(budgets.map((b) => [String(b._id), b]));
  const rateById = new Map(rates.map((r) => [r._id, r]));
  const bondByCountry = new Map<string, BondDoc>(
    bonds.map((bond) => [bond._id, { ...bond, countryId: bond._id }])
  );
  const fundByCountry = new Map(
    funds.flatMap((f) => (f.nationalIndex ? [[f.nationalIndex.entityId, f] as const] : []))
  );

  const posted: CountryBrief[] = [];
  const memoryWrites: AnyBulkWriteOperation<CountryDoc>[] = [];
  const now = new Date();
  for (const country of countries) {
    const id = country.entityId;
    const budget = budgetById.get(getNationalBudgetId(id as never));
    const fx = rateById.get(id);
    const bond = bondByCountry.get(id);
    const fund = fundByCountry.get(id);
    const politics = country.nationalPolitics;
    const fiscal = country.nationalFiscal;
    const observation: BriefObservation = {
      countryId: id,
      countryName: COUNTRY_CONFIGS[id as keyof typeof COUNTRY_CONFIGS]?.name ?? country.displayName,
      turn,
      currencyCode:
        fx?.currencyCode ?? COUNTRY_CURRENCY_MAP[id as keyof typeof COUNTRY_CURRENCY_MAP] ?? null,
      debtToGdp: typeof budget?.debtToGdpRatio === "number" ? budget.debtToGdpRatio * 100 : null,
      creditRating: budget?.creditRating ?? null,
      growth: politics?.economy?.growth ?? budget?.economicFactors?.gdpGrowth ?? null,
      inflation: politics?.economy?.inflation ?? budget?.economicFactors?.inflationRate ?? null,
      interestSpiralYears: fiscal?.interestSpiralYears ?? 0,
      lastPackage: fiscal?.lastPackage
        ? {
            turn: fiscal.lastPackage.turn,
            fiscalYear: fiscal.lastPackage.fiscalYear,
            sizeGdpShare: fiscal.lastPackage.sizeGdpShare,
            taxRise: fiscal.lastPackage.taxRise,
            spendingCut: fiscal.lastPackage.spendingCut,
          }
        : null,
      election: politics?.lastElection ?? null,
      headName: politics?.head?.name ?? null,
      crisisFiredTurn:
        typeof budget?.crisisFiredAt?.turn === "number" ? budget.crisisFiredAt.turn : null,
      fx:
        fx && typeof fx.rate === "number"
          ? {
              rate: fx.rate,
              history: (fx.rateHistory ?? []).map((p) => ({ turn: p.turn, value: p.rate })),
            }
          : null,
      bond: bond
        ? { id: bond._id.toString(), couponRate: bond.couponRate, marketPrice: bond.marketPrice }
        : null,
      fund: fund ? { slug: fund.slug, countryId: fund.countryId ?? null, name: fund.name } : null,
    };
    const plan = planBriefs(observation, country.briefMemory ?? null);
    for (const brief of plan.briefs) {
      posted.push({
        _id: `${id}:${brief.kind}:${turn}`,
        countryId: id,
        kind: brief.kind,
        turn,
        headline: brief.headline,
        body: brief.body,
        actions: brief.actions,
        createdAt: now,
      });
    }
    memoryWrites.push({
      updateOne: {
        filter: { entityId: id },
        update: { $set: { briefMemory: plan.memory } },
      },
    });
  }

  // Briefs first, memory second: a crash in between re-plans the same briefs
  // on the retry, and the stable ids make the second insert a no-op.
  if (posted.length > 0) {
    const result = await getCountryBriefsCollection(db).bulkWrite(
      posted.map((doc) => ({
        updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
      })),
      { ordered: false }
    );
    const fresh = new Set(Object.keys(result.upsertedIds).map((i) => posted[Number(i)]._id));
    for (const doc of posted) {
      if (!fresh.has(doc._id)) continue;
      summary.briefs++;
      const href = `/country/${doc.countryId.toLowerCase()}`;
      await logWireEvent("country_brief", doc.headline, { href });
      await createSystemNewsPost(`${doc.body} (${href})`, NEWS_CATEGORY[doc.kind], {
        title: doc.headline,
        db,
      });
    }
  }
  await macro.bulkWrite(memoryWrites, { ordered: false });
  return summary;
}
