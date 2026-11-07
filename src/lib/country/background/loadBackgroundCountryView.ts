import type { Db, ObjectId } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { COMMODITY_TYPES } from "@/lib/constants/commoditiesCore";
import {
  INTERNATIONAL_ORGANIZATIONS,
  isBuiltInInternationalOrganizationId,
} from "@/lib/constants/internationalOrganizations";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { MACRO_COUNTRIES_COLLECTION } from "@/lib/db/collections/macroCountries";
import type { MacroCountryState } from "@/lib/world/macro/types";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  buildBilateralTrade,
  buildEconomyView,
  buildPoliticsView,
  type BackgroundCountryView,
  type CommodityFlows,
  type TariffRow,
} from "./rules/backgroundCountryView";

/** Trade partner the page reports against: the player country. */
const TRADE_PARTNER = COUNTRY_CONFIGS.US.id;
const MAX_BONDS = 5;
const MAX_CRISES = 5;

type MacroDoc = Pick<
  MacroCountryState,
  "entityId" | "population" | "nationalPolitics" | "nationalIndex"
>;

interface BudgetDoc {
  _id: string;
  gdp?: number;
  debtToGdpRatio?: number;
  creditRating?: string;
  economicFactors?: { gdpGrowth?: number; inflationRate?: number };
}

interface ExchangeRateDoc {
  _id: string;
  currencyCode?: string;
  rate?: number;
  baseRate?: number;
  rateHistory?: { turn: number; rate: number }[];
}

interface TradeSnapshotDoc {
  turn?: number;
  commodities?: CommodityFlows;
}

interface TariffDoc extends TariffRow {
  _id: unknown;
}

interface BondDoc {
  _id: ObjectId;
  couponRate: number;
  maturityTurn: number;
  marketPrice: number;
  faceValue: number;
}

interface IndexFundDoc {
  slug: string;
  name: string;
  countryId?: string;
  nationalIndex?: { entityId: string };
}

interface MembershipDoc {
  organizationId: string;
  countryId: string;
}

interface CrisisDoc {
  _id: ObjectId;
  name: string;
  startTurn: number;
}

/** The trade snapshot projection: only the two directed cells per commodity. */
function tradeProjection(countryId: string, partnerId: string): Record<string, 1> {
  const projection: Record<string, 1> = { turn: 1 };
  for (const commodity of COMMODITY_TYPES) {
    projection[`commodities.${commodity}.flow.${countryId}.${partnerId}`] = 1;
    projection[`commodities.${commodity}.flow.${partnerId}.${countryId}`] = 1;
  }
  return projection;
}

/**
 * Load everything the background country page shows, in one parallel batch of
 * small projected reads. The page never reads a full-simulation collection
 * (regions, NPPs, bills, legislature seats): a background country has none.
 */
export async function loadBackgroundCountryView(
  db: Db,
  countryId: CountryId
): Promise<BackgroundCountryView> {
  const [macro, budget, fx, snapshot, tariffs, bonds, indexFund, memberships, crises] =
    await Promise.all([
      db
        .collection<MacroDoc>(MACRO_COUNTRIES_COLLECTION)
        .findOne(
          { entityId: countryId },
          { projection: { entityId: 1, population: 1, nationalPolitics: 1, nationalIndex: 1 } }
        ),
      db.collection<BudgetDoc>("federalBudget").findOne(
        { _id: getNationalBudgetId(countryId) },
        {
          projection: {
            gdp: 1,
            debtToGdpRatio: 1,
            creditRating: 1,
            "economicFactors.gdpGrowth": 1,
            "economicFactors.inflationRate": 1,
          },
        }
      ),
      db
        .collection<ExchangeRateDoc>("exchangeRates")
        .findOne(
          { _id: countryId },
          { projection: { currencyCode: 1, rate: 1, baseRate: 1, rateHistory: 1 } }
        ),
      db
        .collection<TradeSnapshotDoc>("tradeFlowSnapshots")
        .findOne({}, { sort: { turn: -1 }, projection: tradeProjection(countryId, TRADE_PARTNER) }),
      db
        .collection<TariffDoc>("tariffs")
        .find(
          {
            countryId: { $in: [countryId, TRADE_PARTNER] },
            scopeType: { $in: ["economy_wide", "origin_country"] },
            rate: { $gt: 0 },
          },
          { projection: { countryId: 1, scopeType: 1, targetOriginCountryId: 1, rate: 1 } }
        )
        .toArray(),
      db
        .collection<BondDoc & { issuerType?: string; countryId?: string }>("bonds")
        .find(
          { issuerType: "sovereign", countryId, matured: false, defaulted: false },
          {
            projection: { couponRate: 1, maturityTurn: 1, marketPrice: 1, faceValue: 1 },
            sort: { maturityTurn: 1 },
            limit: MAX_BONDS,
          }
        )
        .toArray(),
      db
        .collection<IndexFundDoc>("indexFunds")
        .findOne(
          { "nationalIndex.entityId": countryId },
          { projection: { slug: 1, name: 1, countryId: 1, nationalIndex: 1 } }
        ),
      db
        .collection<MembershipDoc>("organizationMemberships")
        .find({ countryId }, { projection: { organizationId: 1, countryId: 1 } })
        .toArray(),
      db
        .collection<CrisisDoc & { status?: string; countryIds?: string[] }>("crises")
        .find(
          { status: "active", countryIds: countryId },
          {
            projection: { name: 1, startTurn: 1 },
            sort: { startTurn: -1 },
            limit: MAX_CRISES,
          }
        )
        .toArray(),
    ]);

  const politics = macro?.nationalPolitics ?? null;
  const currencyCode = fx?.currencyCode ?? COUNTRY_CURRENCY_MAP[countryId];
  const indexLevel = macro?.nationalIndex?.level;

  return {
    countryId,
    economy: buildEconomyView({
      budget,
      politicsEconomy: politics?.economy ?? null,
      population: macro?.population ?? null,
    }),
    currency:
      fx && currencyCode && typeof fx.rate === "number"
        ? {
            currencyCode,
            rate: fx.rate,
            baseRate: fx.baseRate ?? fx.rate,
            rateHistory: (fx.rateHistory ?? []).map((p) => ({ turn: p.turn, value: p.rate })),
          }
        : null,
    trade: buildBilateralTrade({
      countryId,
      partnerId: TRADE_PARTNER,
      commodities: snapshot?.commodities,
      snapshotTurn: snapshot?.turn ?? null,
      tariffs,
    }),
    politics: buildPoliticsView(politics),
    bonds: bonds.map((b) => ({
      id: b._id.toString(),
      couponRate: b.couponRate,
      maturityTurn: b.maturityTurn,
      marketPrice: b.marketPrice,
      faceValue: b.faceValue,
    })),
    nationalIndex: indexFund
      ? {
          name: indexFund.name,
          slug: indexFund.slug,
          countryId: indexFund.countryId ?? null,
          level: typeof indexLevel === "number" && Number.isFinite(indexLevel) ? indexLevel : null,
        }
      : null,
    alliances: memberships
      .map((m) => {
        const def = isBuiltInInternationalOrganizationId(m.organizationId)
          ? INTERNATIONAL_ORGANIZATIONS[m.organizationId]
          : null;
        return {
          id: m.organizationId,
          name: def?.name ?? m.organizationId,
          shortName: def?.shortName ?? m.organizationId,
        };
      })
      .sort((a, b) => a.shortName.localeCompare(b.shortName)),
    crises: crises.map((c) => ({ id: c._id.toString(), name: c.name, startTurn: c.startTurn })),
  };
}
