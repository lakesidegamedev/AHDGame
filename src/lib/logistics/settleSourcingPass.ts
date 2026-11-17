import {
  GRID_LOSS_PER_HOP,
  GRID_WHEELING_PER_HOP_FRACTION,
  FREIGHT_CONGESTION_OVERFLOW,
  SEA_FREIGHT_HOP_EQUIV,
  UNREACHABLE_HOP_EQUIV,
  FLOW_RECORD_FLOOR_UNITS,
  OWN_LEG_TERMS,
} from "@/lib/logistics/sourcingConstants";
import {
  FREIGHT_SHIPPING_MAX_ASK_SHARE,
  boundedShippingPerUnit,
  FREIGHT_CONGESTION_SURCHARGE,
  congestedLandedPrice,
  freightPriceTeuPerUnitHop,
  BUYER_TOLERANCE_SLACK,
  shortageResponsiveToleranceSlack,
  fairForeignBudgets,
} from "@/lib/logistics/sourcingPrices";
import type {
  SourcingCommoditySummary,
  SourcingPairAggregate,
  SourcingDestinationAggregate,
  SourcingResult,
  SourcingCandidate,
  FairForeignDemand,
} from "@/lib/logistics/sourcingTypes";

import {
  ownRouteAvailable,
  reclaimedLocalUnits,
  ownRouteBudgetKey,
} from "@/lib/logistics/rules/ownPriority";
import type { CountryId } from "@/lib/constants/countries";
import {
  addPurchaseExposure,
  purchaseUseShares,
  summarizePurchaseExposureByCountry,
  type PurchaseUseShares,
} from "@/lib/logistics/rules/purchaseExposure";

import {
  FREIGHT_CLASS_BY_COMMODITY,
  isHauledClass,
  SHIPPED_COMMODITIES,
  freightTeuPerUnitHop,
} from "@/lib/logistics/freightClass";
import type { RunSourcingPassStageContext } from "@/lib/logistics/sourcing";

import { gridZone } from "@/lib/electricityNetwork/rules/network";
import { createGridLedger } from "@/lib/electricityNetwork/rules/paths";

