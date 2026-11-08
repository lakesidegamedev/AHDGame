/**
 * NPP Action Processing Turn Phase
 *
 * Runs every 4 turns to process actions for active Non-Player Politicians (at
 * v6, NPP engine 6.0, a quarter of them each turn: v6/rules/actionCadence.ts).
 * Uses the action AI to select which action each NPP takes, then executes
 * the action at full player effectiveness (the 4-turn cadence and per-cycle
 * action cap are the throttle, not a per-action discount).
 */

import { withBondPoolLedgerSnapshot } from "@/lib/bonds/marketPoolLedger";
import { substepMarker } from "@/lib/observability/phaseSubsteps";
import type { Db, ObjectId } from "mongodb";
import type { NPP, GameConfig, Bond, ElectionCandidate } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  decideNppAction,
  NPP_ACTION_COSTS,
  NPP_FUND_COSTS,
  FUNDRAISE_AP_COST,
  FUNDRAISE_FUNDS_ANCHOR_GAIN,
  getNppCampaignApCost,
  getNppCampaignFundCost,
} from "@/lib/npp/actionAi";
import { loadNppBehaviorPolicy } from "@/lib/singleplayerDifficulty/loadBehaviorPolicy";
import { buildNppSignalLookup, type NppSignalLookup } from "@/lib/npp/actionSignals";
import { applyNppIdiosyncrasy } from "@/lib/nppAutonomy/v3/nppIdiosyncrasy";
import { advertiseFavorabilityGain, campaignInfluenceGain } from "@/lib/actions";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import {
  campaignLocalRate,
  loadCampaignCurrencyRates,
  loadCampaignPriceLevel,
} from "@/lib/campaigns/campaignCurrency";
import {
  COUNTRY_CURRENCY_MAP,
  getSeedCurrencyCode,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import { loadTxThresholds, emitTxBulk } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import {
  getNppAutonomyLevel,
  getNppAutonomyWorldContext,
  nppAutonomyLevelAtLeast,
} from "@/lib/nppAutonomy/featureFlag";
import { NPP_ENGINE_LEVEL } from "@/lib/nppAutonomy/engineVersion";
import { NPP_ACTION_INTERVAL, nppActsThisTurn } from "@/lib/nppAutonomy/v6/rules/actionCadence";
import { planNppRally, type NppRallyWrite } from "@/lib/turn/npp/nppRally";
import { getAllCountryAccess } from "@/lib/countryAccess";
import { careerArchetypeModifiersContinuous } from "@/lib/nppAutonomy/v3/careerArchetype";
import { nppBuyBond } from "@/lib/nppAutonomy/v3/finance/nppBonds";
import { nppBuyShares } from "@/lib/nppAutonomy/v3/finance/nppShares";
import type { Corporation } from "@/lib/db/types/corporation";
import {
  NPP_ACTION_RNG_SALT,
  countryScopeFilter,
  NPP_SWEEP_PARTITION_CONCURRENCY,
} from "./nppActionShared";
export { groupInOrder } from "./nppActionShared";
import {
  NPP_BOND_INVEST_RESERVE_FLOOR,
  NPP_BOND_INVEST_BASE_PROBABILITY,
  NPP_BOND_MIN_YIELD_PCT,
  NPP_STOCK_INVEST_RESERVE_FLOOR,
  NPP_STOCK_INVEST_BASE_PROBABILITY,
  bondCandidates,
  pickIndexByWeight,
  bondBuyUnits,
  type StockCandidateCorp,
  stockCandidates,
  pickStockCandidate,
  stockBuyShares,
} from "./nppInvestCandidates";
export { nppStockCandidateWeight } from "./nppInvestCandidates";
import { investNppBondSurplusV6, investNppStockSurplusV6 } from "./nppInvestV6";
import {
  buildNppPartyOrgSurplus,
  sellNppStockSurplus,
  foundNppCorporationsSurplus,
} from "./nppSurplusActions";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { getNppsCollection } from "@/lib/db/collections/npps";
export {
  NPP_FOUNDING_FEE_ANCHOR,
  sellNppStockSurplus,
  foundNppCorporationsSurplus,
} from "./nppSurplusActions";

/**
 * The non-player-enabled country ids from a full country-access map — the v3
 * autonomy scope (v4 lifts the restriction, so callers pass null there).
 */
export function nonPlayerCountryIds(
  access: Record<string, { enabledForPlayers: boolean }>
): CountryId[] {
  return (Object.entries(access) as [CountryId, { enabledForPlayers: boolean }][])
    .filter(([, a]) => !a.enabledForPlayers)
    .map(([id]) => id);
}

const ACTION_PROCESSING_INTERVAL = NPP_ACTION_INTERVAL;
// Max actions a single NPP performs per 4-turn processing cycle. Avg ~2.5 AP/action ×4 ≈
// 9–10 AP spent vs +8 regen/cycle → AP draws down slowly from the cap. Sole throughput knob.
export const NPP_ACTIONS_PER_CYCLE = 4;
// How many of the best-yielding bonds an NPP samples between, rather than always
// taking the single best. Small on purpose: this is meant to spread NPP demand
// across an issue or two, not to model a bond desk.
/**
 * An NPP as this phase reads it: everything except the large `policies`
 * blob, which this phase never touches.
 */
type NppWithoutPolicies = Omit<NPP, "policies">;

export interface NppActionProcessingResult {
  nppsProcessed: number;
  actionsExecuted: number;
  buildDonorBase: number;
  campaign: number;
  advertise: number;
  partyDonation: number;
  /** Funds-poor fallback fires (see actionAi.ts's FUNDRAISE_* constants). */
  fundraise: number;
  skipped: number;
  /** Engine 6.2 (v6): campaign actions spent as a rally in the NPP's own race. */
  rallies: number;
}

function zeroResult(): NppActionProcessingResult {
  return {
    nppsProcessed: 0,
    actionsExecuted: 0,
    buildDonorBase: 0,
    campaign: 0,
    advertise: 0,
    partyDonation: 0,
    fundraise: 0,
    skipped: 0,
    rallies: 0,
  };
}

function getApCost(action: string, donorBaseLevel: number, politicalInfluence: number): number {
  if (action === "campaign") return getNppCampaignApCost(politicalInfluence);
  if (action === "buildDonorBase") {
    return NPP_ACTION_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)];
  }
  return NPP_ACTION_COSTS[action as keyof typeof NPP_ACTION_COSTS] as number;
}

