/**
 * Plants turn purchased inputs and paid work into deliverable output.
 * Input shortages constrain the whole recipe; purchases and consumed stock
 * retain their receipt cost instead of being billed again at a reference price.
 */
import {
  cappedStockUnitCost,
  markdownFactor,
  markedDownAsk,
  stockCover,
  writeDownUnits,
} from "./stockCoverRules";
import {
  quoteProducer,
  settleProducerMarket,
  type MarketAccount,
  type ProducerOffer,
  type ProducerQuotePolicy,
  type ProducerTradeReceipt,
  type PurchaseOrder,
} from "./rules";
import {
  accrueProducerPayable,
  settlePriorProducerPayables,
  type ProducerPayable,
} from "./payablesRules";
import { COMMODITY_SPOILAGE_PER_TURN } from "../inventory";
import { householdPurchaseOrders } from "./householdRules";
import { makeDoOutput } from "./makeDoRules";
import { feasibleProduction } from "./productionFeasibilityRules";
import { spilloverOrders } from "./spilloverRules";

const laneKeyOf = (commodity: string, book: string) => JSON.stringify([commodity, book]);

export interface PurchasedStock {
  commodity: string;
  units: number;
  /** Remaining acquisition value, in the same currency as market accounts. */
  value: number;
}

export interface ProducedStock {
  commodity: string;
  units: number;
  book: string;
  /** Historical quote memo only. Production expenses were already recognized. */
  quoteUnitCost?: number;
}

export interface ProductionPlan {
  id: string;
  accountId: string;
  capacityUnits: number;
  activeFraction: number;
  /** Prior staffing, disasters and other physical constraints, excluding demand. */
  outputMultiplier: number;
  inputs: readonly {
    commodity: string;
    unitsPerOutput: number;
    book: string;
    maximumUnitPrice: number;
  }[];
  outputs: readonly {
    commodity: string;
    unitsPerOutput: number;
    book: string;
    policy: ProducerQuotePolicy;
    referenceUnitPrice: number;
    storable: boolean;
    /** Required for cost-plus sales of stock no longer made by this recipe. */
    retainedUnitCost?: number;
  }[];
  /** Cash payment for the active workforce, independent of realized sales. */
  labourCost: number;
  /** Explicit site, cold-capacity and regulatory costs, independent of product prices. */
  otherOperatingCost: number;
  labourRecipientAccountId: string;
  operatingRecipientAccountId: string;
  inputStock: readonly PurchasedStock[];
  /** Previously produced, unsold stock available beside current production. */
  outputStock: readonly ProducedStock[];
  /**
   * Units this plant sold last turn, for stock-cover markdown (stockCoverRules).
   * Absent means no markdown or write-down for this plant.
   */
  recentSoldUnits?: number;
  /** Units delivered per output last turn, keyed `${commodity}|${book}`; overrides the plant total. */
  recentSoldByOutput?: Readonly<Record<string, number>>;
}

export interface ProducerInputReservation {
  id: string;
  producerId: string;
  commodity: string;
  supplierOfferId: string;
  units: number;
  unitPrice: number;
}

export interface ProducerOperatingResult {
  id: string;
  capacityUnits: number;
  activeUnits: number;
  /** Physical proposal before funded order matching constrains actual production. */
  plannedUnits: number;
  producedUnits: number;
  offeredUnits: number;
  soldUnits: number;
  deliveredUnits: number;
  revenue: number;
  purchases: number;
  inputsConsumed: number;
  /** Acquisition value lost from unused purchased inputs; not another cash charge. */
  inventoryWriteOff: number;
  labourPaid: number;
  otherOperatingPaid: number;
  labourArrears: number;
  otherOperatingArrears: number;
  operatingArrears: number;
  arrearsPaid: number;
  closingArrears: number;
  /** Purchases move cash into input stock; only consumption is an expense. */
  profit: number;
  /**
   * Inputs consumed by output that went to stock instead of a buyer this turn:
   * inventory at cost, not a loss. Reported beside profit, never moved as cash.
   */
  unsoldProductionCost?: number;
  cashFlow: number;
  inputStock: PurchasedStock[];
  outputStock: ProducedStock[];
  /** Receipts on the same per-turn physical basis as purchases and inventory. */
  products: Array<{
    commodity: string;
    book: string;
    producedUnits: number;
    offeredUnits: number;
    soldUnits: number;
    internalDeliveredUnits: number;
    deliveredUnits: number;
    revenue: number;
    askingUnitPrice: number;
    realizedUnitPrice: number | null;
    unsoldUnits: number;
    lostUnits: number;
  }>;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

type QuoteVolumes = Map<
  string,
  {
    levels: Map<number, number>;
    owners: Map<string, Map<number, number>>;
  }
>;

function indexQuoteVolumes(
  rows: readonly {
    commodity: string;
    book: string;
    ownerId: string;
    unitPrice: number;
    units: number;
  }[]
): QuoteVolumes {
  const books: QuoteVolumes = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.commodity, row.book]);
    const book = books.get(key) ?? { levels: new Map(), owners: new Map() };
    book.levels.set(row.unitPrice, (book.levels.get(row.unitPrice) ?? 0) + row.units);
    const owned = book.owners.get(row.ownerId) ?? new Map<number, number>();
    owned.set(row.unitPrice, (owned.get(row.unitPrice) ?? 0) + row.units);
    book.owners.set(row.ownerId, owned);
    books.set(key, book);
  }
  return books;
}

