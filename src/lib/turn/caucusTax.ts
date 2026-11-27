import { withSessionDb } from "@/lib/db/sessionDb";
import * as Sentry from "@sentry/nextjs";
/**
 * Per-turn caucus tax pass.
 *
 * Each active caucus with `taxRate > 0` levies that percentage against every
 * active member's campaign funds and deposits the total into the caucus
 * treasury. Mirrors the existing `nationalTaxRate` / `stateTaxRate` flows
 * already running in the turn loop, just scoped to caucus membership.
 */
import { loadCampaignPriceLevel } from "@/lib/campaigns/campaignCurrency";

import { loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";

import { getDb } from "@/lib/mongodb";
import type { Character, NPP } from "@/lib/db/types";
import { getCampaignCurrency } from "@/lib/campaigns/campaignCurrency";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { loadTxThresholds, emitTxBulk } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { projectCharacterGeneration, projectNppGeneration } from "@/lib/utils/fundGeneration";
import { getStatesCollection } from "@/lib/db/collections/states";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { isLiveWorldSwitchOn } from "@/lib/gameConfig/liveWorldSwitches";
import { campaignAnchorToLocal, campaignLocalRate } from "@/lib/campaigns/campaignCurrency";
import {
  campaignGdpPerCapitaIndex,
  requireNationalGdpPerCapita,
} from "@/lib/campaigns/rules/gdpBaseline";
import type { ObjectId } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { caucusesCollection } from "@/lib/db/repositories/caucuses";
import { caucusMembershipsCollection } from "@/lib/db/repositories/caucusMemberships";

interface CaucusTaxResult {
  caucusesProcessed: number;
  membersTaxed: number;
  totalTaxed: number;
}

/**
 * Apply the per-turn caucus tax. Reads forexEnabled to decide which currency
 * field each player member's funds live in — same semantics as the existing
 * party-level tax pass.
 *
 * Returns a small summary used for the TurnLog entry. Does NOT throw on
 * partial failure; missing characters / missing NPPs are skipped silently so
 * one bad row doesn't kill the whole pass.
 */
export async function processCaucusTax(
  forexEnabled: boolean,
  turnNumber: number
): Promise<CaucusTaxResult> {
  const db = await getDb();
  const campaignRates = await loadCampaignCurrencyRates(db);
  const priceLevel = await loadCampaignPriceLevel(db);
  // GDP-baseline era for income math: the world's reset preset, so historical
  // worlds tax against their own denomination (issue #798).
  const preset = await getGameStatePresetOrDefault(db);
  const nationalGdpIndex = campaignGdpPerCapitaIndex(
    await (
      await getStatesCollection(db)
    )
      .find({}, { projection: { countryId: 1, gdp: 1, population: 1 } })
      .toArray(),
    { live: await isLiveWorldSwitchOn(db, "campaignLiveGdpBasisEnabled"), preset }
  );

  const taxedCaucuses = await caucusesCollection(db)
    .find({ disbandedAt: null, taxRate: { $gt: 0 } })
    .toArray();
  if (taxedCaucuses.length === 0) {
    return { caucusesProcessed: 0, membersTaxed: 0, totalTaxed: 0 };
  }

  let membersTaxed = 0,
    totalTaxed = 0;
  const now = new Date();
  for (const candidate of taxedCaucuses) {
    try {
      const result = await withSessionDb(db, async (db) => {
        const caucus = await caucusesCollection(db).findOne(
          { _id: candidate._id },
          {
            projection: {
              taxRate: 1,
              lastTaxTurn: 1,
              name: 1,
              countryId: 1,
              partyId: 1,
              disbandedAt: 1,
            },
          }
        );
        if (
          !caucus ||
          caucus.disbandedAt ||
          !(caucus.taxRate > 0) ||
          (caucus.lastTaxTurn ?? -1) >= turnNumber
        )
          return { membersTaxed: 0, totalTaxed: 0 };
        const claim = await caucusesCollection(db).updateOne(
          { _id: caucus._id, lastTaxTurn: { $not: { $gte: turnNumber } } },
          { $set: { lastTaxTurn: turnNumber, updatedAt: now } }
        );
        if (claim.matchedCount !== 1) return { membersTaxed: 0, totalTaxed: 0 };
        let membersTaxed = 0,
          totalTaxed = 0;
        const debitTxEntries: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = [];
        const memberships = await caucusMembershipsCollection(db)
          .find(
            { caucusId: caucus._id, status: "active" },
            { projection: { memberType: 1, memberId: 1 } }
          )
          .toArray();
        if (memberships.length === 0) return { membersTaxed: 0, totalTaxed: 0 };

        const characterIds: ObjectId[] = [];
        const nppIds: ObjectId[] = [];
        for (const m of memberships) {
          if (m.memberType === "character") characterIds.push(m.memberId);
          else if (m.memberType === "npp") nppIds.push(m.memberId);
        }

        const [characters, npps] = await Promise.all([
          characterIds.length
            ? charactersCollection(db)
                .find(
                  { _id: { $in: characterIds } },
                  {
                    projection: {
                      name: 1,
                      countryId: 1,
                      homeState: 1,
                      donorBaseLevel: 1,
                      currentOffice: 1,
                      politicalInfluence: 1,
                      "currencyBalances.campaign": 1,
                      funds: 1,
                    },
                  }
                )
                .toArray()
            : Promise.resolve([] as Character[]),
          nppIds.length
            ? nppsCollection(db)
                // `policies` is ~94% of an NPP document and is not read here.
                .find(
                  { _id: { $in: nppIds } },
                  { projection: { countryId: 1, homeState: 1, donorBaseLevel: 1, funds: 1 } }
                )
                .toArray()
            : Promise.resolve([] as NPP[]),
        ]);
        const homeStateIds = [
          ...new Set([...characters.map((c) => c.homeState), ...npps.map((n) => n.homeState)]),
        ];
        const stateDocs = homeStateIds.length
          ? await statesCollection(db)
              .find(
                { _id: { $in: homeStateIds } },
                { projection: { countryId: 1, population: 1, gdp: 1 } }
              )
              .toArray()
          : [];
        const stateMap = new Map(stateDocs.map((s) => [s._id, s]));

        let caucusInflow = 0;

        // Player members — tax a percentage of per-turn income, not total balance.
        if (characters.length > 0) {
          const pendingDebits: { character: Character; tax: number; field: string }[] = [];
          for (const c of characters) {
            if (c.countryId && c.countryId !== caucus.countryId) continue;
            const state = stateMap.get(c.homeState);
            const incomeAnchor = state
              ? projectCharacterGeneration({
                  population: state.population,
                  donorBaseLevel: c.donorBaseLevel,
                  currentOffice: c.currentOffice,
                  stateGdpMillions: state.gdp,
                  countryId: c.countryId,
                  politicalInfluence: c.politicalInfluence ?? 0,
                  preset,
                  priceLevel,
                  nationalGdpPerCapita: requireNationalGdpPerCapita(
                    nationalGdpIndex,
                    c.countryId ?? "US"
                  ),
                })
              : 0;
            // Generation constants are anchor (₳); campaign funds are stored LOCAL
            // and decoupled from live forex. Denominate income to local at the
            // frozen world-seeded currency basis (US ×1.0), then tax it ; the tax and
            // the debit are both LOCAL home-currency amounts.
            const income = campaignAnchorToLocal(
              incomeAnchor,
              c.countryId ?? "US",
              campaignRates,
              preset
            );
            if (income <= 0) continue;
            const tax = Math.floor((income * caucus.taxRate) / 100);
            if (tax <= 0) continue;
            // Skip members who can't afford the tax. The previous unguarded
            // deduction could push a broke caucus member into negative campaign
            // funds. We deliberately don't credit the caucus treasury for skipped
            // members, so accounting stays consistent. The pre-check must read the
            // SAME field the debit targets (forex-gated), otherwise a stale mirror
            // can pass the check while the guarded debit no-ops.
            const campaignFundsField = forexEnabled ? "currencyBalances.campaign" : "funds";
            const campaignFundsLocal = forexEnabled
              ? (c.currencyBalances?.campaign ?? 0)
              : (c.funds ?? 0);
            if (campaignFundsLocal < tax) continue;
            pendingDebits.push({ character: c, tax, field: campaignFundsField });
          }
          // Apply debits individually (not bulkWrite) so each guarded $gte debit
          // reports whether it landed. The caucus treasury is credited ONLY for
          // debits that actually modified the payer — a raced/failed debit must
          // not mint money into the caucus.
          if (pendingDebits.length > 0) {
            const results = await Promise.all(
              pendingDebits.map((d) =>
                charactersCollection(db).updateOne(
                  { _id: d.character._id, [d.field]: { $gte: d.tax } },
                  {
                    $inc: { [d.field]: -d.tax },
                    $set: { updatedAt: now },
                  }
                )
              )
            );
            for (let i = 0; i < pendingDebits.length; i++) {
              if ((results[i]?.modifiedCount ?? 0) !== 1) continue;
              const d = pendingDebits[i];
              const c = d.character;
              debitTxEntries.push({
                type: "caucus_tax_debit",
                turn: turnNumber,
                createdAt: now,
                subjectType: "character",
                subjectId: c._id,
                subjectName: typeof c.name === "string" ? c.name : String(c._id),
                amount: -d.tax,
                currencyCode: getCampaignCurrency(c.countryId ?? "US", preset),
                counterpartyType: "party",
                counterpartyName: caucus.name,
                meta: { caucusId: String(caucus._id), taxRate: caucus.taxRate },
              });
              caucusInflow += d.tax;
              membersTaxed++;
            }
          }
        }

        // NPP members use the same income-tax basis as player members. Taxing the
        // accumulated funds balance each turn compounds into a rapid wealth drain.
        if (npps.length > 0) {
          const config = await gameConfigCollection(db).findOne(
            { _id: "default" },
            { projection: { nppEconomyEnabled: 1 } }
          );
          const nppDebits: { npp: NPP; tax: number }[] = [];
          for (const n of npps) {
            if (n.countryId && n.countryId !== caucus.countryId) continue;
            const funds = n.funds ?? 0;
            const state = stateMap.get(n.homeState);
            if (!state || funds <= 0) continue;
            const localRate = campaignLocalRate(n.countryId ?? "US", campaignRates, preset);
            const currentFundsAnchor = funds / (localRate * priceLevel);
            const incomeAnchor = projectNppGeneration({
              population: state.population,
              donorBaseLevel: n.donorBaseLevel ?? 0,
              currentFundsLocal: currentFundsAnchor,
              nppEconomyEnabled: config?.nppEconomyEnabled !== false,
            });
            const incomeLocal = campaignAnchorToLocal(
              incomeAnchor * priceLevel,
              n.countryId ?? "US",
              campaignRates,
              preset
            );
            const tax = Math.floor((incomeLocal * caucus.taxRate) / 100);
            if (tax <= 0) continue;
            nppDebits.push({ npp: n, tax });
          }
          if (nppDebits.length > 0) {
            const results = await Promise.all(
              nppDebits.map((d) =>
                nppsCollection(db).updateOne(
                  { _id: d.npp._id, funds: { $gte: d.tax } },
                  {
                    $inc: { funds: -d.tax },
                    $set: { updatedAt: now },
                  }
                )
              )
            );
            for (let i = 0; i < nppDebits.length; i++) {
              if ((results[i]?.modifiedCount ?? 0) !== 1) continue;
              caucusInflow += nppDebits[i].tax;
              membersTaxed++;
            }
          }
        }

        if (caucusInflow > 0) {
          const credit = await caucusesCollection(db).updateOne(
            { _id: caucus._id },
            {
              $inc: { treasury: caucusInflow },
              $set: { updatedAt: now },
            }
          );
          if (credit.matchedCount !== 1) throw new Error("Caucus treasury recipient is missing");
          totalTaxed += caucusInflow;
          await emitTreasuryTransaction({
            db,
            countryId: caucus.countryId,
            partyId: caucus.partyId,
            holderType: "caucus",
            holderId: caucus._id.toString(),
            category: "caucus_tax",
            direction: "credit",
            amount: caucusInflow,
            turn: turnNumber,
            currencyCode: getCampaignCurrency(caucus.countryId, preset),
            memo: `Caucus tax (${caucus.taxRate}%)`,
            now,
          });
        }

        if (debitTxEntries.length) await emitTxBulk(db, debitTxEntries, await loadTxThresholds(db));
        return { membersTaxed, totalTaxed };
      });
      membersTaxed += result.membersTaxed;
      totalTaxed += result.totalTaxed;
    } catch (error) {
      Sentry.captureException(error, {
        extra: { phase: "caucusTax", turn: turnNumber, caucusId: String(candidate._id) },
      });
    }
  }
  return { caucusesProcessed: taxedCaucuses.length, membersTaxed, totalTaxed };
}
