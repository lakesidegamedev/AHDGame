/**
 * The market screens show every quantity per turn.
 *
 * Company production is measured per turn, but the price phase keeps world,
 * country and state supply and demand on its own basis: settlement units per
 * turn times TURNS_PER_DAY (settleFundedProducerTurn passes it as the ledger's
 * unitScale). Shown side by side, one company's output read as a sliver of a
 * world total 24 times too large. These helpers divide the price-phase figures
 * back to per turn for display only; nothing stored or traded changes.
 */
import { TURNS_PER_DAY } from "@/lib/constants/corporationsClient";

type Units = Record<string, number>;
interface BookFields {
  globalSupply: number;
  globalDemand: number;
  stateSupply: Units;
  stateDemand: Units;
  nationalSupply?: Units;
  nationalDemand?: Units;
  fundedCountryBooks?: Record<
    string,
    {
      supply: number;
      demand: number;
      spilloverRequested: number;
      filled: number | null;
      funded: number | null;
      imports: number;
      exports: number;
    }
  >;
  reachableBooks?: Record<
    string,
    {
      supply: number;
      demand: number;
      domesticDemand: number;
      imports: number;
      exports: number;
      blockedSupply: number;
      untradedSupply: number;
    }
  >;
  flows?: {
    clearedUnits: number;
    clearedUnitsPooled: number;
    unmetDemandUnits: number;
    unmetDemandUnitsPooled: number;
    surplusUnits: number;
    surplusUnitsPooled: number;
    stockUnits: number | null;
  };
  history: { supply: number; demand: number }[];
  syntheticDemandSources: { units: number; receivedUnits?: number }[];
  demandDriver: { sourceUnits?: number } | null;
}

/** The label every converted figure carries. */
export const PER_TURN = "per turn";

/** One price-phase quantity, per turn. Non-finite values pass through unchanged. */
export function bookPerTurn(units: number): number;
export function bookPerTurn(units: number | null): number | null;
export function bookPerTurn(units: number | null | undefined): number | null | undefined;
export function bookPerTurn(units: number | null | undefined): number | null | undefined {
  if (typeof units !== "number" || !Number.isFinite(units)) return units;
  return Math.round((units / TURNS_PER_DAY) * 100) / 100;
}

/** Every value of a price-phase record, per turn. */
export function recordPerTurn(
  values: Readonly<Record<string, number>> | undefined
): Record<string, number> | undefined {
  if (!values) return values;
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, bookPerTurn(v)]));
}

function mapValues<T, U>(
  values: Readonly<Record<string, T>> | undefined,
  map: (value: T) => U
): Record<string, U> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, map(v)]));
}

/**
 * A commodity page's data with every price-phase quantity per turn. Company
 * volumes, extraction capacity and freight network figures are already per
 * turn or on their own basis, and prices and ratios do not depend on the unit.
 */
export function commodityDetailPerTurn<T extends BookFields>(detail: T): T {
  return {
    ...detail,
    globalSupply: bookPerTurn(detail.globalSupply),
    globalDemand: bookPerTurn(detail.globalDemand),
    stateSupply: recordPerTurn(detail.stateSupply) ?? {},
    stateDemand: recordPerTurn(detail.stateDemand) ?? {},
    ...(detail.nationalSupply ? { nationalSupply: recordPerTurn(detail.nationalSupply) } : {}),
    ...(detail.nationalDemand ? { nationalDemand: recordPerTurn(detail.nationalDemand) } : {}),
    ...(detail.fundedCountryBooks
      ? {
          fundedCountryBooks: mapValues(detail.fundedCountryBooks, (b) => ({
            ...b,
            supply: bookPerTurn(b.supply),
            demand: bookPerTurn(b.demand),
            spilloverRequested: bookPerTurn(b.spilloverRequested),
            filled: bookPerTurn(b.filled),
            funded: bookPerTurn(b.funded),
            imports: bookPerTurn(b.imports),
            exports: bookPerTurn(b.exports),
          })),
        }
      : {}),
    ...(detail.reachableBooks
      ? {
          reachableBooks: mapValues(detail.reachableBooks, (b) => ({
            ...b,
            supply: bookPerTurn(b.supply),
            demand: bookPerTurn(b.demand),
            domesticDemand: bookPerTurn(b.domesticDemand),
            imports: bookPerTurn(b.imports),
            exports: bookPerTurn(b.exports),
            blockedSupply: bookPerTurn(b.blockedSupply),
            untradedSupply: bookPerTurn(b.untradedSupply),
          })),
        }
      : {}),
    ...(detail.flows
      ? {
          flows: {
            ...detail.flows,
            clearedUnits: bookPerTurn(detail.flows.clearedUnits),
            clearedUnitsPooled: bookPerTurn(detail.flows.clearedUnitsPooled),
            unmetDemandUnits: bookPerTurn(detail.flows.unmetDemandUnits),
            unmetDemandUnitsPooled: bookPerTurn(detail.flows.unmetDemandUnitsPooled),
            surplusUnits: bookPerTurn(detail.flows.surplusUnits),
            surplusUnitsPooled: bookPerTurn(detail.flows.surplusUnitsPooled),
            stockUnits: bookPerTurn(detail.flows.stockUnits),
          },
        }
      : {}),
    history: detail.history.map((h) => ({
      ...h,
      supply: bookPerTurn(h.supply),
      demand: bookPerTurn(h.demand),
    })),
    syntheticDemandSources: detail.syntheticDemandSources.map((s) => ({
      ...s,
      units: bookPerTurn(s.units),
      ...(s.receivedUnits != null ? { receivedUnits: bookPerTurn(s.receivedUnits) } : {}),
    })),
    demandDriver:
      detail.demandDriver && detail.demandDriver.sourceUnits != null
        ? { ...detail.demandDriver, sourceUnits: bookPerTurn(detail.demandDriver.sourceUnits) }
        : detail.demandDriver,
  } as T;
}

interface ListRowFields {
  globalSupply: number;
  globalDemand: number;
  exchangeSupply: number;
  exchangeDemand: number;
  stateSupply: Units;
  stateDemand?: Units;
  nationalSupply?: Units;
  nationalDemand?: Units;
  reachableBooks?: BookFields["reachableBooks"];
}

/** One row of the commodity market list with every price-phase quantity per turn. */
export function commodityListRowPerTurn<T extends ListRowFields>(row: T): T {
  return {
    ...row,
    globalSupply: bookPerTurn(row.globalSupply),
    globalDemand: bookPerTurn(row.globalDemand),
    exchangeSupply: bookPerTurn(row.exchangeSupply),
    exchangeDemand: bookPerTurn(row.exchangeDemand),
    stateSupply: recordPerTurn(row.stateSupply) ?? {},
    ...(row.stateDemand ? { stateDemand: recordPerTurn(row.stateDemand) } : {}),
    ...(row.nationalSupply ? { nationalSupply: recordPerTurn(row.nationalSupply) } : {}),
    ...(row.nationalDemand ? { nationalDemand: recordPerTurn(row.nationalDemand) } : {}),
    ...(row.reachableBooks
      ? {
          reachableBooks: mapValues(row.reachableBooks, (b) => ({
            ...b,
            supply: bookPerTurn(b.supply),
            demand: bookPerTurn(b.demand),
            domesticDemand: bookPerTurn(b.domesticDemand),
            imports: bookPerTurn(b.imports),
            exports: bookPerTurn(b.exports),
            blockedSupply: bookPerTurn(b.blockedSupply),
            untradedSupply: bookPerTurn(b.untradedSupply),
          })),
        }
      : {}),
  } as T;
}