function quoteVolumesExcept(
  books: QuoteVolumes,
  commodity: string,
  bookId: string,
  ownerId: string
) {
  const book = books.get(JSON.stringify([commodity, bookId]));
  if (!book) return [];
  const owned = book.owners.get(ownerId);
  return [...book.levels].map(([unitPrice, total]) => ({
    unitPrice,
    units: Math.max(0, total - (owned?.get(unitPrice) ?? 0)),
  }));
}

/**
 * Joint production and delivery: shrink proposed production until every
 * recipe is backed by funded, delivered inputs. Each trial uses the same
 * opening cash and stock; no preview transfers money or borrows sale proceeds.
 */
/** Units an output sold last turn: its own row when the receipt has product rows, else the plant total. */
function recentSoldOf(p: ProductionPlan, commodity: string, book: string): number | undefined {
  if (p.recentSoldUnits == null) return undefined;
  return p.recentSoldByOutput
    ? (p.recentSoldByOutput[`${commodity}|${book}`] ?? 0)
    : p.recentSoldUnits;
}

export function advanceProducerEconomy(input: {
  turn: number;
  accounts: readonly MarketAccount[];
  payables?: readonly ProducerPayable[];
  producers: readonly ProductionPlan[];
  externalOffers?: readonly ProducerOffer[];
  externalOrders?: readonly PurchaseOrder[];
  inputReservations?: readonly ProducerInputReservation[];
  households?: readonly Omit<Parameters<typeof householdPurchaseOrders>[0], "cash">[];
  /** Explicit route/scope eligibility; missing entries allow only the offer's own book. */
  eligibleOffersByOrder?: Readonly<Record<string, readonly string[]>>;
  maximumPlanningPasses?: number;
  /**
   * Same-turn spillover of household spend stranded in sold-out lanes onto the
   * buyer's other lanes with unsold supply (spilloverRules). 0 or absent = off.
   */
  spilloverShare?: number;
  /** Explicit carry policy for alternate catalogs; ordinary worlds use commodity spoilage. */
  carryLossByCommodity?: Readonly<Record<string, number>>;
  /** Turns of recent sales a seller may carry before marking down (stockCoverRules); 0 or absent = off. */
  stockCoverTurns?: number;
  /** Country of a producing site, so offers and its input orders carry one. */
  countryOfProducer?: (producerId: string) => string | undefined;
  /** Build the per-country funded book on the final settlement (see fundedBookRules). */
  trackCountryBooks?: boolean;
}): {
  accounts: MarketAccount[];
  payables: ProducerPayable[];
  payablePayments: ProducerPayable[];
  producers: ProducerOperatingResult[];
  tradeReceipt: ProducerTradeReceipt;
  prices: ReturnType<typeof settleProducerMarket>["prices"];
  /** Units each buyer order asked for and received, for demand telemetry. */
  orderOutcomes: Array<{
    commodity: string;
    book: string;
    /** Buyer account, so demand can be placed where the buyer is. */
    accountId: string;
    requestedUnits: number;
    deliveredUnits: number;
  }>;
  /** Household spend stranded in sold-out lanes and how much the extra clearing placed. */
  spillover?: { strandedSpend: number; extraRequested: number; recovered: number };
  /** Per-country funded book from the settled clearing, when `trackCountryBooks` is on. */
  countryBooks?: ReturnType<typeof settleProducerMarket>["countryBooks"];
} {
  const carryRates: Readonly<Record<string, number>> =
    input.carryLossByCommodity ?? COMMODITY_SPOILAGE_PER_TURN;
  const countryOfProducer = input.countryOfProducer;
  const carryLoss = (commodity: string) => {
    const rate = carryRates[commodity] ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1)
      throw new Error("Invalid inventory carry loss");
    return rate;
  };
  const prior = settlePriorProducerPayables({
    accounts: input.accounts,
    payables: input.payables ?? [],
  });
  const closingPayables = new Map(prior.payables.map((claim) => [claim.id, claim]));
  const oldBillsPaidByProducer = new Map<string, number>();
  const oldBillsRemainingByProducer = new Map<string, number>();
  for (const payment of prior.payments) {
    const key = JSON.stringify([payment.debtorAccountId, payment.producerId]);
    oldBillsPaidByProducer.set(key, (oldBillsPaidByProducer.get(key) ?? 0) + payment.amount);
  }
  for (const claim of prior.payables) {
    const key = JSON.stringify([claim.debtorAccountId, claim.producerId]);
    oldBillsRemainingByProducer.set(
      key,
      (oldBillsRemainingByProducer.get(key) ?? 0) + claim.amount
    );
  }
  const producerIds = new Set<string>();
  const cash = new Map(prior.accounts.map((a) => [a.id, finite(a.cash, "opening operating cash")]));
  const pendingDueByAccount = new Map<string, number>();
  for (const claim of prior.payables)
    pendingDueByAccount.set(
      claim.debtorAccountId,
      (pendingDueByAccount.get(claim.debtorAccountId) ?? 0) + claim.amount
    );
  const heldForPayables = new Map<string, number>();
  const reserveUnpaidCash = () => {
    for (const [id, due] of pendingDueByAccount) {
      const held = heldForPayables.get(id) ?? 0;
      const added = Math.min(cash.get(id)!, Math.max(0, due - held));
      cash.set(id, cash.get(id)! - added);
      heldForPayables.set(id, held + added);
    }
  };
  reserveUnpaidCash();
  const payments = new Map<string, { labour: number; operating: number; arrears: number }>();
  const offers: ProducerOffer[] = [...(input.externalOffers ?? [])];
  const plans = [...input.producers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Reserve fixed bills across a whole corporation pro rata, not by sector id.
  const bills = new Map<string, number>();
  for (const p of plans) {
    if (!p.id || producerIds.has(p.id)) throw new Error("Duplicate producer");
    producerIds.add(p.id);
    for (const id of [p.accountId, p.labourRecipientAccountId, p.operatingRecipientAccountId])
      if (!cash.has(id)) throw new Error("Missing operating account");
    finite(p.capacityUnits, "capacity");
    if (
      !Number.isFinite(p.activeFraction) ||
      p.activeFraction < 0 ||
      p.activeFraction > 1 ||
      !Number.isFinite(p.outputMultiplier) ||
      p.outputMultiplier < 0
    )
      throw new Error("Invalid capacity fraction");
    finite(p.capacityUnits * p.activeFraction * p.outputMultiplier, "physical output");
    bills.set(
      p.accountId,
      (bills.get(p.accountId) ?? 0) +
        finite(p.labourCost, "labour cost") +
        finite(p.otherOperatingCost, "operating cost")
    );
    const commodities = new Set<string>();
    for (const recipe of p.inputs) {
      if (commodities.has(recipe.commodity)) throw new Error("Duplicate input recipe");
      commodities.add(recipe.commodity);
      finite(recipe.unitsPerOutput, "input recipe");
      finite(recipe.maximumUnitPrice, "input limit");
    }
    for (const stock of p.inputStock) {
      finite(stock.units, "input stock");
      finite(stock.value, "stock value");
      if (stock.units === 0 && stock.value !== 0) throw new Error("Value without purchased units");
    }
    const outputCommodities = new Set<string>();
    for (const output of p.outputs) {
      if (outputCommodities.has(output.commodity)) throw new Error("Duplicate output recipe");
      outputCommodities.add(output.commodity);
      finite(output.unitsPerOutput, "output recipe");
      finite(output.referenceUnitPrice, "reference price");
      if (output.retainedUnitCost != null) finite(output.retainedUnitCost, "retained quote cost");
      if (
        output.unitsPerOutput === 0 &&
        output.policy.kind === "costPlus" &&
        output.retainedUnitCost == null
      )
        throw new Error("Retained cost-plus stock requires a recorded unit cost");
    }
    for (const stock of p.outputStock) {
      finite(stock.units, "output stock");
      if (stock.quoteUnitCost != null) finite(stock.quoteUnitCost, "stock quote cost");
      // An empty row (a good the plant no longer makes and has sold out of) is
      // harmless; only stock that exists must match an output and its book.
      if (
        stock.units > 0 &&
        (!outputCommodities.has(stock.commodity) ||
          !p.outputs.some(
            (output) => output.commodity === stock.commodity && output.book === stock.book
          ))
      )
        throw new Error(
          `Unrecognized produced stock or market book: ${p.id} ${stock.commodity} ${stock.book} (outputs ${p.outputs.map((o) => `${o.commodity}@${o.book}`).join(",")})`
        );
    }
  }
  const funding = new Map(
    [...bills].map(([id, bill]) => [id, bill > 0 ? Math.min(1, cash.get(id)! / bill) : 1])
  );
  const credits = new Map<string, number>();
  for (const p of plans) {
    const fraction = funding.get(p.accountId)!;
    const labour = p.labourCost * fraction,
      operating = p.otherOperatingCost * fraction;
    cash.set(p.accountId, Math.max(0, cash.get(p.accountId)! - labour - operating));
    credits.set(
      p.labourRecipientAccountId,
      (credits.get(p.labourRecipientAccountId) ?? 0) + labour
    );
    credits.set(
      p.operatingRecipientAccountId,
      (credits.get(p.operatingRecipientAccountId) ?? 0) + operating
    );
    pendingDueByAccount.set(
      p.accountId,
      (pendingDueByAccount.get(p.accountId) ?? 0) +
        Math.max(0, p.labourCost - labour) +
        Math.max(0, p.otherOperatingCost - operating)
    );
    payments.set(p.id, {
      labour,
      operating,
      arrears: Math.max(0, p.labourCost - labour) + Math.max(0, p.otherOperatingCost - operating),
    });
  }
  // Paid wages are actual income, not an invented household demand multiplier.
  for (const [id, amount] of credits) cash.set(id, cash.get(id)! + amount);
  reserveUnpaidCash();
  const householdIds = new Set<string>();
  let consumerOrders = [...(input.externalOrders ?? [])];
  for (const household of input.households ?? []) {
    if (householdIds.has(household.accountId) || !cash.has(household.accountId))
      throw new Error("Duplicate or unknown household wallet");
    householdIds.add(household.accountId);
    consumerOrders.push(
      ...householdPurchaseOrders({ ...household, cash: cash.get(household.accountId)! })
    );
  }
  const orders = [...consumerOrders];
  const originalCash = new Map(input.accounts.map((a) => [a.id, a.cash]));
  const plannedById = new Map(
    plans.map((p) => [
      p.id,
      p.capacityUnits * p.activeFraction * p.outputMultiplier * (funding.get(p.accountId) ?? 1),
    ])
  );
  // Physical maximum per plant, before the feasibility pre-pass picks a start.
  const physicalMaximum = new Map(plannedById);
  // Find a physically feasible mix before buyers reserve inputs. Otherwise an
  // early final producer can take the energy needed by the steel supplier that
  // makes its own inputs, and a greedy shrink pass strands the entire cycle.
  // Each segment ends when one owned input is exhausted. Its marginal input
  // requirement is constant. This retains partial batches without ever treating
  // private purchased stock as a shared commodity endowment.
  const segments = plans.flatMap((p) => {
    const maximum = plannedById.get(p.id)!;
    const owned = new Map(
      p.inputs.map((r) => [
        r.commodity,
        p.inputStock
          .filter((s) => s.commodity === r.commodity)
          .reduce((sum, s) => sum + s.units, 0),
      ])
    );
    const boundaries = new Set([0, 1]);
    for (const r of p.inputs) {
      const required = maximum * r.unitsPerOutput;
      const fraction = required > 0 ? (owned.get(r.commodity) ?? 0) / required : 0;
      if (fraction > 0 && fraction < 1) boundaries.add(fraction);
    }
    const points = [...boundaries].sort((a, b) => a - b);
    return points.slice(1).map((to, j) => ({
      id: JSON.stringify([p.id, j]),
      plan: p,
      owned,
      from: points[j] * maximum,
      to: to * maximum,
      units: (to - points[j]) * maximum,
    }));
  });
  const resources = new Map<string, { available: number; coefficients: number[] }>();
  const resource = (commodity: string, book: string) => {
    const key = JSON.stringify([commodity, book]);
    let row = resources.get(key);
    if (!row) {
      row = { available: 0, coefficients: Array(segments.length).fill(0) };
      resources.set(key, row);
    }
    return row;
  };
  for (const [j, segment] of segments.entries()) {
    for (const recipe of segment.plan.inputs) {
      const owned = segment.owned.get(recipe.commodity) ?? 0;
      resource(recipe.commodity, recipe.book).coefficients[j] +=
        Math.max(0, segment.to * recipe.unitsPerOutput - owned) -
        Math.max(0, segment.from * recipe.unitsPerOutput - owned);
    }
    for (const output of segment.plan.outputs)
      resource(output.commodity, output.book).coefficients[j] -=
        segment.units * output.unitsPerOutput;
  }
  for (const p of plans)
    for (const output of p.outputs)
      resource(output.commodity, output.book).available += p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((sum, s) => sum + s.units, 0);
  for (const offer of input.externalOffers ?? [])
    resource(offer.commodity, offer.book).available += Math.min(
      offer.units,
      offer.deliverableUnits ?? offer.units
    );
  const feasible = feasibleProduction({
    activities: segments.map((s) => ({
      id: s.id,
      value:
        s.units *
        s.plan.outputs.reduce((sum, o) => sum + o.unitsPerOutput * o.referenceUnitPrice, 0),
    })),
    constraints: [...resources.values()],
  });
  for (const p of plans) plannedById.set(p.id, 0);
  for (const [j, segment] of segments.entries())
    plannedById.set(
      segment.plan.id,
      plannedById.get(segment.plan.id)! + segment.units * feasible[j]
    );
  const proposedById = new Map(plannedById);
  const reservations = new Map<string, ProducerInputReservation[]>();
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const reservationIds = new Set<string>();
  for (const reservation of input.inputReservations ?? []) {
    if (!reservation.id || reservationIds.has(reservation.id) || !reservation.supplierOfferId)
      throw new Error("Invalid input reservation identity");
    reservationIds.add(reservation.id);
    finite(reservation.units, "reserved units");
    finite(reservation.unitPrice, "reserved price");
    const plan = plansById.get(reservation.producerId);
    if (!plan?.inputs.some((recipe) => recipe.commodity === reservation.commodity))
      throw new Error("Input reservation has no matching recipe");
    const key = JSON.stringify([reservation.producerId, "input", reservation.commodity]);
    const rows = reservations.get(key) ?? [];
    rows.push(reservation);
    reservations.set(key, rows);
  }
  const orderIdsForInput = (producerId: string, commodity: string) => {
    const id = JSON.stringify([producerId, "input", commodity]);
    return [
      id,
      ...(reservations.get(id) ?? []).map((r) => JSON.stringify([id, "reservation", r.id])),
    ];
  };
  const inputOrders = (): PurchaseOrder[] =>
    plans.flatMap((p) =>
      p.inputs.flatMap((recipe) => {
        const stock = p.inputStock
          .filter((s) => s.commodity === recipe.commodity)
          .reduce((n, s) => n + s.units, 0);
        const id = JSON.stringify([p.id, "input", recipe.commodity]);
        const units = Math.max(0, plannedById.get(p.id)! * recipe.unitsPerOutput - stock);
        const reserved = reservations.get(id) ?? [];
        const quantityGroup = reserved.length ? { id, maximumUnits: units } : undefined;
        const publicOrder: PurchaseOrder = {
          id,
          accountId: p.accountId,
          commodity: recipe.commodity,
          book: recipe.book,
          units,
          maximumUnitPrice: recipe.maximumUnitPrice,
          priority: 1,
          eligibleOfferIds: input.eligibleOffersByOrder?.[id],
          ...(countryOfProducer?.(p.id) ? { countryId: countryOfProducer(p.id) } : {}),
          ...(quantityGroup ? { quantityGroup } : {}),
        };
        return [
          publicOrder,
          ...reserved.map((reservation): PurchaseOrder => {
            const reservedId = JSON.stringify([id, "reservation", reservation.id]);
            return {
              ...publicOrder,
              id: reservedId,
              units: Math.min(units, reservation.units),
              maximumUnitPrice: reservation.unitPrice,
              contractUnitPrice: reservation.unitPrice,
              supplierOfferId: reservation.supplierOfferId,
              eligibleOfferIds:
                input.eligibleOffersByOrder?.[reservedId] ?? publicOrder.eligibleOfferIds,
            };
          }),
        ];
      })
    );
  orders.push(...inputOrders());
  const pendingQuotes: Array<{
    offer: ProducerOffer;
    quote: Parameters<typeof quoteProducer>[0];
    markdown: { factor: number; reference: number };
  }> = [];
  const requestedSpend = new Map<string, number>();
  const groupedSpend = new Map<string, { accountId: string; maximumSpend: number }>();
  for (const order of orders) {
    if (order.quantityGroup) {
      const group = groupedSpend.get(order.quantityGroup.id);
      groupedSpend.set(order.quantityGroup.id, {
        accountId: order.accountId,
        maximumSpend: Math.max(
          group?.maximumSpend ?? 0,
          order.quantityGroup.maximumUnits * order.maximumUnitPrice
        ),
      });
      continue;
    }
    requestedSpend.set(
      order.accountId,
      (requestedSpend.get(order.accountId) ?? 0) +
        Math.min(order.units * order.maximumUnitPrice, order.maximumSpend ?? Number.MAX_VALUE)
    );
  }
  for (const group of groupedSpend.values())
    requestedSpend.set(
      group.accountId,
      (requestedSpend.get(group.accountId) ?? 0) + group.maximumSpend
    );
  // Aggregate identical limits once. Retaining one demand object per buyer
  // per seller makes an otherwise modest world use quadratic memory.
  const demandBooks = indexQuoteVolumes(
    orders
      .filter((order) => !order.supplierOfferId)
      .map((order) => ({
        commodity: order.commodity,
        book: order.book,
        ownerId: order.accountId,
        unitPrice: order.maximumUnitPrice,
        units:
          Math.min(
            order.units,
            order.maximumUnitPrice > 0
              ? (order.maximumSpend ?? Number.MAX_VALUE) / order.maximumUnitPrice
              : order.units
          ) *
          Math.min(
            1,
            (cash.get(order.accountId) ?? 0) /
              Math.max(Number.MIN_VALUE, requestedSpend.get(order.accountId) ?? 0)
          ),
      }))
  );
  for (const p of plans) {
    const fixed = p.labourCost + p.otherOperatingCost;
    const variablePerOutput = p.inputs.reduce(
      (n, r) => n + r.unitsPerOutput * r.maximumUnitPrice,
      0
    );
    const outputValue = p.outputs.reduce((n, r) => n + r.unitsPerOutput * r.referenceUnitPrice, 0);
    for (const output of p.outputs) {
      const stock = p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((n, s) => n + s.units, 0);
      const units = stock + plannedById.get(p.id)! * output.unitsPerOutput;
      const weight =
        outputValue > 0 ? (output.unitsPerOutput * output.referenceUnitPrice) / outputValue : 0;
      const quoteInput = {
        policy: output.policy,
        referenceUnitPrice: output.referenceUnitPrice,
        variableUnitCost:
          output.unitsPerOutput > 0
            ? (variablePerOutput * weight) / output.unitsPerOutput
            : (output.retainedUnitCost ?? 0),
        fixedCost: fixed * weight,
        offeredUnits: units,
        demand: quoteVolumesExcept(demandBooks, output.commodity, output.book, p.accountId).map(
          (level) => ({ units: level.units, maximumUnitPrice: level.unitPrice })
        ),
        competitors: [],
      };
      const quote = quoteProducer({
        ...quoteInput,
        policy:
          output.policy.kind === "automatic"
            ? { kind: "manual", unitPrice: output.referenceUnitPrice }
            : output.policy,
      });
      const recentSold = recentSoldOf(p, output.commodity, output.book);
      const cover = recentSold != null ? stockCover(stock, recentSold) : 0;
      pendingQuotes.push({
        markdown: {
          factor: markdownFactor(cover, { coverTurns: input.stockCoverTurns ?? 0 }),
          reference: output.referenceUnitPrice,
        },
        offer: {
          id: JSON.stringify([p.id, "output", output.commodity]),
          accountId: p.accountId,
          commodity: output.commodity,
          book: output.book,
          units,
          unitPrice: quote.unitPrice,
          ...(countryOfProducer?.(p.id) ? { countryId: countryOfProducer(p.id) } : {}),
        },
        quote: quoteInput,
      });
    }
  }
  const openingOffers = [...offers, ...pendingQuotes.map((q) => q.offer)];
  const supplyBooks = indexQuoteVolumes(
    openingOffers.map((offer) => ({ ...offer, ownerId: offer.id }))
  );
  for (const pending of pendingQuotes) {
    const quote = quoteProducer({
      ...pending.quote,
      competitors: quoteVolumesExcept(
        supplyBooks,
        pending.offer.commodity,
        pending.offer.book,
        pending.offer.id
      ),
    });
    offers.push({
      ...pending.offer,
      unitPrice: markedDownAsk(
        quote.unitPrice,
        pending.markdown.reference,
        pending.markdown.factor
      ),
    });
  }
  const postedOffers = new Map(offers.map((o) => [o.id, o]));
  const trial = (track = false) => {
    const proposedOffers: ProducerOffer[] = [...(input.externalOffers ?? [])];
    for (const p of plans)
      for (const output of p.outputs) {
        const id = JSON.stringify([p.id, "output", output.commodity]);
        const stock = p.outputStock
          .filter((s) => s.commodity === output.commodity && s.book === output.book)
          .reduce((n, s) => n + s.units, 0);
        proposedOffers.push({
          ...postedOffers.get(id)!,
          units: stock + plannedById.get(p.id)! * output.unitsPerOutput,
        });
      }
    return settleProducerMarket({
      turn: input.turn,
      accounts: [...cash].map(([id, value]) => ({ id, cash: value })),
      offers: proposedOffers,
      orders: [...consumerOrders, ...inputOrders()],
      ...(track ? { trackCountryBooks: true } : {}),
    });
  };
  let market: ReturnType<typeof settleProducerMarket> | undefined;
  const passes = input.maximumPlanningPasses ?? 128;
  if (!Number.isSafeInteger(passes) || passes < 1 || passes > 1024)
    throw new Error("Invalid planning-pass limit");
  // Make do with short inputs (makeDoRules.ts): each pass reads every input's
  // fill rate at the current plan and sets output from its physical maximum, so
  // shortages settle at a proportional cut instead of compounding to zero.
  // Rises are damped; a run that has not settled keeps its last plan.
  // The pre-pass result is the starting plan: it allocates scarce inputs so
  // supplier cycles stay alive, and a plant it fed never rises above it (a
  // rise would starve that cycle). A plant it zeroed (its inputs net short, or
  // no local supplier) rises toward what make-do allows from its physical
  // maximum.
  const originalPlan = new Map(
    plans.map((p) => {
      const start = plannedById.get(p.id)!;
      return [p.id, start > 0 ? start : physicalMaximum.get(p.id)!] as const;
    })
  );
  // A zeroed plant tries: it orders at its physical maximum on the first pass
  // and settles by fill rate like everyone else.
  for (const p of plans)
    if (!(plannedById.get(p.id)! > 0)) plannedById.set(p.id, physicalMaximum.get(p.id)!);
  for (let pass = 0; pass < passes; pass++) {
    market = trial();
    const bought = new Map(market.orders.map((o) => [o.id, o.deliveredUnits]));
    let changed = false;
    for (const p of plans) {
      const previous = plannedById.get(p.id)!;
      const fills = p.inputs.map((recipe) => {
        const stock = p.inputStock
          .filter((s) => s.commodity === recipe.commodity)
          .reduce((n, s) => n + s.units, 0);
        const have =
          stock +
          orderIdsForInput(p.id, recipe.commodity).reduce(
            (sum, id) => sum + (bought.get(id) ?? 0),
            0
          );
        const need = previous * recipe.unitsPerOutput;
        return {
          unitsPerOutput: recipe.unitsPerOutput,
          unitValue: recipe.maximumUnitPrice,
          // A plan already at zero ordered nothing; it stays at zero.
          fill: need > 0 ? Math.min(1, have / need) : previous > 0 ? 1 : 0,
        };
      });
      const target = makeDoOutput(originalPlan.get(p.id)!, fills);
      // Falls apply at once; rises are damped so the cycle settles.
      const damped = target <= previous ? target : (previous + target) / 2;
      // A plan that has decayed to a negligible share of the original is zero.
      const next = damped < originalPlan.get(p.id)! * 1e-9 ? 0 : damped;
      if (Math.abs(next - previous) > Math.max(1e-9, previous * 1e-4)) changed = true;
      plannedById.set(p.id, Math.max(0, Math.min(originalPlan.get(p.id)!, next)));
    }
    if (!changed) break;
  }
  // Clear once more at the settled plan so every sale is backed by what is
  // actually produced (the last pass may have lowered plans after clearing).
  market = trial(input.trackCountryBooks === true);
  if (!market) throw new Error("Missing producer market settlement");
  let spillover: { strandedSpend: number; extraRequested: number; recovered: number } | undefined;
  if ((input.spilloverShare ?? 0) > 0 && householdIds.size > 0) {
    const offerLane = new Map(
      [...(input.externalOffers ?? []), ...offers].map((o) => [
        o.id,
        laneKeyOf(o.commodity, o.book),
      ])
    );
    const unsoldUnits = new Map<string, number>();
    for (const o of market.offers) {
      const lane = offerLane.get(o.id);
      if (lane)
        unsoldUnits.set(lane, (unsoldUnits.get(lane) ?? 0) + (o.offeredUnits - o.deliveredUnits));
    }
    const first = new Map(
      market.orders.map((o) => [o.id, { cost: o.cost, deliveredUnits: o.deliveredUnits }])
    );
    const next = spilloverOrders({
      orders: consumerOrders,
      accounts: householdIds,
      outcomes: first,
      unsoldUnits,
      laneKey: laneKeyOf,
      share: input.spilloverShare as number,
    });
    if (next.stats.extraRequested > 0) {
      const spend = (orders: ReturnType<typeof settleProducerMarket>["orders"]) => {
        const ids = new Set(
          consumerOrders.filter((o) => householdIds.has(o.accountId)).map((o) => o.id)
        );
        return orders.filter((o) => ids.has(o.id)).reduce((sum, o) => sum + o.cost, 0);
      };
      const before = spend(market.orders);
      consumerOrders = next.orders;
      market = trial(input.trackCountryBooks === true);
      spillover = { ...next.stats, recovered: spend(market.orders) - before };
    }
  }
  const results: ProducerOperatingResult[] = [];
  const offersById = new Map(market.offers.map((o) => [o.id, o]));
  const ordersById = new Map(market.orders.map((o) => [o.id, o]));
  const closingAccounts = market.accounts.map((account) => ({
    ...account,
    cash: account.cash + (heldForPayables.get(account.id) ?? 0),
  }));
  const closingCash = new Map(closingAccounts.map((a) => [a.id, a.cash]));
  for (const p of plans) {
    const stocks = new Map<string, PurchasedStock>();
    for (const stock of p.inputStock) {
      const previous = stocks.get(stock.commodity) ?? {
        commodity: stock.commodity,
        units: 0,
        value: 0,
      };
      previous.units += stock.units;
      previous.value += stock.value;
      stocks.set(stock.commodity, previous);
    }
    let purchases = 0;
    for (const recipe of p.inputs) {
      const bought = orderIdsForInput(p.id, recipe.commodity).reduce(
        (total, id) => {
          const order = ordersById.get(id)!;
          return {
            deliveredUnits: total.deliveredUnits + order.deliveredUnits,
            cost: total.cost + order.cost,
          };
        },
        { deliveredUnits: 0, cost: 0 }
      );
      const stock = stocks.get(recipe.commodity) ?? {
        commodity: recipe.commodity,
        units: 0,
        value: 0,
      };
      stock.units += bought.deliveredUnits;
      stock.value += bought.cost;
      purchases += bought.cost;
      stocks.set(recipe.commodity, stock);
    }
    // Make do: the plant produces its settled plan and uses up to what it has
    // of each input; a short input is used up rather than limiting output.
    const produced = plannedById.get(p.id)!;
    let consumed = 0;
    for (const recipe of p.inputs) {
      const stock = stocks.get(recipe.commodity)!;
      const used = Math.min(stock.units, produced * recipe.unitsPerOutput);
      const exhausted = used >= stock.units * (1 - 1e-12);
      const cost = exhausted
        ? stock.value
        : stock.units > 0
          ? (stock.value * used) / stock.units
          : 0;
      stock.units = exhausted ? 0 : Math.max(0, stock.units - used);
      stock.value = exhausted ? 0 : Math.max(0, stock.value - cost);
      consumed += cost;
    }
    let inventoryWriteOff = 0;
    for (const stock of stocks.values()) {
      const loss = carryLoss(stock.commodity);
      inventoryWriteOff += stock.value * loss;
      stock.units *= 1 - loss;
      stock.value *= 1 - loss;
    }
    let revenue = 0,
      offeredUnits = 0,
      soldUnits = 0,
      deliveredUnits = 0,
      // Value-weighted share of this turn's output that went to stock unsold.
      unsoldShare = 0;
    const products: ProducerOperatingResult["products"] = [];
    const outputStock = p.outputs.map((output) => {
      const sold = offersById.get(JSON.stringify([p.id, "output", output.commodity]))!;
      revenue += sold.revenue;
      offeredUnits += sold.offeredUnits;
      soldUnits += sold.soldUnits;
      deliveredUnits += sold.deliveredUnits;
      const opening = p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((n, s) => n + s.units, 0);
      const available = opening + produced * output.unitsPerOutput;
      const openingRows = p.outputStock.filter(
        (stock) =>
          stock.commodity === output.commodity && stock.book === output.book && stock.units > 0
      );
      const outputValue = p.outputs.reduce(
        (sum, row) => sum + row.unitsPerOutput * row.referenceUnitPrice,
        0
      );
      const weight =
        outputValue > 0 ? (output.unitsPerOutput * output.referenceUnitPrice) / outputValue : 0;
      const made = produced * output.unitsPerOutput;
      if (made > 0) unsoldShare += (weight * Math.max(0, made - sold.deliveredUnits)) / made;
      // Preserve an unknown historical cost as unknown. A reference price or
      // this turn's fixed bill cannot manufacture the old stock's cost basis.
      const knownOpeningCost = openingRows.every((stock) => stock.quoteUnitCost != null);
      const quoteUnitCost =
        available > 0 && knownOpeningCost && (made === 0 || outputValue > 0)
          ? cappedStockUnitCost(
              finite(
                (openingRows.reduce((sum, stock) => sum + stock.units * stock.quoteUnitCost!, 0) +
                  (made > 0 ? (consumed + p.labourCost + p.otherOperatingCost) * weight : 0)) /
                  available,
                "closing stock quote cost"
              ),
              output.referenceUnitPrice
            )
          : undefined;
      if (sold.deliveredUnits - available > Math.max(1e-8, available * 1e-12))
        throw new Error("Sold output exceeded input-backed production");
      const unsold = Math.max(0, available - sold.deliveredUnits);
      const carried =
        output.storable && sold.deliveredUnits < available * (1 - 1e-12)
          ? unsold * (1 - carryLoss(output.commodity))
          : 0;
      // Stock beyond the cover is written down a little each turn (stockCoverRules).
      const recentSoldOut = recentSoldOf(p, output.commodity, output.book);
      const writtenDown =
        recentSoldOut != null
          ? Math.min(
              carried,
              writeDownUnits(carried, stockCover(opening, recentSoldOut), {
                coverTurns: input.stockCoverTurns ?? 0,
              })
            )
          : 0;
      const kept = carried - writtenDown;
      // The written-down stock is a real loss at its cost basis (profit and dividends see it).
      if (writtenDown > 0 && openingRows.length > 0) {
        const openingUnits = openingRows.reduce((sum, st) => sum + st.units, 0);
        const basis = cappedStockUnitCost(
          openingUnits > 0
            ? openingRows.reduce((sum, st) => sum + st.units * (st.quoteUnitCost ?? 0), 0) /
                openingUnits
            : 0,
          output.referenceUnitPrice
        );
        inventoryWriteOff += writtenDown * basis;
      }
      products.push({
        commodity: output.commodity,
        book: output.book,
        producedUnits: produced * output.unitsPerOutput,
        offeredUnits: sold.offeredUnits,
        soldUnits: sold.soldUnits,
        internalDeliveredUnits: sold.internalDeliveredUnits,
        deliveredUnits: sold.deliveredUnits,
        revenue: sold.revenue,
        askingUnitPrice: postedOffers.get(JSON.stringify([p.id, "output", output.commodity]))!
          .unitPrice,
        realizedUnitPrice: sold.soldUnits > 0 ? sold.revenue / sold.soldUnits : null,
        unsoldUnits: unsold,
        lostUnits: unsold - kept,
      });
      return {
        commodity: output.commodity,
        book: output.book,
        units: kept,
        ...(quoteUnitCost != null && kept > 0 ? { quoteUnitCost } : {}),
      };
    });
    const paid = payments.get(p.id)!;
    const payableKey = JSON.stringify([p.accountId, p.id]);
    const arrearsPaid = oldBillsPaidByProducer.get(payableKey) ?? 0;
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.labourRecipientAccountId,
      producerId: p.id,
      kind: "labour",
      amount: Math.max(0, p.labourCost - paid.labour),
    });
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.operatingRecipientAccountId,
      producerId: p.id,
      kind: "operating",
      amount: Math.max(0, p.otherOperatingCost - paid.operating),
    });
    const closingArrears = (oldBillsRemainingByProducer.get(payableKey) ?? 0) + paid.arrears;

    finite(
      consumed + inventoryWriteOff + p.labourCost + p.otherOperatingCost,
      "production expense"
    );
    results.push({
      id: p.id,
      capacityUnits: p.capacityUnits,
      activeUnits: p.capacityUnits * p.activeFraction,
      plannedUnits: proposedById.get(p.id)!,
      producedUnits: produced,
      offeredUnits,
      soldUnits,
      deliveredUnits,
      revenue,
      purchases,
      inputsConsumed: consumed,
      inventoryWriteOff,
      labourPaid: paid.labour,
      otherOperatingPaid: paid.operating,
      labourArrears: p.labourCost - paid.labour,
      otherOperatingArrears: p.otherOperatingCost - paid.operating,
      operatingArrears: paid.arrears,
      arrearsPaid,
      closingArrears,
      profit: revenue - consumed - inventoryWriteOff - p.labourCost - p.otherOperatingCost,
      unsoldProductionCost: consumed * Math.min(1, Math.max(0, unsoldShare)),
      cashFlow: revenue - purchases - paid.labour - paid.operating - arrearsPaid,
      inputStock: [...stocks.values()],
      // A sold-out retained good (no longer in the recipe) leaves no row: next
      // turn's plan has no output for it, so an empty row would be unrecognized.
      outputStock: outputStock.filter(
        (stock, i) => stock.units > 0 || p.outputs[i].unitsPerOutput > 0
      ),
      products,
    });
  }
  const openingTotal = [...originalCash.values()].reduce((n, v) => n + v, 0);
  const closingTotal = [...closingCash.values()].reduce((n, v) => n + v, 0);
  if (
    !Number.isFinite(closingTotal) ||
    Math.abs(openingTotal - closingTotal) > Math.max(1e-7, Math.abs(openingTotal) * 1e-12)
  )
    throw new Error("Producer market cash did not reconcile");
  return {
    accounts: closingAccounts,
    payables: [...closingPayables.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    ),
    payablePayments: prior.payments,
    producers: results,
    tradeReceipt: market.tradeReceipt,
    prices: market.prices,
    ...(spillover ? { spillover } : {}),
    ...(market.countryBooks ? { countryBooks: market.countryBooks } : {}),
    orderOutcomes: (() => {
      const meta = new Map(
        [...consumerOrders, ...inputOrders()].map((o) => [
          o.id,
          { commodity: o.commodity, book: o.book, accountId: o.accountId },
        ])
      );
      return market.orders.flatMap((o) => {
        const m = meta.get(o.id);
        return m
          ? [{ ...m, requestedUnits: o.requestedUnits, deliveredUnits: o.deliveredUnits }]
          : [];
      });
    })(),
  };
}