function getFundCost(action: string, donorBaseLevel: number, politicalInfluence: number): number {
  if (action === "campaign") return getNppCampaignFundCost(politicalInfluence);
  if (action === "buildDonorBase") {
    return NPP_FUND_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)];
  }
  return NPP_FUND_COSTS[action as keyof typeof NPP_FUND_COSTS] as number;
}

export async function processNppActions(
  db: Db,
  currentTurn: number
): Promise<NppActionProcessingResult> {
  return withBondPoolLedgerSnapshot(db, currentTurn, () => runNppActions(db, currentTurn));
}

async function runNppActions(db: Db, currentTurn: number): Promise<NppActionProcessingResult> {
  const step = substepMarker();
  // Below v6 every NPP acts on the same turn, one in every four. At v6 (NPP
  // engine 6.0) each NPP acts on its own lane's turn instead, so the cost is
  // spread across all four; see v6/rules/actionCadence.ts.
  const cycleTurn = currentTurn % ACTION_PROCESSING_INTERVAL === 0;
  const staggered = nppAutonomyLevelAtLeast(await getNppAutonomyLevel(db), NPP_ENGINE_LEVEL);
  if (!cycleTurn && !staggered) {
    return zeroResult();
  }
  const actsThisTurn = staggered ? (id: ObjectId) => nppActsThisTurn(id, currentTurn) : undefined;

  // NPP economy is on by default; only an explicit `false` disables it.
  const config = await db.collection<GameConfig>("gameConfig").findOne({ _id: "default" });
  if (config?.nppEconomyEnabled === false) {
    return zeroResult();
  }

  // NPP economic + full-agency autonomy graduates in two final steps:
  //   v3 — full agency, but scoped to NON-player-enabled countries only (the
  //        NPP-driven markets, so autonomy runs wild where no players compete).
  //   v4 — the same, applied GLOBALLY (player-enabled countries included).
  // Below v3 the decision path is byte-identical to the pre-v3 logic.
  const { level, preset } = await getNppAutonomyWorldContext(db);
  const econActive = nppAutonomyLevelAtLeast(level, "v3"); // v3 or v4
  const econGlobal = nppAutonomyLevelAtLeast(level, "v4"); // v4 only

  // Country scope for autonomy: null ⇒ no restriction (v4 / global). At v3 it is
  // the set of non-player-enabled countries, so player markets stay untouched.
  const econScopeCountries =
    econActive && !econGlobal ? nonPlayerCountryIds(await getAllCountryAccess(db)) : null;
  const econScopeSet = econScopeCountries ? new Set<CountryId>(econScopeCountries) : null;

  // Difficulty spending discipline: funds an NPP keeps in hand rather than
  // spending down to zero, priced off the cheapest action so the reserve is
  // always "enough to still do something". Anchor-denominated, like
  // NPP_FUND_COSTS and the `fundsAnchorRemaining` the loop tracks.
  //
  // `reserveActionMult` is 0 at normal and easy and in every hosted/multiplayer
  // world, where this is 0 and `decideNppAction`'s affordability test is
  // byte-identical to the shipped one. It can only ever make an NPP spend less.
  const behaviorPolicy = await loadNppBehaviorPolicy(db);
  const fundsReserveAnchor = behaviorPolicy.reserveActionMult * NPP_FUND_COSTS.advertise;

  const result = zeroResult();

  // Party treasury accumulator for partyDonation actions (values in LOCAL units —
  // party.treasury is local home-currency post-cf-inconsistency-fix Phase 6).
  const partyTreasuryUpdates = new Map<string, { amount: number; _id: ObjectId }>();

  // npp.funds is local home-currency (post-cf-inconsistency-fix Phase 8 for
  // NPPs). NPP_FUND_COSTS constants are anchor for cross-country game-balance
  // parity; convert at the boundary for each NPP based on its home country rate.
  //
  // Income, action costs and soft caps share the same frozen world basis.
  // Investment sweeps below continue using live FX for market-priced assets.
  const campaignRates = await loadCampaignCurrencyRates(db);
  const priceLevel = await loadCampaignPriceLevel(db);
  const rateForCountry = (countryId: string): number =>
    campaignLocalRate(countryId, campaignRates, preset) * priceLevel;

  // Parties, loaded ONCE up front and keyed "countryId:sequentialId". This query
  // used to run after the NPP loop purely to resolve treasury-flush targets; it
  // is hoisted because the v3+ brain also reads party treasury as a decision
  // signal. Same query, same cost — just earlier — and the flush below reuses the
  // map instead of re-fetching.
  //
  // Deliberately NOT scoped to econScopeCountries: the loop below processes every
  // NPP regardless of autonomy scope, and out-of-scope NPPs still make party
  // donations that have to land somewhere. Party documents number a handful per
  // country, so loading all of them beats a scoped query plus a second lookup.
  const partiesByKey = new Map<
    string,
    {
      _id: ObjectId;
      treasury: number;
      name: string;
      countryId: CountryId;
      sequentialId: string;
    }
  >();
  {
    const parties = await (
      await getPoliticalPartiesCollection(db)
    )
      .find({}, { projection: { _id: 1, sequentialId: 1, countryId: 1, treasury: 1, name: 1 } })
      .toArray();
    for (const party of parties) {
      partiesByKey.set(`${party.countryId ?? "US"}:${party.sequentialId}`, {
        _id: party._id,
        treasury: Number.isFinite(party.treasury) ? (party.treasury as number) : 0,
        name: party.name,
        countryId: (party.countryId ?? "US") as CountryId,
        sequentialId: String(party.sequentialId),
      });
    }
  }

  // World-state signals for the v3+ brain. Three fixed queries, resolved from
  // in-memory maps inside the per-NPP loop — never a round trip per NPP.
  let signalLookup: NppSignalLookup | null = null;
  if (econActive) {
    signalLookup = await buildNppSignalLookup(db, currentTurn, econScopeCountries, partiesByKey);
  }

  // Query NPPs with at least 1 action point. Technocrat NPPs (e.g.
  // autonomous central-bank chairs) are excluded via isTechnocrat: { $ne: true }
  // — they hold non-political office and don't take campaign actions.
  // `policies` is ~30KB of the ~31KB NPP document (94%), and nothing in this
  // phase reads it. Without the projection the turn deserializes roughly 50MB
  // of policy positions per pass and throws them away: BSON decode plus the
  // garbage collecting of it measured as 44% of a singleplayer turn's CPU,
  // against under 8% for all game logic combined. Typed as the projected shape
  // so nothing downstream can assume a field that is no longer fetched.
  const cursor = db
    .collection<NppWithoutPolicies>("npps")
    .find(
      { retiredAt: null, actionPoints: { $gte: 1 }, isTechnocrat: { $ne: true } },
      { projection: { policies: 0 } }
    );

  const nppOps: {
    updateOne: {
      filter: { _id: ObjectId };
      update: object;
    };
  }[] = [];

  // Engine 6.2 (v6): candidate rallies, flushed in one write after the loop.
  const rallyOps: NppRallyWrite[] = [];

  for await (const npp of cursor) {
    if (actsThisTurn && !actsThisTurn(npp._id)) continue;
    result.nppsProcessed++;

    // Use finite guard: ?? only catches null/undefined, not NaN
    const finite = (v: number | undefined | null) => (Number.isFinite(v) ? (v as number) : 0);
    const homeRate = rateForCountry(npp.countryId ?? "US");
    const hasOffice = npp.currentOffice !== null && npp.currentOffice !== undefined;

    // Mutable per-cycle state, decremented as each action fires. decideNppAction's gating
    // compares against ANCHOR-denominated NPP_FUND_COSTS, so track funds in anchor and
    // convert each spend back to local for the $inc on npp.funds.
    let apRemaining = finite(npp.actionPoints);
    let fundsAnchorRemaining = finite(npp.funds) / homeRate;
    let donorBaseLevel = finite(npp.donorBaseLevel);

    // Accumulated deltas → one write per NPP.
    let apSpent = 0;
    let fundSpentLocal = 0;
    // Funds-poor fallback (fundraise) credits rather than spends; kept separate from
    // fundSpentLocal so the final $inc nets gains against spends in one write.
    let fundGainedLocal = 0;
    let nCampaign = 0;
    let nAdvertise = 0;
    let nBuild = 0;
    let donationFundLocal = 0;
    let actionsThisCycle = 0;
    // Running favorability so each advertise in the cycle is taxed against the
    // updated value, exactly like a player firing several ads in a row.
    let favAccrued = finite(npp.favorability);
    // Running political influence so each campaign in the cycle both gains
    // AND costs against the updated value — campaignInfluenceGain's diminishing
    // return and getNppCampaignApCost/getNppCampaignFundCost's escalating tier
    // both key off the CURRENT influence, exactly like the player's own
    // Campaign action and like favAccrued above for advertise.
    let piAccrued = finite(npp.politicalInfluence);

    // Deterministic per-NPP, per-cycle RNG: replaces Math.random in the action
    // AI so turns are replay-safe and headless sims are reproducible. Keyed on
    // the stable sequentialId (not the bootstrap-random _id) so identical seed
    // presets reproduce the same action stream.
    const actionRng = makeSeededRng(
      `npp-action:${npp.sequentialId ?? npp._id.toString()}:${npp.countryId ?? "US"}:${currentTurn}${NPP_ACTION_RNG_SALT}`
    );

    // v3+: archetype-weighted priorities, honoring the country scope (at v3 only
    // NPPs in non-player countries get them). undefined ⇒ no-op below v3.
    const inEconScope = !econScopeSet || econScopeSet.has((npp.countryId ?? "US") as CountryId);
    const v3Brain = econActive && inEconScope;

    // Archetype → continuous blend (so ambition 51 and ambition 99 stop being the
    // same politician) → this NPP's own persistent quirks.
    const nppKey = String(npp.sequentialId ?? npp._id.toString());
    const idiosyncrasy = v3Brain
      ? applyNppIdiosyncrasy(
          careerArchetypeModifiersContinuous(npp.personality),
          nppKey,
          currentTurn
        )
      : null;
    const careerModifiers = idiosyncrasy?.modifiers;
    const signals = v3Brain && signalLookup ? signalLookup.signalsFor(npp) : undefined;

    // Carried across the cycle so an NPP follows through on what they started
    // rather than re-rolling independently four times.
    let lastAction: "buildDonorBase" | "campaign" | "advertise" | "partyDonation" | undefined;
    let rallied = false;

    while (actionsThisCycle < NPP_ACTIONS_PER_CYCLE) {
      const decision = decideNppAction(
        {
          hasOffice,
          personality: npp.personality,
          funds: fundsAnchorRemaining,
          actionPoints: apRemaining,
          donorBaseLevel,
          favorability: favAccrued,
          politicalInfluence: piAccrued,
        },
        actionRng,
        careerModifiers,
        signals
          ? {
              signals,
              lastAction,
              temperatureMult: idiosyncrasy?.temperatureMult,
              fundsReserve: fundsReserveAnchor,
            }
          : fundsReserveAnchor > 0
            ? { fundsReserve: fundsReserveAnchor }
            : undefined
      );

      // "none" covers no-affordable-action and the save heuristic — end the cycle.
      if (decision.action === "none") break;

      // Funds-poor fallback: AP-only cost, funds GAIN rather than spend, and no entry
      // in NPP_ACTION_COSTS/NPP_FUND_COSTS (it isn't one of the priority-weighted
      // actions — decideNppAction only ever returns it as a last resort). Handled
      // before the cost-table lookups below, which don't know this action exists.
      // lastAction is deliberately left untouched: fundraise sits outside the
      // priority/commitment-bonus mechanism entirely.
      if (decision.action === "fundraise") {
        if (apRemaining < FUNDRAISE_AP_COST) break; // defensive re-guard, same as below
        apRemaining -= FUNDRAISE_AP_COST;
        apSpent += FUNDRAISE_AP_COST;
        fundsAnchorRemaining += FUNDRAISE_FUNDS_ANCHOR_GAIN;
        fundGainedLocal += FUNDRAISE_FUNDS_ANCHOR_GAIN * homeRate;
        result.fundraise++;
        actionsThisCycle++;
        result.actionsExecuted++;
        continue;
      }

      const action = decision.action;
      const apCost = getApCost(action, donorBaseLevel, piAccrued);
      const fundCostAnchor = getFundCost(action, donorBaseLevel, piAccrued);

      // Defensive re-guard: decideNppAction already gates affordability, but never let a
      // rounding/edge case push AP or funds negative.
      if (apRemaining < apCost || fundsAnchorRemaining < fundCostAnchor) break;

      const fundCostLocal = fundCostAnchor * homeRate;
      apRemaining -= apCost;
      fundsAnchorRemaining -= fundCostAnchor;
      apSpent += apCost;
      fundSpentLocal += fundCostLocal;

      switch (action) {
        case "buildDonorBase":
          nBuild++;
          donorBaseLevel++; // next iteration's cost uses the new level
          result.buildDonorBase++;
          break;
        case "campaign": {
          // v6: the cycle's first campaign action by a running NPP rallies its
          // race instead of raising general influence (turn/npp/nppRally.ts).
          const rally = staggered && !rallied ? planNppRally(signals?.race, currentTurn) : null;
          if (rally) {
            rallyOps.push(rally);
            rallied = true;
            result.rallies++;
          } else {
            piAccrued = Math.min(100, piAccrued + campaignInfluenceGain(piAccrued));
          }
          nCampaign++;
          result.campaign++;
          break;
        }
        case "advertise":
          favAccrued = Math.min(100, favAccrued + advertiseFavorabilityGain(favAccrued));
          nAdvertise++;
          result.advertise++;
          break;
        case "partyDonation":
          donationFundLocal += fundCostLocal;
          result.partyDonation++;
          break;
      }

      lastAction = action;
      actionsThisCycle++;
      result.actionsExecuted++;
    }

    if (actionsThisCycle === 0) {
      result.skipped++;
      continue;
    }

    // NPP actions run at full player effectiveness: campaign +1 influence per
    // action with the same >50% diminishing returns players get (accrued
    // sequentially above via piAccrued), advertise +3 favorability per action
    // with the same >70% diminishing returns (accrued sequentially via
    // favAccrued). Both are already clamped at 100 per action.
    const setUpdate: Record<string, number> = {};
    if (nCampaign > 0) {
      setUpdate.politicalInfluence = piAccrued;
    }
    if (nAdvertise > 0) {
      setUpdate.favorability = favAccrued;
    }
    if (nBuild > 0) {
      setUpdate.donorBaseLevel = donorBaseLevel; // start + nBuild
    }

    // Campaign/economy wall: post-spend campaign surplus STAYS in `funds` (the
    // political war chest). It is deliberately NOT swept into personal savings
    // or any real-economy account — campaign money never becomes personal
    // wealth. NPP personal/investment capital is the separate GDP-income-fed
    // `nppInvestmentCashAnchor` (see nppEconomicAccount.ts / index-fund cron).
    const incUpdate: Record<string, number> = {
      actionPoints: -apSpent,
      funds: fundGainedLocal - fundSpentLocal,
    };
    const update: { $inc: Record<string, number>; $set?: Record<string, number> } = {
      $inc: incUpdate,
    };
    if (Object.keys(setUpdate).length > 0) update.$set = setUpdate;

    nppOps.push({ updateOne: { filter: { _id: npp._id }, update } });

    // Accumulate party-donation funds (local) for the treasury flush below.
    if (donationFundLocal > 0 && npp.party !== "independent") {
      const nppCountryId = npp.countryId ?? "US";
      const existingKey = `${nppCountryId}:${npp.party}`;
      const existing = partyTreasuryUpdates.get(existingKey);
      if (existing) {
        existing.amount += donationFundLocal;
      } else {
        // Store countryId and sequentialId for later party lookup
        partyTreasuryUpdates.set(existingKey, { amount: donationFundLocal, _id: npp._id });
      }
    }
  }

  // Flush NPP updates
  if (nppOps.length > 0) {
    await (await getNppsCollection(db)).bulkWrite(nppOps);
  }
  if (rallyOps.length > 0) {
    await db.collection<ElectionCandidate>("electionCandidates").bulkWrite(rallyOps, {
      ordered: false,
    });
  }

  // Update party treasuries. Keys are composite "countryId:sequentialId"
  // (e.g. "US:4", "UK:2") and resolve against the map loaded before the loop —
  // this used to be a second `politicalParties` query built from an `$or` of
  // every touched pair.
  if (partyTreasuryUpdates.size > 0) {
    const partyOps = [...partyTreasuryUpdates.entries()]
      .map(([compositeKey, entry]) => {
        const party = partiesByKey.get(compositeKey);
        if (!party) return null;
        return {
          updateOne: {
            filter: { _id: party._id },
            update: { $inc: { treasury: entry.amount } },
          },
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (partyOps.length > 0) {
      await (await getPoliticalPartiesCollection(db)).bulkWrite(partyOps);

      const txEntries: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = [];
      for (const [compositeKey, entry] of partyTreasuryUpdates) {
        const party = partiesByKey.get(compositeKey);
        if (!party || entry.amount <= 0) continue;
        txEntries.push({
          type: "party_dues_received",
          turn: currentTurn,
          createdAt: new Date(),
          subjectType: "party",
          subjectId: party._id,
          subjectName: party.name,
          amount: entry.amount,
          currencyCode: (COUNTRY_CURRENCY_MAP[party.countryId] ?? "USD") as CurrencyCode,
          counterpartyType: "system",
          counterpartyName: "NPP party donation",
          meta: {
            scope: "national",
            partyId: party.sequentialId,
            source: "npp_party_donation",
          },
        });
      }
      if (txEntries.length > 0) {
        const thresholds = await loadTxThresholds(db);
        await emitTxBulk(db, txEntries, thresholds);
      }
    }
  }

  step.mark("actions");
  if (econActive) {
    // The two per-NPP buy sweeps follow the NPP's lane at v6. The other three
    // iterate corporations, party organisations and a capped founding pool
    // rather than NPPs, so they stay on the shared cycle turn.
    // At v6 all three trade on opportunity rather than a flat roll; see
    // v6/rules/opportunityInvesting.ts.
    await investNppBondSurplus(
      db,
      currentTurn,
      econScopeCountries,
      preset,
      actsThisTurn,
      staggered
    );
    step.mark("bondInvesting");
    await investNppStockSurplus(
      db,
      currentTurn,
      econScopeCountries,
      preset,
      actsThisTurn,
      staggered
    );
    step.mark("stockInvesting");
    if (!cycleTurn) return result;
    await sellNppStockSurplus(db, currentTurn, econScopeCountries, preset, staggered);
    step.mark("stockSelling");
    await buildNppPartyOrgSurplus(db, currentTurn, econScopeCountries);
    step.mark("partyOrgBuilding");
    await foundNppCorporationsSurplus(db, currentTurn, econScopeCountries, preset);
    step.mark("corporationFounding");
  }

  return result;
}

/**
 * v3 bond-investment sweep — decision-loop wiring for nppBuyBond (the command
 * core existed and was tested since the initial finance-vertical work, but
 * nothing autonomous ever called it; found via the headless sim harness that
 * bond holdings stayed at zero across every real run). Runs after the main
 * batched action cycle (so it sees this cycle's post-spend savings, not stale
 * pre-cycle values) and uses nppBuyBond directly rather than folding into the
 * batched $inc — a bond purchase touches the shared, finite public float on a
 * SEPARATE collection and needs nppBuyBond's own atomic
 * deduct-then-reserve-with-refund protection, unlike the savings sweep (a
 * same-document balance move that's safe to fold into the batch).
 */
export async function investNppBondSurplus(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null = null,
  preset?: string,
  actsThisTurn?: (id: ObjectId) => boolean,
  engine6 = false
): Promise<void> {
  if (engine6) {
    return investNppBondSurplusV6(db, currentTurn, countryScope, preset, actsThisTurn);
  }
  // Investment capital is the personal forex account (₳), NOT campaign funds
  // and NOT savings — the full campaign/economy wall.
  const cursor = (await getNppsCollection(db)).find(
    {
      retiredAt: null,
      nppInvestmentCashAnchor: { $gt: NPP_BOND_INVEST_RESERVE_FLOOR },
      ...countryScopeFilter(countryScope),
    },
    { projection: { countryId: 1, personality: 1, nppInvestmentCashAnchor: 1 } }
  );

  const bondsByCountry = new Map<CountryId, Bond[]>();
  const rng = makeSeededRng(`npp-bond-invest:${currentTurn}${NPP_ACTION_RNG_SALT}`);
  const fxByCcy = await loadFxRatesByCurrency(db);

  for await (const npp of cursor) {
    // Before any RNG draw, so a skipped NPP leaves the stream to the ones acting.
    if (actsThisTurn && !actsThisTurn(npp._id)) continue;
    const countryId = (npp.countryId ?? "US") as CountryId;
    const homeCurrency = preset
      ? getSeedCurrencyCode(countryId, preset)
      : (COUNTRY_CURRENCY_MAP[countryId] ?? "USD");
    const cashAnchor = npp.nppInvestmentCashAnchor ?? 0;
    if (cashAnchor <= NPP_BOND_INVEST_RESERVE_FLOOR) continue;

    const { riskToleranceMult, saveInvestAppetiteMult } = careerArchetypeModifiersContinuous(
      npp.personality
    );
    if (rng() >= NPP_BOND_INVEST_BASE_PROBABILITY * riskToleranceMult) continue;

    if (!bondsByCountry.has(countryId)) {
      const bonds = await db
        .collection<Bond>("bonds")
        .find(
          { countryId, maturityTurn: { $gt: currentTurn }, publicFloat: { $gt: 0 } },
          {
            projection: {
              currencyCode: 1,
              countryId: 1,
              publicFloat: 1,
              marketPrice: 1,
              couponRate: 1,
              maturityTurn: 1,
              issuerType: 1,
              defaulted: 1,
              issuerName: 1,
            },
          }
        )
        .sort({ couponRate: -1 })
        .toArray();
      bondsByCountry.set(countryId, bonds);
    }
    // Sample from the top few by current yield, weighted by yield and sharpened
    // by risk tolerance so a cautious NPP is likelier to take the safe obvious
    // pick and an aggressive one reaches further down the list.
    const scoredBonds = bondCandidates(bondsByCountry.get(countryId)!, countryId, homeCurrency);
    if (scoredBonds.length === 0) continue;

    // Nothing worth buying — capital simply stays put. An NPP declining to
    // invest is a decision, and it is the one that stops them from mechanically
    // buying whatever is least bad every single cycle.
    if (scoredBonds[0].yield < NPP_BOND_MIN_YIELD_PCT) continue;

    const bond =
      scoredBonds[
        pickIndexByWeight(
          scoredBonds.map((s) => Math.pow(s.yield, riskToleranceMult)),
          rng()
        )
      ].bond;

    const homeRate = fxByCcy.get(homeCurrency) ?? 1;
    const units = bondBuyUnits(cashAnchor, saveInvestAppetiteMult, homeRate, bond);
    if (units < 1) continue;

    // nppBuyBond debits nppInvestmentCashAnchor atomically (guarded); a failed
    // float race leaves the ₳ untouched — no plumbing move needed here anymore.
    const result = await nppBuyBond(db, npp, bond._id, units, currentTurn, homeRate, bond, preset);
    if (result.ok) {
      bond.publicFloat -= units;
    }
  }
}

/**
 * v3 stock-investment sweep — the individual-share-purchase counterpart to
 * `investNppBondSurplus`, using the same command-core-then-sweep shape
 * (`nppBuyShares`, built the same way `nppBuyBond` was). Runs after the bond
 * sweep so both can spend from the same cycle's post-spend savings without
 * double-counting (sequential passes over the same document).
 */
export async function investNppStockSurplus(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null = null,
  preset?: string,
  actsThisTurn?: (id: ObjectId) => boolean,
  engine6 = false,
  /** Currency partitions settled at once at v6; tests compare 1 against the default. */
  partitionConcurrency = NPP_SWEEP_PARTITION_CONCURRENCY
): Promise<void> {
  if (engine6) {
    return investNppStockSurplusV6(
      db,
      currentTurn,
      countryScope,
      preset,
      actsThisTurn,
      partitionConcurrency
    );
  }
  void currentTurn; // kept for signature symmetry with the bond sweep; not needed by nppBuyShares.

  const cursor = (await getNppsCollection(db)).find(
    {
      retiredAt: null,
      nppInvestmentCashAnchor: { $gt: NPP_STOCK_INVEST_RESERVE_FLOOR },
      ...countryScopeFilter(countryScope),
    },
    { projection: { countryId: 1, personality: 1, nppInvestmentCashAnchor: 1 } }
  );

  const corpsByCountry = new Map<CountryId, StockCandidateCorp[]>();
  const rng = makeSeededRng(`npp-stock-invest:${currentTurn}${NPP_ACTION_RNG_SALT}`);
  const fxByCcy = await loadFxRatesByCurrency(db);

  for await (const npp of cursor) {
    // Before any RNG draw, so a skipped NPP leaves the stream to the ones acting.
    if (actsThisTurn && !actsThisTurn(npp._id)) continue;
    const countryId = (npp.countryId ?? "US") as CountryId;
    const homeCurrency = preset
      ? getSeedCurrencyCode(countryId, preset)
      : (COUNTRY_CURRENCY_MAP[countryId] ?? "USD");
    const cashAnchor = npp.nppInvestmentCashAnchor ?? 0;
    if (cashAnchor <= NPP_STOCK_INVEST_RESERVE_FLOOR) continue;

    const { riskToleranceMult, saveInvestAppetiteMult } = careerArchetypeModifiersContinuous(
      npp.personality
    );
    if (rng() >= NPP_STOCK_INVEST_BASE_PROBABILITY * riskToleranceMult) continue;

    if (!corpsByCountry.has(countryId)) {
      const corps = await db
        .collection<Corporation>("corporations")
        .find(
          {
            countryId,
            isPrivate: { $ne: true },
            hiddenFromExchange: { $ne: true },
            isNationalized: { $ne: true },
            countryOwnerId: { $exists: false },
            sharePrice: { $gt: 0 },
            totalShares: { $gt: 0 },
            publicFloat: { $gt: 0 },
          },
          {
            projection: {
              liquidCurrencyCode: 1,
              countryId: 1,
              isPrivate: 1,
              isNationalized: 1,
              countryOwnerId: 1,
              sharePrice: 1,
              fundamentalSharePrice: 1,
              totalShares: 1,
              publicFloat: 1,
              shareBuybackMode: 1,
            },
          }
        )
        .toArray();
      corps.sort((a, b) => b.sharePrice * b.totalShares - a.sharePrice * a.totalShares);
      corpsByCountry.set(countryId, corps);
    }
    // Selection used to be `.find(first match)` on a market-cap-sorted list —
    // i.e. every NPP in the country bought the single largest corp, forever.
    // Now: take the top N by size, score each on a value signal
    // (fundamentalSharePrice ÷ execution price, already projected above and
    // previously unused), and sample. Risk-tolerant NPPs weight size and chase
    // momentum; cautious ones weight the discount and refuse to overpay.
    const scoredCorps = stockCandidates(
      corpsByCountry.get(countryId)!,
      homeCurrency,
      riskToleranceMult
    );
    // Nothing listed, or everything on offer is overvalued for this NPP's
    // taste: hold the cash.
    if (scoredCorps.length === 0) continue;

    const chosen = scoredCorps[pickStockCandidate(scoredCorps, riskToleranceMult, rng())];
    const corp = chosen.corp;

    const homeRate = fxByCcy.get(homeCurrency) ?? 1;
    const shares = stockBuyShares(cashAnchor, saveInvestAppetiteMult, homeRate, chosen);
    if (shares < 1) continue;

    // nppBuyShares debits nppInvestmentCashAnchor atomically (guarded); a failed
    // float race leaves the ₳ untouched — no plumbing move needed here anymore.
    const result = await nppBuyShares(db, npp, corp._id, shares, homeRate, corp, preset);
    if (result.ok) {
      corp.publicFloat = (corp.publicFloat ?? 0) - shares;
    }
  }
}
