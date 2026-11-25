/** Feasible run segments and the input orders producers place before clearing. */
import type { ProducerEconomyInput } from "./productionTypes";
import { type PurchaseOrder, type ProducerOffer, quoteProducer } from "./rules";
import { minorInputs } from "./makeDoRules";
import { feasibleProduction } from "./productionFeasibilityRules";
import { laneKeyOf } from "./laneKey";
import { SHORTAGE_ASK_DEFAULT_MAX_MULTIPLIER, shortageAsk } from "./shortageAskRules";
import { costPlusAsk } from "@/lib/market/costPlusPricing/rules";
import { stockCover, markdownFactor, markedDownAsk } from "./stockCoverRules";
import { type AskBracket, type AskBracketReading, bracketAsk } from "./autoAskRules";
import { internalTransferUnitPrice } from "./internalTransferPricingRules";
import {
  type ProducerInputReservation,
  finite,
  type ProductionPlan,
  type CostPlusAskBasis,
  indexQuoteVolumes,
  recentSoldOf,
  quoteVolumesExcept,
} from "./productionPlan";

/** Finds a physically feasible run mix and builds the input orders for it. */
export function buildProducerInputOrders({
  plans,
  plannedById,
  input,
  countryOfProducer,
  orders,
  cash,
  inputCredit,
  offers,
}: {
  plans: ProductionPlan[];
  plannedById: Map<string, number>;
  input: ProducerEconomyInput;
  countryOfProducer: ((producerId: string) => string | undefined) | undefined;
  orders: PurchaseOrder[];
  cash: Map<string, number>;
  inputCredit: Record<string, number>;
  offers: ProducerOffer[];
}) {
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
  // Minor inputs do not limit the plan (makeDoRules.ts): a plant short of one
  // runs anyway and pays a premium for the missing units at settlement.
  const minorByPlan = new Map(
    plans.map((p) => [
      p.id,
      minorInputs(
        p.inputs.map((r) => ({ unitsPerOutput: r.unitsPerOutput, unitValue: r.maximumUnitPrice }))
      ),
    ])
  );
  // The wider economy's seller is a last resort on its lane, for buyers in its
  // own country only (withWideEconomyFallback). Plants there may plan on it;
  // every other plant is held to real supply by a second row without it.
  const wideCountries = new Map<string, Set<string>>();
  for (const offer of input.residualOffers ?? []) {
    if (input.electricityNetwork && offer.commodity === "energy") continue;
    if (!offer.countryId || !(offer.units > 0)) continue;
    const key = JSON.stringify([offer.commodity, offer.book]);
    const set = wideCountries.get(key) ?? new Set<string>();
    set.add(offer.countryId);
    wideCountries.set(key, set);
  }
  const realOnly = new Map<string, { available: number; coefficients: number[] }>();
  const realOnlyRow = (commodity: string, book: string) => {
    const key = JSON.stringify([commodity, book]);
    if (!wideCountries.has(key)) return undefined;
    let row = realOnly.get(key);
    if (!row) {
      row = { available: 0, coefficients: Array(segments.length).fill(0) };
      realOnly.set(key, row);
    }
    return row;
  };
  for (const [j, segment] of segments.entries()) {
    const minor = minorByPlan.get(segment.plan.id)!;
    const country = countryOfProducer?.(segment.plan.id);
    for (const [k, recipe] of segment.plan.inputs.entries()) {
      if (minor[k]) continue;
      const owned = segment.owned.get(recipe.commodity) ?? 0;
      const need =
        Math.max(0, segment.to * recipe.unitsPerOutput - owned) -
        Math.max(0, segment.from * recipe.unitsPerOutput - owned);
      resource(recipe.commodity, recipe.book).coefficients[j] += need;
      const own = wideCountries.get(JSON.stringify([recipe.commodity, recipe.book]));
      const row =
        country && own?.has(country) ? undefined : realOnlyRow(recipe.commodity, recipe.book);
      if (row) row.coefficients[j] += need;
    }
    for (const output of segment.plan.outputs) {
      const made = segment.units * output.unitsPerOutput;
      resource(output.commodity, output.book).coefficients[j] -= made;
      const row = realOnlyRow(output.commodity, output.book);
      if (row) row.coefficients[j] -= made;
    }
  }
  const addAvailable = (commodity: string, book: string, units: number) => {
    resource(commodity, book).available += units;
    const row = realOnlyRow(commodity, book);
    if (row) row.available += units;
  };
  for (const p of plans)
    for (const output of p.outputs)
      addAvailable(
        output.commodity,
        output.book,
        p.outputStock
          .filter((s) => s.commodity === output.commodity && s.book === output.book)
          .reduce((sum, s) => sum + s.units, 0)
      );
  for (const offer of input.externalOffers ?? [])
    addAvailable(
      offer.commodity,
      offer.book,
      Math.min(offer.units, offer.deliverableUnits ?? offer.units)
    );
  for (const offer of input.residualOffers ?? [])
    if (wideCountries.get(JSON.stringify([offer.commodity, offer.book]))?.has(offer.countryId!))
      resource(offer.commodity, offer.book).available += offer.units;
  const feasible = feasibleProduction({
    activities: segments.map((s) => ({
      id: s.id,
      value:
        s.units *
        s.plan.outputs.reduce((sum, o) => sum + o.unitsPerOutput * o.referenceUnitPrice, 0),
    })),
    constraints: [...resources.values(), ...realOnly.values()],
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
  const internalAccountingAccounts = new Set(
    plans
      .filter((p) => p.internalTransferPricing && p.internalTransferPricing.mode !== "free")
      .map((p) => p.accountId)
  );
  // Everything about a plant's input orders except the units is fixed for the
  // turn; only the units follow the plan, so the rest is worked out once.
  const inputOrderTemplates = plans.flatMap((p) =>
    p.inputs.map((recipe) => {
      const id = JSON.stringify([p.id, "input", recipe.commodity]);
      const country = countryOfProducer?.(p.id);
      return {
        p,
        recipe,
        id,
        stock: p.inputStock
          .filter((s) => s.commodity === recipe.commodity)
          .reduce((n, s) => n + s.units, 0),
        reserved: (reservations.get(id) ?? []).map((reservation) => ({
          reservation,
          reservedId: JSON.stringify([id, "reservation", reservation.id]),
        })),
        internalAccounting: internalAccountingAccounts.has(p.accountId),
        country,
      };
    })
  );
  const inputOrders = (): PurchaseOrder[] =>
    inputOrderTemplates.flatMap(
      ({ p, recipe, id, stock, reserved, internalAccounting, country }) => {
        const units = Math.max(0, plannedById.get(p.id)! * recipe.unitsPerOutput - stock);
        const quantityGroup = reserved.length ? { id, maximumUnits: units } : undefined;
        const publicOrder: PurchaseOrder = {
          id,
          ...(internalAccounting ? { internalAccountingSiteId: p.id } : {}),
          accountId: p.accountId,
          commodity: recipe.commodity,
          book: recipe.book,
          units,
          maximumUnitPrice: recipe.maximumUnitPrice,
          priority: 1,
          fairShare: true,
          eligibleOfferIds: input.eligibleOffersByOrder?.[id],
          ...(country ? { countryId: country } : {}),
          ...(p.stateId ? { stateId: p.stateId } : {}),
          ...(quantityGroup ? { quantityGroup } : {}),
        };
        return [
          publicOrder,
          ...reserved.map(({ reservation, reservedId }): PurchaseOrder => ({
            ...publicOrder,
            id: reservedId,
            units: Math.min(units, reservation.units),
            maximumUnitPrice: reservation.unitPrice,
            contractUnitPrice: reservation.unitPrice,
            supplierOfferId: reservation.supplierOfferId,
            eligibleOfferIds:
              input.eligibleOffersByOrder?.[reservedId] ?? publicOrder.eligibleOfferIds,
          })),
        ];
      }
    );
  orders.push(...inputOrders());
  const pendingQuotes: Array<{
    offer: ProducerOffer;
    internalPricing?: ProductionPlan["internalTransferPricing"];
    quote: Parameters<typeof quoteProducer>[0];
    markdown: { factor: number; reference: number };
    bracket?: { last: AskBracketReading | null };
  }> = [];
  /** Ask bracket each automatic offer was posted under, by offer id. */
  const askBrackets = new Map<string, AskBracket>();
  /** Cost-plus basis of each cost-plus offer, by offer id. */
  const costPlusAsks = new Map<string, CostPlusAskBasis>();
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
            ((cash.get(order.accountId) ?? 0) + (inputCredit[order.accountId] ?? 0)) /
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
      const recentSold = recentSoldOf(p, output.commodity, output.book);
      const lane = laneKeyOf(output.commodity, output.book);
      const lastClearingUnitPrice = input.clearingPriceByLane?.[lane];
      const priorOffer = p.recentOfferedByOutput?.[lane];
      const soldOut =
        recentSold != null &&
        recentSold > 0 &&
        stock <= recentSold * 0.01 &&
        (priorOffer == null || (priorOffer > 0 && recentSold >= priorOffer * (1 - 1e-9)));
      // A seller that sold out into a short lane anchors a step above the
      // clearing (shortageAskRules). Both quote passes read this anchor, so the
      // competitor pass cannot pull the ask back under it.
      const clearingUnitPrice =
        lastClearingUnitPrice != null && input.shortageAsk && output.policy.kind === "automatic"
          ? shortageAsk({
              clearingUnitPrice: lastClearingUnitPrice,
              referenceUnitPrice: output.referenceUnitPrice,
              pressure: input.shortageAsk.pressureByLane[lane],
              soldOut,
              // An advertising sellout at an above-market ask can exhaust the buyers
              // able to pay that premium. Raise the next ask from the market price.
              ownAskUnitPrice:
                output.commodity === "advertising" && input.shortageAsk.advertisingFromClearing
                  ? undefined
                  : p.recentAskByOutput?.[lane],
              ...(input.shortageAsk.maxStep != null ? { maxStep: input.shortageAsk.maxStep } : {}),
              ...(input.shortageAsk.maxMultiplier != null
                ? { maxMultiplier: input.shortageAsk.maxMultiplier }
                : {}),
            })
          : lastClearingUnitPrice;
      // Automatic asks follow the steady posture anchor rather than last turn's
      // clearing, so a seller cannot chase its own previous turn up and down. A
      // shortage raise above the clearing keeps its ask: the anchor would undo it.
      const postureAnchor = input.postureAnchorByLane?.[lane];
      const shortageRaised =
        clearingUnitPrice != null &&
        lastClearingUnitPrice != null &&
        clearingUnitPrice > lastClearingUnitPrice;
      const askBase =
        !shortageRaised &&
        postureAnchor != null &&
        Number.isFinite(postureAnchor) &&
        postureAnchor > 0
          ? postureAnchor
          : clearingUnitPrice;
      // Cost-plus: last run's unit cost times (1 + markup), capped at the price
      // ceiling, posted as a fixed price; no cost history asks the market.
      // Retained stock of a good no longer made prices off its recorded cost.
      const costPlusUnitCost =
        p.costPlusUnitCostByOutput?.[lane] ??
        (output.unitsPerOutput === 0 ? output.retainedUnitCost : undefined);
      const costPlus =
        output.policy.kind === "costPlus"
          ? {
              markup: output.policy.markup,
              ...costPlusAsk({
                unitCost: costPlusUnitCost,
                markup: output.policy.markup,
                marketUnitPrice: askBase ?? output.referenceUnitPrice,
                ceilingUnitPrice:
                  output.referenceUnitPrice *
                  (input.shortageAsk?.maxMultiplier ?? SHORTAGE_ASK_DEFAULT_MAX_MULTIPLIER),
              }),
            }
          : null;
      if (costPlus)
        costPlusAsks.set(JSON.stringify([p.id, "output", output.commodity]), {
          markup: costPlus.markup,
          ...(costPlus.basis === "cost" ? { unitCost: costPlusUnitCost } : {}),
          ...(costPlus.capped ? { capped: true as const } : {}),
        });
      const quoteInput = {
        policy: costPlus ? ({ kind: "manual", unitPrice: costPlus.ask } as const) : output.policy,
        referenceUnitPrice: output.referenceUnitPrice,
        ...(askBase != null ? { clearingUnitPrice: askBase } : {}),
        ...(postureAnchor != null ? { postureAnchorUnitPrice: postureAnchor } : {}),
        ...(recentSold === 0 ? { soldNothingLastTurn: true } : {}),
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
        ...(input.askBuyerTieBreak ? { buyerTieBreak: true } : {}),
        ...(input.askCompetitorsMatch ? { competitorsMatch: true } : {}),
      };
      const quote = quoteProducer({
        ...quoteInput,
        policy:
          output.policy.kind === "automatic"
            ? { kind: "manual", unitPrice: askBase ?? output.referenceUnitPrice }
            : quoteInput.policy,
      });
      const cover = recentSold != null ? stockCover(stock, recentSold) : 0;
      pendingQuotes.push({
        ...(p.internalTransferPricing ? { internalPricing: p.internalTransferPricing } : {}),
        // Automatic asks carry their bracket memory; a fixed price is the seller's own.
        ...(output.policy.kind === "automatic"
          ? { bracket: { last: p.askBracketByOutput?.[lane] ?? null } }
          : {}),
        markdown: {
          // A cost-plus ask is the seller's own price: no stock markdown.
          factor: costPlus ? 1 : markdownFactor(cover, { coverTurns: input.stockCoverTurns ?? 0 }),
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
          ...(p.stateId ? { stateId: p.stateId } : {}),
          ...(p.sellOutsideFirst ? { sellOutsideFirst: true as const } : {}),
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
    const candidatePrice = markedDownAsk(
      quote.unitPrice,
      pending.markdown.reference,
      pending.markdown.factor
    );
    // An automatic ask whose market sits between two of the levels above
    // narrows toward it instead of flipping between them (autoAskRules).
    const bracketed = pending.bracket
      ? bracketAsk({
          candidate: candidatePrice,
          last: pending.bracket.last,
          referenceUnitPrice: pending.markdown.reference,
        })
      : null;
    if (bracketed?.bracket) askBrackets.set(pending.offer.id, bracketed.bracket);
    const postedPrice = bracketed ? bracketed.ask : candidatePrice;
    const internalPrice = internalTransferUnitPrice({
      mode: pending.internalPricing?.mode,
      discount: pending.internalPricing?.discount,
      marketPrice: postedPrice,
      unitCost: quote.breakEvenUnitPrice ?? pending.quote.variableUnitCost,
    });
    offers.push({
      ...pending.offer,
      ...(internalPrice > 0 ? { internalUnitPrice: internalPrice } : {}),
      unitPrice: postedPrice,
    });
  }
  return {
    inputOrders,
    orderIdsForInput,
    internalAccountingAccounts,
    minorByPlan,
    proposedById,
    askBrackets,
    costPlusAsks,
  };
}
