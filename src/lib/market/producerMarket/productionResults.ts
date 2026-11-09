/** Turns a cleared producer market into per-producer operating results and closing accounts. */
import type { ProducerEconomyInput } from "./productionTypes";
import type { ProducerOffer, PurchaseOrder } from "./rules";
import { type ProducerPayable, accrueProducerPayable } from "./payablesRules";
import { captiveMarketValue, laneClearingPrices, ownSiteCredit } from "./captiveMarketValueRules";
import { minorInputs, minorInputShortfallCost } from "./makeDoRules";
import { deferredBillFraction } from "./salesAdvanceRules";
import { cappedStockUnitCost, writeDownUnits, stockCover } from "./stockCoverRules";
import { nextProbeFailures, probePaidForItself } from "./restartProbeRules";
import { decisionProfit } from "./internalTransferPricingRules";
import { payablesNotShrinkingSince } from "./producerCreditRules";
import {
  type ProductionPlan,
  type PurchasedStock,
  type ProducerOperatingResult,
  finite,
  recentSoldOf,
  idleUpkeep,
  type RunCutReason,
} from "./productionPlan";
import type { ProducerMarketResult } from "@/lib/market/producerMarket/rules";

/** Fills the operating results for each producer and returns the closing accounts. */
export function buildProducerOperatingResults({
  market,
  input,
  postedOffers,
  plans,
  internalAccountingAccounts,
  physicalMaximum,
  orderIdsForInput,
  payments,
  salesAdvance,
  plannedById,
  minorByPlan,
  closingPayables,
  carryLoss,
  oldBillsPaidByProducer,
  oldBillsRemainingByProducer,
  probeShare,
  results,
  proposedById,
  billedRunShare,
  shareOf,
  inputReserve,
  funding,
  creditAccounts,
  heldForPayables,
  originalCash,
  inputOrders,
}: {
  market: ProducerMarketResult;
  input: ProducerEconomyInput;
  postedOffers: Map<string, ProducerOffer>;
  plans: ProductionPlan[];
  internalAccountingAccounts: Set<string>;
  physicalMaximum: Map<string, number>;
  orderIdsForInput: (producerId: string, commodity: string) => string[];
  payments: Map<string, { labour: number; operating: number; arrears: number }>;
  salesAdvance: Map<string, number>;
  plannedById: Map<string, number>;
  minorByPlan: Map<string, boolean[]>;
  closingPayables: Map<string, ProducerPayable>;
  carryLoss: (commodity: string) => number;
  oldBillsPaidByProducer: Map<string, number>;
  oldBillsRemainingByProducer: Map<string, number>;
  probeShare: Map<string, number>;
  results: ProducerOperatingResult[];
  proposedById: Map<string, number>;
  billedRunShare: Map<string, number>;
  shareOf: (p: ProductionPlan) => number;
  inputReserve: Map<string, number>;
  funding: Map<string, number>;
  creditAccounts: Set<string>;
  heldForPayables: Map<string, number>;
  originalCash: Map<string, number>;
  inputOrders: () => PurchaseOrder[];
}) {
  const offersById = new Map(market.offers.map((o) => [o.id, o]));
  const ordersById = new Map(market.orders.map((o) => [o.id, o]));
  // Own-site deliveries at market value, for plans that opt in (never Free or priced companies).
  const captiveValue = input.captiveMarketValue
    ? captiveMarketValue({
        deliveries: market.internalDeliveries ?? [],
        offers: postedOffers,
        clearingByLane: laneClearingPrices(market.prices),
        valuedAccounts: new Set(
          plans
            .filter((p) => p.ownSiteMarketValue && !internalAccountingAccounts.has(p.accountId))
            .map((p) => p.accountId)
        ),
      })
    : null;
  // Same prices, valuation only, for accounts that book no entries of their own.
  const valuationValue = input.ownSiteValuationCredit
    ? ownSiteCredit({
        deliveries: market.internalDeliveries ?? [],
        offers: postedOffers,
        prices: market.prices,
        plans,
        pricedAccounts: internalAccountingAccounts,
        marketValueBooked: input.captiveMarketValue === true,
      })
    : null;
  // Unsold supply per book and ask, read back to name the input that cut a run.
  const unsoldByBook = new Map<string, { unitPrice: number; units: number }[]>();
  for (const offer of market.tradeReceipt.offers) {
    const settled = offersById.get(offer.id);
    const units = settled ? settled.offeredUnits - settled.deliveredUnits : 0;
    if (!(units > 0)) continue;
    const key = JSON.stringify([offer.commodity, offer.book]);
    const rows = unsoldByBook.get(key) ?? [];
    rows.push({ unitPrice: offer.unitPrice, units });
    unsoldByBook.set(key, rows);
  }
  /**
   * The scarcest input of a plant short inputs cut: the major input whose
   * stock, purchases and unsold supply within its limit price cover the least
   * of its physical maximum run. Undefined when every input could have covered it.
   */
  const bindingInputOf = (p: ProductionPlan): string | undefined => {
    const maximum = physicalMaximum.get(p.id)!;
    const minor = minorInputs(
      p.inputs.map((r) => ({ unitsPerOutput: r.unitsPerOutput, unitValue: r.maximumUnitPrice }))
    );
    let binding: string | undefined;
    let lowest = 1 - 1e-9;
    for (const [k, recipe] of p.inputs.entries()) {
      const need = maximum * recipe.unitsPerOutput;
      if (minor[k] || !(need > 0)) continue;
      const stock = p.inputStock
        .filter((s) => s.commodity === recipe.commodity)
        .reduce((n, s) => n + s.units, 0);
      const bought = orderIdsForInput(p.id, recipe.commodity).reduce(
        (sum, id) => sum + (ordersById.get(id)?.deliveredUnits ?? 0),
        0
      );
      const spare = (unsoldByBook.get(JSON.stringify([recipe.commodity, recipe.book])) ?? [])
        .filter((row) => row.unitPrice <= recipe.maximumUnitPrice)
        .reduce((sum, row) => sum + row.units, 0);
      const cover = (stock + bought + spare) / need;
      if (cover < lowest) {
        lowest = cover;
        binding = recipe.commodity;
      }
    }
    return binding;
  };
  // The run's sales pay the wages and site bills it deferred, pro rata, before
  // close; what they cannot cover stays owed as an ordinary payable.
  const settledCash = new Map(market.accounts.map((a) => [a.id, a.cash]));
  const unpaidBills = (p: ProductionPlan) => {
    const paid = payments.get(p.id)!;
    return (
      Math.max(0, p.labourCost - paid.labour) + Math.max(0, p.otherOperatingCost - paid.operating)
    );
  };
  for (const id of salesAdvance.keys()) {
    // Read after the input true-up, which already forgave the unmade share.
    const deferred = plans.reduce((sum, p) => (p.accountId === id ? sum + unpaidBills(p) : sum), 0);
    const fraction = deferredBillFraction(settledCash.get(id) ?? 0, deferred);
    if (!(fraction > 0)) continue;
    for (const p of plans) {
      if (p.accountId !== id) continue;
      const paid = payments.get(p.id)!;
      const labour = Math.max(0, p.labourCost - paid.labour) * fraction;
      const operating = Math.max(0, p.otherOperatingCost - paid.operating) * fraction;
      if (!(labour + operating > 0)) continue;
      settledCash.set(id, settledCash.get(id)! - labour - operating);
      settledCash.set(
        p.labourRecipientAccountId,
        settledCash.get(p.labourRecipientAccountId)! + labour
      );
      settledCash.set(
        p.operatingRecipientAccountId,
        settledCash.get(p.operatingRecipientAccountId)! + operating
      );
      payments.set(p.id, {
        labour: paid.labour + labour,
        operating: paid.operating + operating,
        arrears: Math.max(0, paid.arrears - labour - operating),
      });
    }
    // Float noise from the pro rata split must not leave a sliver below zero.
    if (settledCash.get(id)! < 0) settledCash.set(id, 0);
  }
  for (const value of settledCash.values())
    if (!(value >= 0)) throw new Error("Producer closed below zero after its sales advance");
  // Free cash after the deferred bills are settled; minor-input premiums are
  // paid from it below, and closing balances are read from it at the end.
  const freeCash = settledCash;
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
    let internalSupplyCharge = 0;
    let valuationCharge = 0;
    for (const recipe of p.inputs) {
      const bought = orderIdsForInput(p.id, recipe.commodity).reduce(
        (total, id) => {
          const order = ordersById.get(id)!;
          return {
            deliveredUnits: total.deliveredUnits + order.deliveredUnits,
            cost: total.cost + order.cost,
            internalCost:
              total.internalCost +
              (order.internalCost ?? 0) +
              (captiveValue?.chargeByOrder.get(id) ?? 0),
          };
        },
        { deliveredUnits: 0, cost: 0, internalCost: 0 }
      );
      const stock = stocks.get(recipe.commodity) ?? {
        commodity: recipe.commodity,
        units: 0,
        value: 0,
      };
      stock.units += bought.deliveredUnits;
      stock.value += bought.cost;
      purchases += bought.cost;
      internalSupplyCharge += bought.internalCost;
      for (const id of orderIdsForInput(p.id, recipe.commodity))
        valuationCharge += valuationValue?.chargeByOrder.get(id) ?? 0;
      stocks.set(recipe.commodity, stock);
    }
    // Make do: the plant produces its settled plan and uses up to what it has
    // of each input; a short input is used up rather than limiting output.
    const produced = plannedById.get(p.id)!;
    let consumed = 0;
    // A minor input the plant ran without is improvised at a premium, paid to
    // the site's operating payee (makeDoRules.ts). Unpaid premium is owed.
    let minorInputPremium = 0;
    const minor = minorByPlan.get(p.id)!;
    for (const [k, recipe] of p.inputs.entries()) {
      const stock = stocks.get(recipe.commodity)!;
      if (minor[k] && p.operatingRecipientAccountId !== p.accountId)
        minorInputPremium += minorInputShortfallCost({
          produced,
          unitsPerOutput: recipe.unitsPerOutput,
          available: stock.units,
          maximumUnitPrice: recipe.maximumUnitPrice,
        });
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
    const premiumPaid = Math.min(minorInputPremium, Math.max(0, freeCash.get(p.accountId) ?? 0));
    if (premiumPaid > 0) {
      freeCash.set(p.accountId, freeCash.get(p.accountId)! - premiumPaid);
      freeCash.set(
        p.operatingRecipientAccountId,
        (freeCash.get(p.operatingRecipientAccountId) ?? 0) + premiumPaid
      );
    }
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.operatingRecipientAccountId,
      producerId: p.id,
      kind: "operating",
      amount: Math.max(0, minorInputPremium - premiumPaid),
    });
    let inventoryWriteOff = 0;
    for (const stock of stocks.values()) {
      const loss = carryLoss(stock.commodity);
      inventoryWriteOff += stock.value * loss;
      stock.units *= 1 - loss;
      stock.value *= 1 - loss;
    }
    let internalSupplyIncome = 0;
    let valuationCredit = 0;
    let revenue = 0,
      offeredUnits = 0,
      soldUnits = 0,
      deliveredUnits = 0,
      // Value-weighted share of this turn's output that went to stock unsold and stayed there.
      unsoldShare = 0;
    const products: ProducerOperatingResult["products"] = [];
    const outputStock = p.outputs.map((output) => {
      const sold = offersById.get(JSON.stringify([p.id, "output", output.commodity]))!;
      const marketValue = captiveValue?.incomeByOffer.get(sold.id) ?? 0;
      revenue += sold.revenue;
      internalSupplyIncome += (sold.internalValue ?? 0) + marketValue;
      valuationCredit += valuationValue?.incomeByOffer.get(sold.id) ?? 0;
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
      // Preserve an unknown historical cost as unknown. A reference price or
      // this turn's fixed bill cannot manufacture the old stock's cost basis.
      const knownOpeningCost = openingRows.every((stock) => stock.quoteUnitCost != null);
      const quoteUnitCost =
        available > 0 && knownOpeningCost && (made === 0 || outputValue > 0)
          ? cappedStockUnitCost(
              finite(
                (openingRows.reduce((sum, stock) => sum + stock.units * stock.quoteUnitCost!, 0) +
                  (made > 0
                    ? (consumed + minorInputPremium + p.labourCost + p.otherOperatingCost) * weight
                    : 0)) /
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
      // Only this turn's output that is still in stock at close counts as stock
      // at cost. Unsold output of a good that cannot be stored, and units
      // written down or lost in carry, left the books: they are a loss, not stock.
      if (made > 0 && unsold > 0)
        unsoldShare += (weight * Math.max(0, made - sold.deliveredUnits) * (kept / unsold)) / made;
      // The written-down units leave stock without a second charge: their
      // production cost was expensed in `consumed`, labour and site bills on the
      // turn they were made, and finished stock is not capitalized.
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
        ...(marketValue > 0 && sold.internalDeliveredUnits > 0
          ? { captiveUnitValue: marketValue / sold.internalDeliveredUnits }
          : {}),
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
      consumed + minorInputPremium + inventoryWriteOff + p.labourCost + p.otherOperatingCost,
      "production expense"
    );
    // A probe that did not pay for itself counts toward its stop; one that
    // paid, or any run that paid, clears the count.
    const probeFields = (() => {
      if (!input.restartProbes) return {};
      const probed = probeShare.has(p.id);
      const failures = nextProbeFailures({
        priorFailures: p.restartProbeFailures,
        probed,
        // At market-valued own-site deliveries, a probe judged on its management
        // account: output its own company took counts as sold (decisionProfit).
        paid: probePaidForItself({
          revenue: revenue + (input.captiveMarketValue ? internalSupplyIncome : 0),
          profit: decisionProfit(
            {
              profit:
                revenue -
                consumed -
                minorInputPremium -
                inventoryWriteOff -
                p.labourCost -
                p.otherOperatingCost,
              internalSupplyIncome,
              internalSupplyCharge,
            },
            input.captiveMarketValue === true
          ),
          idleOperatingCost: idleUpkeep(p),
        }),
      });
      return {
        ...(probed ? { restartProbe: true } : {}),
        ...(failures > 0 ? { restartProbeFailures: failures } : {}),
      };
    })();
    results.push({
      id: p.id,
      ...(internalSupplyIncome > 0 ? { internalSupplyIncome } : {}),
      ...(internalSupplyCharge > 0 ? { internalSupplyCharge } : {}),
      ...(valuationCredit > 0 ? { valuationCredit } : {}),
      ...(valuationCharge > 0 ? { valuationCharge } : {}),
      capacityUnits: p.capacityUnits,
      activeUnits: p.capacityUnits * p.activeFraction,
      plannedUnits: proposedById.get(p.id)!,
      ...(p.plannedRunShare != null ? { plannedRunShare: p.plannedRunShare } : {}),
      ...(p.priorGlutTurns != null ? { priorGlutTurns: p.priorGlutTurns } : {}),
      ...probeFields,
      ...(billedRunShare.has(p.id) ? { billedRunShare: billedRunShare.get(p.id)! } : {}),
      ...(() => {
        const binding = billedRunShare.has(p.id) ? bindingInputOf(p) : undefined;
        return binding ? { bindingInput: binding } : {};
      })(),
      ...(() => {
        const reasons: RunCutReason[] = [];
        if (
          shareOf(p) < 1 - 1e-12 ||
          (!inputReserve.has(p.accountId) &&
            !salesAdvance.has(p.accountId) &&
            (funding.get(p.accountId) ?? 1) < 1 - 1e-12)
        )
          reasons.push("cash");
        if (billedRunShare.has(p.id)) reasons.push("inputs");
        return reasons.length > 0 ? { runCutBy: reasons } : {};
      })(),
      ...(p.idleOperatingCost != null
        ? { idleOperatingCost: Math.min(p.otherOperatingCost, Math.max(0, p.idleOperatingCost)) }
        : {}),
      producedUnits: produced,
      offeredUnits,
      soldUnits,
      deliveredUnits,
      revenue,
      purchases,
      inputsConsumed: consumed,
      ...(minorInputPremium > 0 ? { minorInputPremium } : {}),
      inventoryWriteOff,
      labourPaid: paid.labour,
      otherOperatingPaid: paid.operating,
      labourArrears: p.labourCost - paid.labour,
      otherOperatingArrears: p.otherOperatingCost - paid.operating,
      operatingArrears: paid.arrears,
      arrearsPaid,
      closingArrears,
      profit:
        revenue -
        consumed -
        minorInputPremium -
        inventoryWriteOff -
        p.labourCost -
        p.otherOperatingCost,
      unsoldProductionCost: consumed * Math.min(1, Math.max(0, unsoldShare)),
      cashFlow: revenue - purchases - paid.labour - paid.operating - premiumPaid - arrearsPaid,
      inputStock: [...stocks.values()],
      // A sold-out retained good (no longer in the recipe) leaves no row: next
      // turn's plan has no output for it, so an empty row would be unrecognized.
      outputStock: outputStock.filter(
        (stock, i) => stock.units > 0 || p.outputs[i].unitsPerOutput > 0
      ),
      products,
    });
  }
  if (creditAccounts.size > 0) {
    const owedAt = (claims: Iterable<ProducerPayable>) => {
      const owed = new Map<string, number>();
      for (const c of claims)
        owed.set(c.debtorAccountId, (owed.get(c.debtorAccountId) ?? 0) + c.amount);
      return owed;
    };
    const opening = owedAt(input.payables ?? []);
    const closing = owedAt(closingPayables.values());
    const priorSince = new Map<string, number>();
    for (const c of input.payables ?? [])
      if (c.notShrinkingSince != null)
        priorSince.set(
          c.debtorAccountId,
          Math.min(priorSince.get(c.debtorAccountId) ?? c.notShrinkingSince, c.notShrinkingSince)
        );
    for (const [id, claim] of closingPayables)
      if (creditAccounts.has(claim.debtorAccountId))
        closingPayables.set(id, {
          ...claim,
          notShrinkingSince: payablesNotShrinkingSince({
            turn: input.turn,
            openingOwed: opening.get(claim.debtorAccountId) ?? 0,
            closingOwed: closing.get(claim.debtorAccountId) ?? 0,
            priorSince: priorSince.get(claim.debtorAccountId),
          }),
        });
  }
  const closingAccounts = market.accounts.map((account) => ({
    ...account,
    cash: (freeCash.get(account.id) ?? account.cash) + (heldForPayables.get(account.id) ?? 0),
  }));
  const closingCash = new Map(closingAccounts.map((a) => [a.id, a.cash]));
  const openingTotal = [...originalCash.values()].reduce((n, v) => n + v, 0);
  const closingTotal = [...closingCash.values()].reduce((n, v) => n + v, 0);
  if (
    !Number.isFinite(closingTotal) ||
    Math.abs(openingTotal - closingTotal) > Math.max(1e-7, Math.abs(openingTotal) * 1e-12)
  )
    throw new Error("Producer market cash did not reconcile");
  // What the company's own sites asked for each good, shared across its plants
  // of that good by active capacity: the next run plan reads it so a plant that
  // supplies its own company ramps toward that demand (captiveDeliveryRules).
  {
    const settledById = new Map(market.orders.map((o) => [o.id, o]));
    const asked = new Map<string, { units: number; bySite: Map<string, number> }>();
    for (const p of plans)
      for (const recipe of p.inputs) {
        const o = settledById.get(JSON.stringify([p.id, "input", recipe.commodity]));
        if (!o || !(o.requestedUnits > 0)) continue;
        const key = p.accountId + "|" + recipe.commodity;
        const row = asked.get(key) ?? { units: 0, bySite: new Map<string, number>() };
        row.units += o.requestedUnits;
        row.bySite.set(p.id, (row.bySite.get(p.id) ?? 0) + o.requestedUnits);
        asked.set(key, row);
      }
    if (asked.size > 0) {
      const resultById = new Map(results.map((x) => [x.id, x]));
      const weight = new Map<string, number>();
      const weightOf = (p: (typeof plans)[number], commodity: string) =>
        p.outputs
          .filter((o) => o.commodity === commodity)
          .reduce((n, o) => n + o.unitsPerOutput, 0) * (resultById.get(p.id)?.activeUnits ?? 0);
      for (const p of plans)
        for (const commodity of new Set(p.outputs.map((o) => o.commodity))) {
          const key = p.accountId + "|" + commodity;
          if (!asked.has(key)) continue;
          weight.set(key, (weight.get(key) ?? 0) + weightOf(p, commodity));
        }
      for (const p of plans) {
        const r = resultById.get(p.id);
        if (!r) continue;
        const seen = new Set<string>();
        for (const product of r.products) {
          // One share per good, on its first row, so a good on two books is not counted twice.
          if (seen.has(product.commodity)) continue;
          seen.add(product.commodity);
          const key = p.accountId + "|" + product.commodity;
          const row = asked.get(key);
          const total = weight.get(key) ?? 0;
          if (!row || !(total > 0)) continue;
          // A site's own input order for a good it makes is not demand on itself.
          const others = row.units - (row.bySite.get(p.id) ?? 0);
          const units = (others * weightOf(p, product.commodity)) / total;
          if (units > 0) product.ownSiteDemandUnits = units;
        }
      }
    }
  }
  // A company whose own sites were cut short by a good it also makes values what
  // its plants sent them at what those sites bid (capped at the reference, never
  // under the ask), not at a market price below its cost
  // (captiveDeliveryRules, producerCaptiveDeliveryStage >= 2).
  if (input.captiveShortValue) {
    const resultById = new Map(results.map((x) => [x.id, x]));
    const shortBid = new Map<string, number>();
    const markShort = (accountId: string, commodity: string, bid: number) => {
      const key = accountId + "|" + commodity;
      shortBid.set(key, Math.max(shortBid.get(key) ?? 0, bid));
    };
    // Short by the order: an own input order the book left partly unfilled.
    const settledOrders = new Map(market.orders.map((o) => [o.id, o]));
    for (const order of inputOrders()) {
      const o = settledOrders.get(order.id);
      if (o && o.requestedUnits > o.deliveredUnits * (1 + 1e-9) + 1e-9)
        markShort(order.accountId, order.commodity, order.maximumUnitPrice);
    }
    for (const p of plans) {
      const r = resultById.get(p.id);
      if (!r?.runCutBy?.includes("inputs") || !r.bindingInput) continue;
      // Short by the run: the input cut what the site could make before it ordered.
      const recipe = p.inputs.find((i) => i.commodity === r.bindingInput);
      if (!recipe) continue;
      markShort(p.accountId, recipe.commodity, recipe.maximumUnitPrice);
    }
    if (shortBid.size > 0)
      for (const p of plans) {
        const r = resultById.get(p.id);
        if (!r) continue;
        for (const product of r.products) {
          const bid = shortBid.get(p.accountId + "|" + product.commodity);
          const output = p.outputs.find((o) => o.commodity === product.commodity);
          if (bid == null || !output || !(product.internalDeliveredUnits > 0)) continue;
          product.captiveUnitValue = Math.max(
            product.askingUnitPrice,
            Math.min(bid, output.referenceUnitPrice)
          );
        }
      }
  }
  return { closingAccounts };
}