export function settleSourcingPass(context: RunSourcingPassStageContext): SourcingResult {
  for (const commodity of SHIPPED_COMMODITIES) {
    const freightClass = FREIGHT_CLASS_BY_COMMODITY[commodity]!;
    const teuPerUnitHop = freightTeuPerUnitHop(freightClass, context.eraUnitScale);
    const priceTeuPerUnitHop = freightPriceTeuPerUnitHop(freightClass, context.eraUnitScale);
    const isGrid = freightClass === "grid";
    const network =
      commodity === "energy" && context.electricityNetwork?.mode === "enforced"
        ? createGridLedger(context.electricityNetwork)
        : undefined;
    // Haulage legs are priced off the freight market; grid legs are wheeled at
    // a fraction of the ask, because a trucking price spike has no business
    // moving the cost of electricity.
    const shippingPerUnitPerHop = context.freightPrice * priceTeuPerUnitHop;
    const gridWheelingPerHop = (ask: number) => ask * GRID_WHEELING_PER_HOP_FRACTION;
    /** Share of dispatched units that survive `hopCount` hops on the grid. */
    const gridDeliveryFactor = (hopCount: number) =>
      isGrid ? Math.max(0, Math.pow(1 - GRID_LOSS_PER_HOP, hopCount)) : 1;
    const basePrice = (0, context.basePriceFor)(commodity);
    const statePrices = (0, context.statePricesFor)(commodity) ?? {};
    const nationalPrices = (0, context.nationalPricesFor)(commodity) ?? {};

    // Working copies of spare supply — consumed as buyers fill, never written
    // back to the price model.
    const spareByState = new Map<string, number>();
    // Units each route owner actually shipped out of a state this commodity:
    // its own routes in full plus its seller share of every market haul.
    // `shippedOutByState` is the same count for every seller, owners or not.
    const shippedOutByState = new Map<string, number>();
    const ownerShippedUnits = new Map<string, Map<string, number>>();
    const addOwnerShipped = (stateId: string, routeId: string, units: number) => {
      if (!(units > 0)) return;
      let byRoute = ownerShippedUnits.get(stateId);
      if (!byRoute) ownerShippedUnits.set(stateId, (byRoute = new Map()));
      byRoute.set(routeId, (byRoute.get(routeId) ?? 0) + units);
    };
    const localFillByState = new Map<string, number>();
    const unmetByState = new Map<string, number>();
    const useSharesByState = new Map<string, PurchaseUseShares>();
    // Units of an origin state's spare that a willing, in-tolerance buyer wanted
    // and that state's own freight network could not haul. Accumulated at the
    // capacity gate below, where the origin IS known, rather than inferred from
    // world totals afterwards.
    const capacityBoundByOriginState = new Map<string, number>();
    // Same rejected requests expressed in TEU. At the end of the commodity
    // pass this is reduced to cargo that is still unplaced, matching the
    // delivery warning instead of counting a request later served elsewhere.
    const capacityBoundTeuByOriginState = new Map<string, number>();
    const addCapacityBound = (stateId: string, units: number, teuPerUnit: number) => {
      if (!(units > 0)) return;
      capacityBoundByOriginState.set(
        stateId,
        (capacityBoundByOriginState.get(stateId) ?? 0) + units
      );
      capacityBoundTeuByOriginState.set(
        stateId,
        (capacityBoundTeuByOriginState.get(stateId) ?? 0) + units * teuPerUnit
      );
    };
    const pairByKey = new Map<string, SourcingPairAggregate>();
    const destinationByCountry = new Map<string, SourcingDestinationAggregate>();
    const destinationFor = (country: string): SourcingDestinationAggregate => {
      let row = destinationByCountry.get(country);
      if (!row) {
        row = {
          commodity,
          country,
          demandUnits: 0,
          supplyUnits: 0,
          foreignOfferUnits: 0,
          localUnits: 0,
          interStateUnits: 0,
          importUnits: 0,
          unmetUnits: 0,
          toleranceBoundUnits: 0,
          capacityBoundUnits: 0,
        };
        destinationByCountry.set(country, row);
      }
      return row;
    };
    const pairFor = (exporter: string, importer: string): SourcingPairAggregate => {
      const key = `${exporter}\u0000${importer}`;
      let row = pairByKey.get(key);
      if (!row) {
        row = {
          commodity,
          exporter,
          importer,
          deliveredUnits: 0,
          dispatchedUnits: 0,
          askValue: 0,
          freightPaid: 0,
          tariffPaid: 0,
          landedValue: 0,
          tariffRateUnits: 0,
          legs: 0,
        };
        pairByKey.set(key, row);
      }
      return row;
    };
    for (const { stateId, countryId } of context.sortedStates) {
      const bal = context.byState.get(stateId)?.get(commodity);
      const supply = bal?.supply ?? 0;
      const demand = bal?.demand ?? 0;
      const useShares = purchaseUseShares(
        demand,
        context.demandUsesByState?.get(stateId)?.get(commodity)
      );
      useSharesByState.set(stateId, useShares);
      if (supply > 0 || demand > 0) {
        const row = destinationFor(countryId);
        row.supplyUnits += supply;
        row.demandUnits += demand;
      }
      // Intra-state fill is free by design; only the residual trades interstate.
      const local = Math.min(supply, demand);
      localFillByState.set(stateId, local);
      spareByState.set(stateId, Math.max(0, supply - demand));
      unmetByState.set(stateId, Math.max(0, demand - supply));
      // Local fill is free: it contributes met units with zero extra cost.
      (0, context.addLandedPremium)(stateId, commodity, local, 0);
      addPurchaseExposure((0, context.ensurePurchaseExposure)(stateId, commodity), useShares, {
        units: local,
        preDutyValue: local * (statePrices[stateId] ?? basePrice),
        tariffPaid: 0,
        deliveredTariffPaid: 0,
        imported: false,
      });
    }
    // Foreign national spare (a country's own interstate flows already use the
    // state-level spare above; the national pool is only offered abroad).
    const spareByCountry = new Map<CountryId, number>();
    // A national export quote originates on the main grid. Named island links
    // are accounted separately by the funded market, never a pooled shortcut.
    const exportStatesByCountry = new Map(
      context.countryIds.map((cid) => [
        cid,
        (context.statesByCountry.get(cid) ?? []).filter(
          (stateId) =>
            !network || gridZone({ countryId: cid, stateId }) === gridZone({ countryId: cid })
        ),
      ])
    );
    const foreignSpareFor = (cid: CountryId) => {
      const pool = spareByCountry.get(cid) ?? 0;
      if (!network || !context.statesByCountry.get(cid)?.length) return pool;
      return Math.min(
        pool,
        (exportStatesByCountry.get(cid) ?? []).reduce((n, id) => n + (spareByState.get(id) ?? 0), 0)
      );
    };
    for (const cid of context.countryIds) {
      const bal = context.byCountry.get(cid)?.get(commodity);
      const spare = Math.max(0, (bal?.supply ?? 0) - (bal?.demand ?? 0));
      spareByCountry.set(cid, spare);
      const exportable = foreignSpareFor(cid);
      spareByCountry.set(cid, exportable);
      if (exportable > 0) destinationFor(cid).foreignOfferUnits = exportable;
    }

    const buyerTerms = (buyer: { stateId: string; countryId: CountryId }) => {
      const buyerPrice = statePrices[buyer.stateId] ?? basePrice;
      const localBalance = context.byState.get(buyer.stateId)?.get(commodity);
      const baseCeiling = buyerPrice * (1 + BUYER_TOLERANCE_SLACK);
      const ceiling =
        buyerPrice *
        (1 +
          shortageResponsiveToleranceSlack({
            localSupply: localBalance?.supply ?? 0,
            localDemand: localBalance?.demand ?? 0,
            enabled: context.shortageResponsiveSourcingEnabled,
          }));
      return { buyerPrice, baseCeiling, ceiling };
    };

    const foreignCandidateFor = (
      buyer: { stateId: string; countryId: CountryId },
      cid: CountryId
    ): SourcingCandidate | null => {
      if (cid === buyer.countryId) return null;
      if (foreignSpareFor(cid) <= 0) return null;
      if ((0, context.isBlocked)(commodity, cid, buyer.countryId)) return null;
      const gridPath = network?.path(
        { countryId: cid },
        { countryId: buyer.countryId, stateId: buyer.stateId }
      );
      if (network && !gridPath) return null;
      const ask = nationalPrices[cid] ?? basePrice;
      const shippingPerUnit = isGrid
        ? gridWheelingPerHop(ask) * SEA_FREIGHT_HOP_EQUIV
        : boundedShippingPerUnit(shippingPerUnitPerHop * SEA_FREIGHT_HOP_EQUIV, ask);
      const ratePct = (0, context.tariffRatePct)(commodity, cid, buyer.countryId);
      const tariffPerUnit = ask * (ratePct / 100);
      const quoteKey = `${commodity}|${cid}|${buyer.countryId}`;
      if (!context.foreignQuotes.has(quoteKey))
        context.foreignQuotes.set(quoteKey, {
          commodity,
          exporter: cid,
          importer: buyer.countryId,
          tariffRatePct: ratePct,
          rawShippingPerUnit: isGrid ? 0 : shippingPerUnitPerHop * SEA_FREIGHT_HOP_EQUIV,
          shippingAskShare: isGrid ? GRID_WHEELING_PER_HOP_FRACTION * SEA_FREIGHT_HOP_EQUIV : 0,
          shippingMaxAskShare: isGrid ? 0 : FREIGHT_SHIPPING_MAX_ASK_SHARE,
        });
      return {
        ...(gridPath ? { gridPath } : {}),
        originType: "country",
        originId: cid,
        landed: (ask + shippingPerUnit + tariffPerUnit) / (gridPath?.retention ?? 1),
        ask,
        shippingPerUnit,
        tariffRatePct: ratePct,
        hopCount: SEA_FREIGHT_HOP_EQUIV,
        domestic: false,
      };
    };

    const initialForeignSpareByCountry = new Map(spareByCountry);
    // A foreign dispatch consumes the exporter's NATIONAL pool, but the units
    // physically leave its states. Without also drawing them from those
    // states' spare, every exported unit stayed "unplaced": placement (and so
    // each seller's clearing offer) was capped at domestic demand, and a
    // surplus country's mines delivered almost nothing while foreign buyers
    // went short (prod t192: Brazil's main oil state placed 23 of 23,942
    // units). Drawn pro rata to each state's remaining spare, capped at what
    // the states hold.
    const drawExportFromStates = (countryId: string, units: number) => {
      if (!(units > 0)) return;
      const exporters = exportStatesByCountry.get(countryId as CountryId) ?? [];
      let total = 0;
      for (const stateId of exporters) total += spareByState.get(stateId) ?? 0;
      if (!(total > 0)) return;
      const keep = Math.max(0, 1 - units / total);
      for (const stateId of exporters) {
        const spare = spareByState.get(stateId) ?? 0;
        if (spare > 0) spareByState.set(stateId, spare * keep);
      }
    };
    const foreignAllocatedByBuyer = new Map<string, number>();
    const fairForeignBudgetFor = (
      buyer: { stateId: string; countryId: CountryId },
      exporter: CountryId
    ): number => {
      const initialSupply = initialForeignSpareByCountry.get(exporter) ?? 0;
      if (!(initialSupply > 0)) return 0;
      const demands: FairForeignDemand[] = [];
      for (const otherBuyer of context.sortedStates) {
        const remainingDemand = unmetByState.get(otherBuyer.stateId) ?? 0;
        if (!(remainingDemand > 0)) continue;
        const candidate = foreignCandidateFor(otherBuyer, exporter);
        if (!candidate) continue;
        const { ceiling } = buyerTerms(otherBuyer);
        if (!isGrid && candidate.landed > ceiling) continue;
        const deliveryFactor =
          candidate.gridPath?.retention ?? gridDeliveryFactor(candidate.hopCount);
        if (!(deliveryFactor > 0)) continue;
        const key = (0, context.foreignBudgetKey)(exporter, otherBuyer.stateId);
        demands.push({
          buyerStateId: otherBuyer.stateId,
          demandUnits: remainingDemand / deliveryFactor + (foreignAllocatedByBuyer.get(key) ?? 0),
        });
      }
      const target = fairForeignBudgets(initialSupply, demands).get(buyer.stateId) ?? 0;
      const allocated =
        foreignAllocatedByBuyer.get((0, context.foreignBudgetKey)(exporter, buyer.stateId)) ?? 0;
      return Math.max(0, target - allocated);
    };

    const summary: SourcingCommoditySummary = {
      commodity,
      intraStateUnits: 0,
      interStateUnits: 0,
      importUnits: 0,
      tariffPaid: 0,
      unmetUnits: 0,
      toleranceBoundUnits: 0,
      capacityBoundUnits: 0,
      shortageResponsiveUnits: 0,
      congestionUnits: 0,
      congestionSurchargePaid: 0,
      gridLossUnits: 0,
    };
    for (const local of localFillByState.values()) summary.intraStateUnits += local;
    for (const { stateId, countryId } of context.sortedStates) {
      const local = localFillByState.get(stateId) ?? 0;
      if (local > 0) destinationFor(countryId).localUnits += local;
    }

    const ownLegsByEntry = new Map<object, SourcingCandidate[]>();
    if (context.ownRoutes && isHauledClass(freightClass)) {
      const byDest = new Map<string, SourcingCandidate[]>();
      for (const route of context.ownRoutes) {
        if (route.commodity !== commodity || !(route.units > 0)) continue;
        const buyer = context.stateById.get(route.destStateId);
        const seller = context.stateById.get(route.originStateId);
        if (!buyer || !seller || seller.countryId !== buyer.countryId) continue;
        if (seller.stateId === buyer.stateId) continue;
        const hopCount = (0, context.hops)(buyer.countryId, seller.stateId, buyer.stateId);
        if (hopCount == null || hopCount <= 0) continue;
        const gridPath = network?.path(
          { countryId: seller.countryId, stateId: seller.stateId },
          { countryId: buyer.countryId, stateId: buyer.stateId }
        );
        if (network && !gridPath) continue;
        const ask = statePrices[seller.stateId] ?? basePrice;
        const routeMultiplier = context.shippingCostMultiplier
          ? Math.max(
              0,
              (0, context.shippingCostMultiplier)(buyer.countryId, seller.stateId, buyer.stateId)
            )
          : 1;
        const shippingPerUnit = boundedShippingPerUnit(
          shippingPerUnitPerHop * hopCount * routeMultiplier,
          ask
        );
        const legs = byDest.get(buyer.stateId) ?? [];
        legs.push({
          ...(gridPath ? { gridPath } : {}),
          originType: "state",
          originId: seller.stateId,
          landed: (ask + shippingPerUnit) / (gridPath?.retention ?? 1),
          ask,
          shippingPerUnit,
          tariffRatePct: 0,
          hopCount,
          domestic: true,
          ownRoute: route,
        });
        byDest.set(buyer.stateId, legs);
      }
      for (const [destStateId, legs] of byDest) {
        legs.sort(
          (a, b) =>
            a.hopCount - b.hopCount ||
            a.originId.localeCompare(b.originId) ||
            a.ownRoute!.corporationId.localeCompare(b.ownRoute!.corporationId)
        );
        ownLegsByEntry.set({ ...context.stateById.get(destStateId)! }, legs);
      }
    }
    const ownEntries = [...ownLegsByEntry.keys()] as typeof context.sortedStates;
    ownEntries.sort((a, b) => a.stateId.localeCompare(b.stateId));

    const serveBuyers = (
      buyers: ReadonlyArray<{ stateId: string; countryId: CountryId }>,
      foreignOnly: boolean
    ) => {
      for (const buyer of buyers) {
        let unmet = unmetByState.get(buyer.stateId) ?? 0;
        const unmetBefore = unmet;
        if (unmet <= 0) continue;
        const ownLegs = ownLegsByEntry.get(buyer);
        const { baseCeiling, ceiling } = ownLegs ? OWN_LEG_TERMS : buyerTerms(buyer);

        // Candidate sellers: same-country states with spare + foreign countries.
        const candidates: SourcingCandidate[] = ownLegs ? [...ownLegs] : [];

        for (const seller of ownLegs || foreignOnly ? [] : context.sortedStates) {
          if (seller.countryId !== buyer.countryId || seller.stateId === buyer.stateId) continue;
          const spare = spareByState.get(seller.stateId) ?? 0;
          if (spare <= 0) continue;
          const hopCount =
            (0, context.hops)(buyer.countryId, seller.stateId, buyer.stateId) ??
            UNREACHABLE_HOP_EQUIV;
          if (hopCount <= 0) continue;
          const gridPath = network?.path(
            { countryId: seller.countryId, stateId: seller.stateId },
            { countryId: buyer.countryId, stateId: buyer.stateId }
          );
          if (network && !gridPath) continue;
          const ask = statePrices[seller.stateId] ?? basePrice;
          const routeMultiplier = context.shippingCostMultiplier
            ? Math.max(
                0,
                (0, context.shippingCostMultiplier)(buyer.countryId, seller.stateId, buyer.stateId)
              )
            : 1;
          const shippingPerUnit = isGrid
            ? gridWheelingPerHop(ask) * hopCount * routeMultiplier
            : boundedShippingPerUnit(shippingPerUnitPerHop * hopCount * routeMultiplier, ask);
          candidates.push({
            ...(gridPath ? { gridPath } : {}),
            originType: "state",
            originId: seller.stateId,
            landed: (ask + shippingPerUnit) / (gridPath?.retention ?? 1),
            ask,
            shippingPerUnit,
            tariffRatePct: 0,
            hopCount,
            domestic: true,
          });
        }
        for (const cid of ownLegs ? [] : context.countryIds) {
          const candidate = foreignCandidateFor(buyer, cid);
          if (candidate) candidates.push(candidate);
        }

        if (!ownLegs)
          candidates.sort(
            (a, b) =>
              a.landed - b.landed ||
              Number(b.domestic) - Number(a.domestic) ||
              a.originId.localeCompare(b.originId)
          );

        for (const cand of candidates) {
          if (unmet <= 0) break;
          // The buyer-tolerance ceiling is a HAULAGE limit: past it, trucking the
          // cargo costs more than the cargo is worth, so the demand goes unmet.
          // Grid commodities (energy, natural gas) do not ride the haulage fleet —
          // they are wheeled over wire and pipe, and the design is that a state
          // gets power at a price rather than a blackout. So grid is NOT
          // tolerance-bound: it keeps drawing from reachable generation (cheapest
          // first, lossier the farther it comes) until supply is exhausted, which
          // is what the consumption ledger already books. Applying the freight
          // ceiling to grid was the whole energy book divergence: the ledger
          // served it, the sourcing book called it unmet.
          if (!isGrid && cand.landed > ceiling) {
            // Sorted ascending: everything past here also breaks the ceiling.
            // The displaced-spare pass only revisits buyers the first pass
            // already booked, so it must not count the same shortfall twice.
            if (!foreignOnly) {
              summary.toleranceBoundUnits += unmet;
              destinationFor(buyer.countryId).toleranceBoundUnits += unmet;
            }
            break;
          }
          const spare =
            cand.originType === "state"
              ? ownRouteAvailable(
                  spareByState.get(cand.originId) ?? 0,
                  localFillByState.get(cand.originId) ?? 0,
                  cand.ownRoute?.ownFirstAcrossStates === true
                )
              : foreignSpareFor(cand.originId as CountryId);
          if (spare <= 0) continue;

          // Grid legs lose a share of what they dispatch, so the buyer's fill and
          // the seller's drawdown are two different numbers. `deliver` is what
          // lands, `dispatch` is what leaves.
          const deliveryFactor = cand.gridPath?.retention ?? gridDeliveryFactor(cand.hopCount);
          const ownSupplyKey = cand.ownRoute && ownRouteBudgetKey(cand.ownRoute, "origin");
          const ownDemandKey = cand.ownRoute && ownRouteBudgetKey(cand.ownRoute, "destination");
          let deliver = Math.min(
            unmet,
            network && cand.gridPath ? network.capacity(cand.gridPath) : Infinity,
            cand.ownRoute?.units ?? Infinity,
            spare * deliveryFactor,
            ownSupplyKey ? (context.ownBudgets.supply.get(ownSupplyKey) ?? Infinity) : Infinity,
            ownDemandKey ? (context.ownBudgets.demand.get(ownDemandKey) ?? Infinity) : Infinity
          );
          let dispatch = deliveryFactor > 0 ? deliver / deliveryFactor : 0;
          if (cand.originType === "country") {
            const fairBudget = fairForeignBudgetFor(buyer, cand.originId as CountryId);
            if (dispatch > fairBudget) {
              dispatch = fairBudget;
              deliver = dispatch * deliveryFactor;
            }
          }
          let teuConsumed = 0;
          let ownCapacityTeu = 0;
          let overflowDispatch = 0;
          let congestionSurchargePaid = 0;
          if (cand.originType === "state" && isHauledClass(freightClass)) {
            // Origin-state capacity gate (plan open question 4: v1 charges the
            // whole route to the origin's network). Past nominal capacity the
            // haul still runs, at a congestion surcharge on the overflow units
            // only, up to the overflow limit: freight is a cost, not a wall.
            const nominal = context.freightCapacityByState.get(cand.originId) ?? 0;
            const used = context.freightUsedByState.get(cand.originId)!;
            const totalUsed = used.bulk + used.special;
            const teuPerUnit = teuPerUnitHop * cand.hopCount;
            if (teuPerUnit > 0) {
              if (!(nominal > 0)) {
                // A state with no freight supply at all hauls nothing.
                summary.capacityBoundUnits += deliver;
                destinationFor(buyer.countryId).capacityBoundUnits += deliver;
                addCapacityBound(cand.originId, deliver, teuPerUnit);
                continue;
              }
              // Capacity other owners still plan to haul with is not this
              // haul's to take; the shared pool is what is left of it.
              // A market haul out of a state carries its sellers' goods: the part
              // owners ship on their own trucks is theirs to take.
              const marketOwners = cand.ownRoute
                ? []
                : (0, context.marketOwnersFor)(commodity, cand.originId);
              const ownedTeu = (units: number) =>
                marketOwners.reduce(
                  (sum, o) =>
                    sum +
                    Math.min(
                      units * teuPerUnit * o.share,
                      context.ownFreight.heldBy(cand.originId, o.routeId)
                    ),
                  0
                );
              const heldBack = Math.max(
                0,
                context.ownFreight.heldFromOthers(cand.originId, cand.ownRoute?.corporationId) -
                  ownedTeu(dispatch)
              );
              const unitsToNominal = Math.max(0, nominal - heldBack - totalUsed) / teuPerUnit;
              // The hold also guards the overflow band: otherwise rivals served
              // earlier run past nominal and spend the owner's held trucks, which
              // is how a saturated state left its owner with no own cover at all.
              const unitsInOverflow =
                Math.max(
                  0,
                  nominal * (1 + FREIGHT_CONGESTION_OVERFLOW) -
                    heldBack -
                    Math.max(totalUsed, nominal - heldBack)
                ) / teuPerUnit;
              // Overflow units carry the full surcharge. If that price breaks the
              // buyer's tolerance the overflow simply does not happen, which is a
              // tolerance outcome rather than a hard capacity wall.
              const congestedLanded = congestedLandedPrice(cand.landed, cand.shippingPerUnit);
              const overflowAffordable = congestedLanded <= ceiling;
              const dispatchCeiling = unitsToNominal + (overflowAffordable ? unitsInOverflow : 0);
              if (dispatchCeiling <= 0) {
                summary.capacityBoundUnits += deliver;
                destinationFor(buyer.countryId).capacityBoundUnits += deliver;
                addCapacityBound(cand.originId, deliver, teuPerUnit);
                continue;
              }
              if (dispatch > dispatchCeiling) {
                const lost = (dispatch - dispatchCeiling) * deliveryFactor;
                // Only the capacity branch is a delivery failure. When the
                // overflow surcharge is what broke the buyer's ceiling the goods
                // were haulable and merely too expensive, which is a price
                // outcome and must not tell the seller to build freight.
                if (overflowAffordable) {
                  summary.capacityBoundUnits += lost;
                  destinationFor(buyer.countryId).capacityBoundUnits += lost;
                  addCapacityBound(cand.originId, lost, teuPerUnit);
                } else {
                  summary.toleranceBoundUnits += lost;
                  destinationFor(buyer.countryId).toleranceBoundUnits += lost;
                }
                dispatch = dispatchCeiling;
                deliver = dispatch * deliveryFactor;
              }
              if (dispatch <= 0) continue;
              overflowDispatch = Math.max(0, dispatch - unitsToNominal);
              congestionSurchargePaid =
                overflowDispatch * cand.shippingPerUnit * FREIGHT_CONGESTION_SURCHARGE;
              teuConsumed = dispatch * teuPerUnit;
              if (cand.ownRoute)
                ownCapacityTeu = context.ownFreight.cover(
                  cand.originId,
                  cand.ownRoute.corporationId,
                  teuConsumed
                );
              else
                for (const o of marketOwners)
                  ownCapacityTeu += context.ownFreight.cover(
                    cand.originId,
                    o.routeId,
                    teuConsumed * o.share
                  );
              used[freightClass] += teuConsumed;
              context.freightDemandByState.get(cand.originId)![freightClass] += teuConsumed;
            }
          }
          if (deliver <= 0) continue;
          if (network && cand.gridPath && deliver > 0)
            dispatch = network.take(cand.gridPath, deliver);
          const take = deliver;
          // Spend company budgets after capacity gates, using actual dispatch.
          // Unshipped surplus remains in the ordinary market pass below.
          if (ownSupplyKey && context.ownBudgets.supply.has(ownSupplyKey))
            context.ownBudgets.supply.set(
              ownSupplyKey,
              context.ownBudgets.supply.get(ownSupplyKey)! - dispatch
            );
          if (ownDemandKey && context.ownBudgets.demand.has(ownDemandKey))
            context.ownBudgets.demand.set(
              ownDemandKey,
              context.ownBudgets.demand.get(ownDemandKey)! - take
            );
          if (context.shortageResponsiveSourcingEnabled) {
            if (cand.landed > baseCeiling) {
              summary.shortageResponsiveUnits += take;
            } else if (
              overflowDispatch > 0 &&
              congestedLandedPrice(cand.landed, cand.shippingPerUnit) > baseCeiling
            ) {
              summary.shortageResponsiveUnits += overflowDispatch * deliveryFactor;
            }
          }
          summary.gridLossUnits += Math.max(0, dispatch - deliver);
          summary.congestionUnits += overflowDispatch * deliveryFactor;
          summary.congestionSurchargePaid += congestionSurchargePaid;

          const tariffPaid = dispatch * cand.ask * (cand.tariffRatePct / 100);
          const deliveredTariffPaid = dispatch > 0 ? tariffPaid * (take / dispatch) : 0;
          if (cand.originType === "state") {
            const marketSpare = spareByState.get(cand.originId) ?? 0;
            const reclaimed = reclaimedLocalUnits(dispatch, marketSpare);
            if (reclaimed > 0) {
              // Do not take local buyers' fill until the capacity and price gates pass.
              localFillByState.set(
                cand.originId,
                (localFillByState.get(cand.originId) ?? 0) - reclaimed
              );
              unmetByState.set(cand.originId, (unmetByState.get(cand.originId) ?? 0) + reclaimed);
              summary.intraStateUnits -= reclaimed;
              destinationFor(buyer.countryId).localUnits -= reclaimed;
              const premium = context.landedPremiumByDestState.get(cand.originId)?.get(commodity);
              if (premium) premium.metUnits -= reclaimed;
              addPurchaseExposure(
                (0, context.ensurePurchaseExposure)(cand.originId, commodity),
                useSharesByState.get(cand.originId)!,
                {
                  units: -reclaimed,
                  preDutyValue: -reclaimed * (statePrices[cand.originId] ?? basePrice),
                  tariffPaid: 0,
                  deliveredTariffPaid: 0,
                  imported: false,
                }
              );
            }
            spareByState.set(cand.originId, Math.max(0, marketSpare - dispatch));
            shippedOutByState.set(
              cand.originId,
              (shippedOutByState.get(cand.originId) ?? 0) + dispatch
            );
            if (cand.ownRoute) {
              addOwnerShipped(cand.originId, cand.ownRoute.corporationId, dispatch);
            } else {
              for (const o of (0, context.marketOwnersFor)(commodity, cand.originId))
                addOwnerShipped(cand.originId, o.routeId, dispatch * o.share);
            }
            summary.interStateUnits += take;
          } else {
            spareByCountry.set(cand.originId as CountryId, spare - dispatch);
            drawExportFromStates(cand.originId, dispatch);
            summary.importUnits += take;
            summary.tariffPaid += tariffPaid;
            const key = (0, context.foreignBudgetKey)(cand.originId as CountryId, buyer.stateId);
            foreignAllocatedByBuyer.set(key, (foreignAllocatedByBuyer.get(key) ?? 0) + dispatch);
          }
          unmet -= take;
          unmetByState.set(buyer.stateId, unmet);

          const exporter = cand.originType === "state" ? buyer.countryId : cand.originId;
          const pair = pairFor(exporter, buyer.countryId);
          pair.deliveredUnits += take;
          pair.dispatchedUnits += dispatch;
          pair.askValue += dispatch * cand.ask;
          pair.freightPaid += take * cand.shippingPerUnit + congestionSurchargePaid;
          pair.tariffPaid += tariffPaid;
          pair.landedValue += take * cand.landed;
          pair.tariffRateUnits += take * cand.tariffRatePct;
          pair.legs += 1;
          const destination = destinationFor(buyer.countryId);
          if (cand.originType === "state") destination.interStateUnits += take;
          else destination.importUnits += take;

          // Aggregates stay exact; the itemization floor only caps the doc's flow list.
          // An owner's own trucks add no freight cost to the buyer (stage 2 only).
          const marketOwnShare =
            !cand.ownRoute && teuConsumed > 0 ? ownCapacityTeu / teuConsumed : 0;
          if (!cand.ownRoute) {
            (0, context.addLandedPremium)(
              buyer.stateId,
              commodity,
              take,
              take * cand.shippingPerUnit * (1 - marketOwnShare) + tariffPaid
            );
          }
          // Canonical freight billing: the shipping leg of a domestic hauled flow
          // is the buyer state's charge and the origin state's haul revenue, one
          // amount booked on both sides. Hauled classes lose nothing in transit
          // (deliveryFactor 1), so `take` here is also what was dispatched.
          if (cand.ownRoute) {
            // The part carried on the owner's own capacity is internal supply:
            // no charge to the owner and no revenue to the origin fleet, so
            // the two legs net. The rest bills as before.
            const ownShare = teuConsumed > 0 ? ownCapacityTeu / teuConsumed : 0;
            const freightCharge =
              (take * cand.shippingPerUnit + congestionSurchargePaid) * (1 - ownShare);
            context.haulRevenueByOriginState.set(
              cand.originId,
              (context.haulRevenueByOriginState.get(cand.originId) ?? 0) + freightCharge
            );
            context.ownRouteDelivered.push({
              ...cand.ownRoute,
              units: take,
              freightCharge,
              ...(ownCapacityTeu > 0 ? { ownCapacityTeu } : {}),
            });
          } else if (cand.originType === "state" && isHauledClass(freightClass)) {
            (0, context.addFreightBilling)(
              buyer.stateId,
              cand.originId,
              commodity,
              (take * cand.shippingPerUnit + congestionSurchargePaid) * (1 - marketOwnShare)
            );
          }
          if (cand.originType === "country") {
            const agg = context.importAggregatesByCountry.get(buyer.countryId) ?? {
              tariffPaid: 0,
              importValue: 0,
            };
            agg.tariffPaid += tariffPaid;
            agg.importValue += take * cand.ask;
            context.importAggregatesByCountry.set(buyer.countryId, agg);
          }
          addPurchaseExposure(
            (0, context.ensurePurchaseExposure)(buyer.stateId, commodity),
            useSharesByState.get(buyer.stateId) ?? purchaseUseShares(0, undefined),
            {
              units: take,
              preDutyValue: take * cand.ask,
              tariffPaid,
              deliveredTariffPaid,
              imported: cand.originType === "country",
            }
          );

          if (take >= FLOW_RECORD_FLOOR_UNITS) {
            context.flows.push({
              commodity,
              originType: cand.originType,
              originId: cand.originId,
              destStateId: buyer.stateId,
              units: (0, context.round2)(take),
              hops: cand.hopCount,
              freightClass,
              ask: (0, context.round2)(cand.ask),
              shippingPerUnit: (0, context.round2)(cand.shippingPerUnit),
              tariffRatePct: cand.tariffRatePct,
              tariffPaid: (0, context.round2)(tariffPaid),
              deliveredTariffPaid: (0, context.round2)(deliveredTariffPaid),
              landedPrice: (0, context.round2)(cand.landed),
              freightTeuConsumed: (0, context.round2)(teuConsumed),
            });
          }
        }

        if (ownLegs) continue; // the market pass for this state books what is left
        if (foreignOnly) {
          // The first pass booked this buyer's whole shortfall: take back what
          // the displaced spare filled.
          summary.unmetUnits -= unmetBefore - unmet;
          destinationFor(buyer.countryId).unmetUnits -= unmetBefore - unmet;
          continue;
        }
        summary.unmetUnits += Math.max(0, unmet);
        if (unmet > 0) destinationFor(buyer.countryId).unmetUnits += unmet;
      }
    };
    serveBuyers(ownEntries, false);
    context.ownFreight.release(commodity);
    serveBuyers(context.sortedStates, false);
    context.ownFreight.release(commodity, "market");

    // The national pool is supply minus demand, fixed before anyone buys.
    // When a country's own buyers take imports, the domestic spare they passed
    // over stays held by its states but was never offered abroad, so it goes
    // unplaced while foreign buyers stay short. The first pass's fair shares
    // also reserve pool for buyers a cheaper seller then filled, and nothing
    // released those reservations. So offer the unused pool plus the displaced
    // spare, fair-shared again, to buyers still unmet. Exports drew from both
    // the pool and the states, so held spare already contains the unused pool:
    // displaced is only what states hold beyond it, and the offer is never
    // counted twice.
    if (context.sortedStates.some(({ stateId }) => (unmetByState.get(stateId) ?? 0) > 0)) {
      initialForeignSpareByCountry.clear();
      foreignAllocatedByBuyer.clear();
      let anyOffer = false;
      for (const cid of context.countryIds) {
        let held = 0;
        for (const stateId of exportStatesByCountry.get(cid) ?? [])
          held += spareByState.get(stateId) ?? 0;
        const unusedPool = spareByCountry.get(cid) ?? 0;
        const displaced = Math.max(0, held - unusedPool);
        const offer = unusedPool + displaced;
        spareByCountry.set(cid, offer);
        initialForeignSpareByCountry.set(cid, offer);
        if (displaced > 0) destinationFor(cid).foreignOfferUnits += displaced;
        if (offer > 0) anyOffer = true;
      }
      if (anyOffer) serveBuyers(context.sortedStates, true);
    }

    // Every buyer has been offered every seller, so whatever is still spare is
    // production this turn's network could not place: no local demand, no haul
    // inside the buyer's tolerance, no importer. Snapshot it before the working
    // map goes out of scope. It is the only exact record of the sell side of
    // the freight seam. Kept unrounded; the price turn rounds on persist.
    context.unplacedSupplyByState.set(commodity, new Map(spareByState));

    // Split spare capacity by reason and state: only origin capacity that
    // could not haul elsewhere counts, so states with idle trucks are not
    // blamed like genuinely full networks.
    const deliveryLimited = new Map<string, number>();
    for (const [stateId, spare] of spareByState) {
      // Bounded by what is actually left over: capacity-bound units the state
      // later placed with someone else are not unsold, so they are not stuck.
      const capacityBound = capacityBoundByOriginState.get(stateId) ?? 0;
      const limited = Math.min(spare, capacityBound);
      deliveryLimited.set(stateId, limited);
      // Book only the capacity-bound requests that remain genuinely unserved.
      // A failed attempt later placed with another buyer must not claim freight
      // demand twice. Scaling preserves the attempted routes' TEU weighting.
      if (limited > 0 && capacityBound > 0 && isHauledClass(freightClass)) {
        const capacityBoundTeu = capacityBoundTeuByOriginState.get(stateId) ?? 0;
        context.freightDemandByState.get(stateId)![freightClass] +=
          capacityBoundTeu * (limited / capacityBound);
      }
    }
    context.deliveryLimitedSupplyByState.set(commodity, deliveryLimited);

    // The owner's own slice of that state figure. A route owner's goods leave
    // a state on its own routes first, then in its seller share of each market
    // haul, so its shipped units are known exactly. The state's stuck units
    // are spread over what each seller still holds unshipped: listed owners by
    // their own count, everyone else as the remainder. Owners not listed keep
    // the state figure.
    if (context.marketStage && isHauledClass(freightClass)) {
      const byOwnerState = new Map<string, Map<string, number>>();
      for (const [stateId, owners] of context.ownFreightMarketSupply!.get(commodity) ?? []) {
        const supply = context.byState.get(stateId)?.get(commodity)?.supply ?? 0;
        if (!(supply > 0)) continue;
        const limited = deliveryLimited.get(stateId) ?? 0;
        const localFill = Math.max(0, localFillByState.get(stateId) ?? 0);
        const shipped = ownerShippedUnits.get(stateId);
        let ownersUnits = 0;
        let ownersShipped = 0;
        const heldByOwner = new Map<string, number>();
        for (const [routeId, units] of owners) {
          if (!(units > 0)) continue;
          const own = Math.min(units, shipped?.get(routeId) ?? 0);
          ownersUnits += units;
          ownersShipped += own;
          heldByOwner.set(routeId, Math.max(0, units - own - (localFill * units) / supply));
        }
        const restUnits = Math.max(0, supply - ownersUnits);
        const restHeld = Math.max(
          0,
          restUnits -
            Math.max(0, (shippedOutByState.get(stateId) ?? 0) - ownersShipped) -
            (localFill * restUnits) / supply
        );
        let heldTotal = restHeld;
        for (const held of heldByOwner.values()) heldTotal += held;
        const fractions = new Map<string, number>();
        for (const [routeId, held] of heldByOwner) {
          const units = owners.get(routeId)!;
          const stuck = heldTotal > 0 ? (limited * held) / heldTotal : 0;
          fractions.set(routeId, Math.max(0, Math.min(1, stuck / units)));
        }
        if (fractions.size > 0) byOwnerState.set(stateId, fractions);
      }
      if (byOwnerState.size > 0)
        context.ownerDeliveryLimitedFractionByState.set(commodity, byOwnerState);
    }

    summary.intraStateUnits = (0, context.round2)(summary.intraStateUnits);
    summary.interStateUnits = (0, context.round2)(summary.interStateUnits);
    summary.importUnits = (0, context.round2)(summary.importUnits);
    summary.tariffPaid = (0, context.round2)(summary.tariffPaid);
    summary.unmetUnits = (0, context.round2)(summary.unmetUnits);
    summary.toleranceBoundUnits = (0, context.round2)(summary.toleranceBoundUnits);
    summary.capacityBoundUnits = (0, context.round2)(summary.capacityBoundUnits);
    summary.shortageResponsiveUnits = (0, context.round2)(summary.shortageResponsiveUnits);
    summary.congestionUnits = (0, context.round2)(summary.congestionUnits);
    summary.congestionSurchargePaid = (0, context.round2)(summary.congestionSurchargePaid);
    summary.gridLossUnits = (0, context.round2)(summary.gridLossUnits);
    context.summaries.push(summary);
    for (const pair of [...pairByKey.values()].sort(
      (a, b) => a.exporter.localeCompare(b.exporter) || a.importer.localeCompare(b.importer)
    )) {
      context.pairAggregates.push(pair);
    }
    for (const destination of [...destinationByCountry.values()].sort((a, b) =>
      a.country.localeCompare(b.country)
    )) {
      context.destinationAggregates.push(destination);
    }
  }

  return {
    flows: context.flows,
    ownRouteDelivered: context.ownRouteDelivered,
    summaries: context.summaries,
    ownFreightCoveredTeuByState: context.ownFreight.covered(),
    ownerDeliveryLimitedFractionByState: context.ownerDeliveryLimitedFractionByState,
    freightTeuByState: context.freightUsedByState,
    freightDemandTeuByState: context.freightDemandByState,
    landedPremiumByDestState: context.landedPremiumByDestState,
    importAggregatesByCountry: context.importAggregatesByCountry,
    purchaseExposureByCountry: context.demandUsesByState
      ? summarizePurchaseExposureByCountry(context.states, context.purchaseExposureByDestState)
      : undefined,
    unplacedSupplyByState: context.unplacedSupplyByState,
    deliveryLimitedSupplyByState: context.deliveryLimitedSupplyByState,
    freightChargesByDestState: context.freightChargesByDestState,
    haulRevenueByOriginState: context.haulRevenueByOriginState,
    pairAggregates: context.pairAggregates,
    foreignQuotes: [...context.foreignQuotes.values()],
    destinationAggregates: context.destinationAggregates,
  };
}
