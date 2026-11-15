import { productionOrderOutcomes } from "./productionOrderOutcomes";
import { settleProducerMarket, type ProducerOffer } from "./rules";
import { settlePriorProducerPayables } from "./payablesRules";
import { creditRunShare, producerCreditHeadroom } from "./producerCreditRules";
import { COMMODITY_SPOILAGE_PER_TURN } from "../inventory";
import { householdPurchaseOrders } from "./householdRules";
import { makeDoOutput } from "./makeDoRules";
import type {
  ProducerEconomyInput,
  ProducerEconomyResult,
  ProducerPlanningExecution,
} from "./productionTypes";
import {
  producerPlanningSiteChange,
  producerPlanningStop,
  type ProducerPlanningDiagnostics,
} from "./planningRules";
import { spilloverOrders } from "./spilloverRules";
import { laneKeyOf } from "./laneKey";
import { householdSpendBase } from "./householdSpendRules";
import {
  expectedInputUnitPrice,
  salesAdvanceAmount,
  salesFundedRunShare,
} from "./salesAdvanceRules";
import { restartProbe, RESTART_PROBE_RUN_SHARE } from "./restartProbeRules";
import { addStageTiming, listStageTiming, stageClock, type StageTimings } from "./stageTimings";
import { landedPriceGate } from "./tariffRules";
import { buildProducerInputOrders } from "./productionInputOrders";
import { buildProducerOperatingResults } from "./productionResults";
import {
  type ProductionPlan,
  idleUpkeep,
  producerRunBudget,
  type ProducerOperatingResult,
  finite,
} from "./productionPlan";
export {
  idleUpkeep,
  producerRunBudget,
  finite,
  indexQuoteVolumes,
  quoteVolumesExcept,
  recentSoldOf,
  type PurchasedStock,
  type ProducedStock,
  type ProductionPlan,
  type RunCutReason,
  type ProducerInputReservation,
  type ProducerOperatingResult,
} from "./productionPlan";

export function advanceProducerEconomy(
  input: ProducerEconomyInput,
  execution?: ProducerPlanningExecution,
  timings?: StageTimings
): ProducerEconomyResult {
  const clock = stageClock(timings);
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
  // Wages and site bills a company chose to owe this turn on its credit line.
  // They are paid from later turns' cash, so they do not claim the cash it
  // keeps for the inputs of the run they staff.
  const creditDrawn = new Map<string, number>();
  const reserveUnpaidCash = () => {
    for (const [id, due] of pendingDueByAccount) {
      const held = heldForPayables.get(id) ?? 0;
      const added = Math.min(cash.get(id)!, Math.max(0, due - held - (creditDrawn.get(id) ?? 0)));
      cash.set(id, cash.get(id)! - added);
      heldForPayables.set(id, held + added);
    }
  };
  reserveUnpaidCash();
  const payments = new Map<string, { labour: number; operating: number; arrears: number }>();
  const offers: ProducerOffer[] = [...(input.externalOffers ?? [])];
  let plans = [...input.producers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
    if (p.expectedUnitRevenue != null) finite(p.expectedUnitRevenue, "expected unit revenue");
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
  // Budget the run, not just the payroll. Cold upkeep on the sites is the
  // fixed cost of owning plants and is paid first. Wages, the running part of
  // the site bill and inputs scale with the share of the plants the remaining
  // cash can staff and supply (inputs at the bid ceiling), so a company short
  // of cash runs smaller instead of paying every wage with nothing left for
  // materials, and owes no wages or running costs for a run that never happened.
  const { fixedBills, variableNeed } = producerRunBudget(plans);
  // The same run with inputs at what they are expected to cost, for the sales
  // advance: a run that pays for itself at market prices is not held to its
  // opening cash because the bid ceiling is several times the market.
  const expectedNeed = input.salesAdvanceAtClearing
    ? producerRunBudget(plans, (recipe) =>
        expectedInputUnitPrice(
          recipe.maximumUnitPrice,
          input.clearingPriceByLane?.[laneKeyOf(recipe.commodity, recipe.book)]
        )
      ).variableNeed
    : undefined;
  // A private company on the credit line may run past its cash: it buys the
  // inputs with cash and owes the wages and site bills it cannot cover, up to
  // its headroom (producerCreditRules). `inputReserve` is the cash kept back
  // for those inputs; only companies that actually draw credit get one.
  const creditAccounts = new Set(input.credit?.accountIds ?? []);
  // Wages plus site running costs at a full run: the bills a company may owe.
  const fullRunningBills = new Map<string, number>();
  // What a full run is expected to earn, for the sales advance (salesAdvanceRules).
  const expectedRevenue = new Map<string, number>();
  for (const p of plans) {
    fullRunningBills.set(
      p.accountId,
      (fullRunningBills.get(p.accountId) ?? 0) + p.labourCost + p.otherOperatingCost - idleUpkeep(p)
    );
    if ((p.expectedUnitRevenue ?? 0) > 0)
      expectedRevenue.set(
        p.accountId,
        (expectedRevenue.get(p.accountId) ?? 0) +
          p.capacityUnits * p.activeFraction * p.outputMultiplier * p.expectedUnitRevenue!
      );
  }
  const notShrinkingSince = new Map<string, number>();
  for (const claim of prior.payables)
    if (claim.notShrinkingSince != null)
      notShrinkingSince.set(
        claim.debtorAccountId,
        Math.min(
          notShrinkingSince.get(claim.debtorAccountId) ?? claim.notShrinkingSince,
          claim.notShrinkingSince
        )
      );
  const inputReserve = new Map<string, number>();
  // Cash a company borrows against this turn's own sales to fund its run.
  const salesAdvance = new Map<string, number>();
  const runShare = new Map(
    [...bills.keys()].map((id) => {
      const need = variableNeed.get(id) ?? 0;
      const free = Math.max(0, cash.get(id)! - (fixedBills.get(id) ?? 0));
      const cashOnly = need > 0 ? Math.min(1, free / need) : 1;
      if (cashOnly >= 1) return [id, cashOnly];
      // Sales fund the run: a run that earns more than it costs is not held
      // back by the cash the company happens to hold at the open.
      const salesFunded = Math.max(
        cashOnly,
        salesFundedRunShare({
          free,
          need,
          expectedRevenue: expectedRevenue.get(id) ?? 0,
          revenueShare: input.salesAdvanceRevenueShare,
          ...(expectedNeed ? { expectedNeed: expectedNeed.get(id) ?? need } : {}),
        })
      );
      const advance = () => {
        const amount = salesAdvanceAmount({
          free,
          need,
          runShare: salesFunded,
          revenueShare: input.salesAdvanceRevenueShare,
          ...(expectedNeed ? { expectedRevenue: expectedRevenue.get(id) ?? 0 } : {}),
        });
        if (salesFunded > cashOnly * (1 + 1e-12) + 1e-15 && amount > 0)
          salesAdvance.set(id, amount);
        return [id, salesFunded] as const;
      };
      if (!creditAccounts.has(id) || salesFunded >= 1) return advance();
      const labour = fullRunningBills.get(id) ?? 0;
      const inputs = Math.max(0, need - labour);
      const share = creditRunShare({
        cash: cash.get(id)!,
        fixedBills: fixedBills.get(id) ?? 0,
        labour,
        inputs,
        headroom: producerCreditHeadroom({
          turn: input.turn,
          billsAtFullRun: (fixedBills.get(id) ?? 0) + labour,
          outstanding: pendingDueByAccount.get(id) ?? 0,
          notShrinkingSince: notShrinkingSince.get(id),
          runTurns: input.credit?.runTurns,
          stuckTurns: input.credit?.stuckTurns,
        }),
      });
      if (!(share > salesFunded * (1 + 1e-12) + 1e-15)) return advance();
      if (share > cashOnly * (1 + 1e-12) + 1e-15) inputReserve.set(id, inputs * share);
      return [id, share] as const;
    })
  );
  // Restart probes: a plant of a company that cannot fund even a probe-sized
  // run, with no sales last turn to borrow against, may run a small share of
  // its capacity on credit against its output's market price, when other
  // buyers have funded demand for it there and the probe pays for itself.
  const probeShare = new Map<string, number>();
  if (input.restartProbes) {
    const candidates = plans.filter((p) => {
      const share = runShare.get(p.accountId) ?? 1;
      return (
        share < RESTART_PROBE_RUN_SHARE &&
        !inputReserve.has(p.accountId) &&
        !((p.expectedUnitRevenue ?? 0) > 0) &&
        p.capacityUnits * p.activeFraction * p.outputMultiplier > 0
      );
    });
    if (candidates.length > 0) {
      // Highest funded bid per lane and buyer at the open: public and other
      // outside orders, household baskets, and the inputs of other plants.
      const bids = new Map<string, Map<string, number>>();
      const bid = (lane: string, accountId: string, price: number) => {
        if (!((cash.get(accountId) ?? 0) > 0) || !(price > 0)) return;
        const row = bids.get(lane) ?? new Map<string, number>();
        row.set(accountId, Math.max(row.get(accountId) ?? 0, price));
        bids.set(lane, row);
      };
      for (const o of input.externalOrders ?? [])
        if (o.units > 0) bid(laneKeyOf(o.commodity, o.book), o.accountId, o.maximumUnitPrice);
      for (const h of input.households ?? [])
        if (h.spendFraction > 0)
          for (const product of h.products)
            if (product.weight > 0)
              bid(
                laneKeyOf(product.commodity, product.book),
                h.accountId,
                product.maximumUnitPrice
              );
      for (const p of plans)
        if (p.capacityUnits * p.activeFraction * p.outputMultiplier > 0)
          for (const recipe of p.inputs)
            if (recipe.unitsPerOutput > 0)
              bid(laneKeyOf(recipe.commodity, recipe.book), p.accountId, recipe.maximumUnitPrice);
      const fundedBuyers = (lane: string, ownAccount: string, price: number) => {
        for (const [accountId, top] of bids.get(lane) ?? [])
          if (accountId !== ownAccount && top >= price) return true;
        return false;
      };
      for (const p of candidates) {
        const outputs = p.outputs.map((o) => {
          const lane = laneKeyOf(o.commodity, o.book);
          const marketUnitPrice = input.clearingPriceByLane?.[lane];
          return {
            unitsPerOutput: o.unitsPerOutput,
            ...(marketUnitPrice != null ? { marketUnitPrice } : {}),
            fundedBuyers:
              marketUnitPrice != null &&
              marketUnitPrice > 0 &&
              fundedBuyers(lane, p.accountId, marketUnitPrice),
          };
        });
        const probe = restartProbe({
          fullUnits: p.capacityUnits * p.activeFraction * p.outputMultiplier,
          labourCost: p.labourCost,
          runningSiteCost: p.otherOperatingCost - idleUpkeep(p),
          inputs: p.inputs.map((recipe) => {
            const clearingUnitPrice =
              input.clearingPriceByLane?.[laneKeyOf(recipe.commodity, recipe.book)];
            return {
              unitsPerOutput: recipe.unitsPerOutput,
              maximumUnitPrice: recipe.maximumUnitPrice,
              ...(clearingUnitPrice != null ? { clearingUnitPrice } : {}),
              stockUnits: p.inputStock
                .filter((s) => s.commodity === recipe.commodity)
                .reduce((n, s) => n + s.units, 0),
            };
          }),
          outputs,
          priorFailures: p.restartProbeFailures,
        });
        if (!probe) continue;
        probeShare.set(p.id, probe.runShare);
        salesAdvance.set(p.accountId, (salesAdvance.get(p.accountId) ?? 0) + probe.advance);
      }
    }
  }
  const shareOf = (p: ProductionPlan) => probeShare.get(p.id) ?? runShare.get(p.accountId) ?? 1;
  // Wages and site running costs follow the run the company can fund; idle
  // capacity keeps its cold upkeep.
  plans = plans.map((p) => {
    const share = shareOf(p);
    if (share >= 1) return p;
    const idle = idleUpkeep(p);
    return {
      ...p,
      labourCost: p.labourCost * share,
      otherOperatingCost: idle + (p.otherOperatingCost - idle) * share,
    };
  });
  bills.clear();
  for (const p of plans)
    bills.set(p.accountId, (bills.get(p.accountId) ?? 0) + p.labourCost + p.otherOperatingCost);
  const funding = new Map(
    [...bills].map(([id, bill]) => {
      const payable = Math.max(0, cash.get(id)! - (inputReserve.get(id) ?? 0));
      return [id, bill > 0 ? Math.min(1, payable / bill) : 1];
    })
  );
  // Wages and site bills a sales-advance company could not pay from cash at
  // the open. Its sales pay them before close; what they cannot stays owed.
  const deferredBills = new Map<string, number>();
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
    const owed = Math.max(0, p.labourCost - labour) + Math.max(0, p.otherOperatingCost - operating);
    pendingDueByAccount.set(p.accountId, (pendingDueByAccount.get(p.accountId) ?? 0) + owed);
    if (inputReserve.has(p.accountId) || salesAdvance.has(p.accountId))
      creditDrawn.set(p.accountId, (creditDrawn.get(p.accountId) ?? 0) + owed);
    if (salesAdvance.has(p.accountId))
      deferredBills.set(p.accountId, (deferredBills.get(p.accountId) ?? 0) + owed);
    payments.set(p.id, {
      labour,
      operating,
      arrears: Math.max(0, p.labourCost - labour) + Math.max(0, p.otherOperatingCost - operating),
    });
  }
  // Paid wages are actual income, not an invented household demand multiplier.
  for (const [id, amount] of credits) cash.set(id, cash.get(id)! + amount);
  reserveUnpaidCash();
  // The rest of the advance buys inputs on intra-turn credit, settled from the
  // run's sales in the clearing. A company whose sales fall short has its line
  // cut until it closes with cash (settleWithinCredit), never below zero.
  const inputCredit: Record<string, number> = {};
  for (const [id, amount] of salesAdvance) {
    const line = Math.max(0, amount - (deferredBills.get(id) ?? 0));
    if (line > 0) inputCredit[id] = line;
  }
  // The cash a household's basket budget is read from (householdSpendRules).
  const householdBudgetCash = (household: { accountId: string; spendFraction: number }) => {
    const held = cash.get(household.accountId)!;
    return input.householdIncomeSpend
      ? householdSpendBase({
          cash: held,
          income: credits.get(household.accountId) ?? 0,
          spendFraction: household.spendFraction,
          savingsDrawShare: input.householdIncomeSpend.savingsDrawShare,
        })
      : held;
  };
  const householdIds = new Set<string>();
  let consumerOrders = [...(input.externalOrders ?? [])];
  for (const household of input.households ?? []) {
    if (householdIds.has(household.accountId) || !cash.has(household.accountId))
      throw new Error("Duplicate or unknown household wallet");
    householdIds.add(household.accountId);
    consumerOrders.push(
      ...householdPurchaseOrders({ ...household, cash: householdBudgetCash(household) })
    );
  }
  const orders = [...consumerOrders];
  const originalCash = new Map(input.accounts.map((a) => [a.id, a.cash]));
  const plannedById = new Map(
    plans.map((p) => [
      p.id,
      p.capacityUnits *
        p.activeFraction *
        p.outputMultiplier *
        shareOf(p) *
        // A run on credit or on its own sales is fully staffed: what cash did
        // not pay is owed until the sales pay it.
        (inputReserve.has(p.accountId) || salesAdvance.has(p.accountId)
          ? 1
          : (funding.get(p.accountId) ?? 1)),
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
  const { inputOrders, orderIdsForInput, internalAccountingAccounts, minorByPlan, proposedById } =
    buildProducerInputOrders({
      plans,
      plannedById,
      input,
      countryOfProducer,
      orders,
      cash,
      inputCredit,
      offers,
    });
  const postedOffers = new Map(offers.map((o) => [o.id, o]));
  // Posted prices are fixed from here, so one landed-price gate serves every pass.
  const landedGate = input.importTariffs ? landedPriceGate(offers, input.importTariffs) : null;
  // Units each household order gained from spillover; measurement only.
  let spilloverUnits = new Map<string, number>();
  let trialRuns = 0; // timing only
  const trial = (track = false) => {
    trialRuns++;
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
      checkBudget: execution?.checkBudget,
      turn: input.turn,
      accounts: [...cash].map(([id, value]) => ({ id, cash: value })),
      offers: proposedOffers,
      orders: landedGate
        ? landedGate([...consumerOrders, ...inputOrders()])
        : [...consumerOrders, ...inputOrders()],
      ...(track ? { trackCountryBooks: true } : {}),
      ...(track && spilloverUnits.size > 0 ? { spilloverUnitsByOrder: spilloverUnits } : {}),
      ...(Object.keys(inputCredit).length > 0 ? { credit: { ...inputCredit } } : {}),
      ...(input.ownSitesFirst ? { ownSitesFirst: true } : {}),
      ...(input.marketFirstAccounts?.length
        ? { marketFirstAccounts: input.marketFirstAccounts }
        : {}),
      ...(input.captiveMarketValue || input.ownSiteValuationCredit
        ? { trackInternalDeliveries: true }
        : {}),
    });
  };
  // Cut the input line of every company whose sales did not cover what it
  // bought on it; true when any line changed.
  const cutShortCredit = (settled: ReturnType<typeof settleProducerMarket>) => {
    let cut = false;
    for (const account of settled.accounts) {
      const line = inputCredit[account.id];
      if (line == null || !(account.cash < 0)) continue;
      const next = Math.max(0, line + account.cash * (1 + 1e-9) - 1e-9);
      if (next > 0) inputCredit[account.id] = next;
      else delete inputCredit[account.id];
      cut = true;
    }
    return cut;
  };
  // Settle at the current plan with every company closing on cash: a line its
  // sales did not cover is cut and the clearing repeated. Without credit no
  // buyer can spend past its cash, so the last resort always closes.
  const settleWithinCredit = (track = false) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const settled = trial(track);
      if (!cutShortCredit(settled)) return settled;
    }
    for (const id of Object.keys(inputCredit)) delete inputCredit[id];
    return trial(track);
  };
  let market: ReturnType<typeof settleProducerMarket> | undefined;
  const passes = input.maximumPlanningPasses ?? 128;
  if (!Number.isSafeInteger(passes) || passes < 1 || passes > 1024)
    throw new Error("Invalid planning-pass limit");
  if (execution && (!Number.isFinite(execution.maximumElapsedMs) || execution.maximumElapsedMs < 0))
    throw new Error("Invalid planning runtime budget");
  const planning: ProducerPlanningDiagnostics = {
    passes: 0,
    maximumPasses: passes,
    converged: false,
    stopReason: "pass_limit",
    siteChanges: [],
  };
  const referenceUnitValues = new Map(
    plans.map((p) => [
      p.id,
      p.outputs.reduce((sum, output) => sum + output.unitsPerOutput * output.referenceUnitPrice, 0),
    ])
  );
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
  clock.lap("economySetupMs");
  for (let pass = 0; pass < passes; pass++) {
    const passStarted = performance.now();
    market = trial();
    clock.lap("planningTrialMs");
    const bought = new Map(market.orders.map((o) => [o.id, o.deliveredUnits]));
    let changed = cutShortCredit(market);
    planning.siteChanges = [];
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
      const siteChange = producerPlanningSiteChange(
        p.id,
        previous,
        next,
        referenceUnitValues.get(p.id)!
      );
      if (siteChange) {
        changed = true;
        planning.siteChanges.push(siteChange);
      }
      plannedById.set(p.id, Math.max(0, Math.min(originalPlan.get(p.id)!, next)));
    }
    planning.passes = pass + 1;
    clock.lap("planningOtherMs");
    listStageTiming(timings, "planningPassMs", performance.now() - passStarted);
    listStageTiming(timings, "planningPassChangedSites", planning.siteChanges.length);
    const elapsedMs = execution?.elapsedMs() ?? 0;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new Error("Invalid planning elapsed time");
    const stop = producerPlanningStop({
      changed,
      passes: planning.passes,
      maximumPasses: passes,
      deadlineReached: execution != null && elapsedMs >= execution.maximumElapsedMs,
    });
    if (stop) {
      planning.stopReason = stop;
      planning.converged = stop === "converged";
      break;
    }
  }
  // Bills follow output (owner decision 2026-10-30). Wages and site running
  // costs were sized and paid for the funded run, before short inputs cut it.
  // The plant pays for the share it made; idle capacity keeps its cold upkeep.
  // The unused share goes back to the company before the final clearing, so no
  // household spends wages that were never earned. Cash cuts and productivity
  // are in the funded run already and are billed as before.
  const billedRunShare = new Map<string, number>();
  for (const [i, p] of plans.entries()) {
    const maximum = physicalMaximum.get(p.id)!;
    const share = maximum > 0 ? Math.min(1, Math.max(0, plannedById.get(p.id)! / maximum)) : 1;
    if (!(share < 1 - 1e-12)) continue;
    billedRunShare.set(p.id, share);
    const paid = payments.get(p.id)!;
    const refund = (recipient: string, amount: number) => {
      const taken = Math.min(cash.get(recipient)!, Math.max(0, amount));
      cash.set(recipient, cash.get(recipient)! - taken);
      cash.set(p.accountId, cash.get(p.accountId)! + taken);
      return taken;
    };
    const labourArrears = Math.max(0, p.labourCost - paid.labour);
    const labour = paid.labour - refund(p.labourRecipientAccountId, paid.labour * (1 - share));
    const idle =
      p.idleOperatingCost != null
        ? Math.min(p.otherOperatingCost, Math.max(0, finite(p.idleOperatingCost, "idle upkeep")))
        : null;
    const operatingRatio =
      idle != null && p.otherOperatingCost > 0
        ? (idle + (p.otherOperatingCost - idle) * share) / p.otherOperatingCost
        : 1;
    const operatingArrears = Math.max(0, p.otherOperatingCost - paid.operating);
    const operating =
      paid.operating - refund(p.operatingRecipientAccountId, paid.operating * (1 - operatingRatio));
    const arrearsCut = labourArrears * (1 - share) + operatingArrears * (1 - operatingRatio);
    pendingDueByAccount.set(
      p.accountId,
      Math.max(0, (pendingDueByAccount.get(p.accountId) ?? 0) - arrearsCut)
    );
    payments.set(p.id, {
      labour,
      operating,
      arrears: paid.arrears - arrearsCut,
    });
    plans[i] = {
      ...p,
      labourCost: labour + labourArrears * share,
      otherOperatingCost: operating + operatingArrears * operatingRatio,
    };
  }
  if (billedRunShare.size > 0 && householdIds.size > 0)
    consumerOrders = [
      ...(input.externalOrders ?? []),
      ...(input.households ?? []).flatMap((household) =>
        householdPurchaseOrders({ ...household, cash: householdBudgetCash(household) })
      ),
    ];
  // Clear once more at the settled plan so every sale is backed by what is
  // actually produced (the last pass may have lowered plans after clearing).
  clock.lap("billingMs");
  addStageTiming(timings, "planningTrialRuns", trialRuns);
  const trialsBeforeFinal = trialRuns;
  market = settleWithinCredit(input.trackCountryBooks === true);
  clock.lap("finalClearingMs");
  addStageTiming(timings, "finalClearingTrialRuns", trialRuns - trialsBeforeFinal);
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
      spilloverUnits = next.extraUnits;
      const trialsBeforeSpillover = trialRuns;
      clock.lap("spilloverPrepMs");
      market = settleWithinCredit(input.trackCountryBooks === true);
      clock.lap("spilloverClearingMs");
      addStageTiming(timings, "spilloverTrialRuns", trialRuns - trialsBeforeSpillover);
      spillover = { ...next.stats, recovered: spend(market.orders) - before };
    }
  }
  const results: ProducerOperatingResult[] = [];
  const { closingAccounts } = buildProducerOperatingResults({
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
  });
  return {
    accounts: closingAccounts,
    payables: [...closingPayables.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    ),
    payablePayments: prior.payments,
    producers: results,
    planning,
    tradeReceipt: market.tradeReceipt,
    prices: market.prices,
    ...(spillover ? { spillover } : {}),
    ...(market.countryBooks ? { countryBooks: market.countryBooks } : {}),
    ...(market.regionalBooks ? { regionalBooks: market.regionalBooks } : {}),
    orderOutcomes: productionOrderOutcomes(
      [...consumerOrders, ...inputOrders()],
      market.orders,
      spilloverUnits
    ),
  };
}
