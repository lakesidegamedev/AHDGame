import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { type OperatingSectorType } from "@/lib/constants/corporations";
import { ObjectId, type Db } from "mongodb";
import type { NPP } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CorporationType } from "@/lib/constants/corporations";
import { generateNppCorpName, spawnNppCorporation } from "@/lib/admin/spawnNppCorporation";
import { nppHomeFxRate, localToAnchor } from "./nppEconomicAccount";
import { isPrivateEnterpriseBlocked } from "@/lib/economy/queries/privateEnterpriseGate";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { witnessNppFoundingCash } from "./shareCashLedger";

export type NppFoundCorporationResult =
  | {
      ok: true;
      corporationId: string;
      name: string;
      type: CorporationType;
      foundingFee: number;
      foundingFeeAnchor: number;
      investmentCashAnchor: number;
    }
  | { ok: false; reason: string };

export async function nppFoundCorporation(
  db: Db,
  npp: Pick<NPP, "_id" | "countryId" | "party" | "homeState" | "personality">,
  lane: OperatingSectorType,
  foundingFeeLocal: number,
  currentTurn: number,
  /** Pre-loaded home FX rate (local per ₳); loaded on demand when omitted. */
  homeRate?: number,
  /**
   * Pre-loaded command-economy blocked set (same turn, same source as the
   * sweep's own load); falls back to the on-demand lookup when omitted so
   * every other caller keeps the defence-in-depth check.
   */
  blockedCountries?: ReadonlySet<CountryId>,
  preset?: string,
  /** Recipe for the founding sector; absent builds the standard recipe. */
  initialStrategyId?: string
): Promise<NppFoundCorporationResult> {
  try {
    return await withAtomicResult(db, (tx) =>
      withTurnValueSettlement(
        tx,
        "npp-corporation-founding",
        currentTurn,
        async (inner) =>
          foundInTransaction(
            inner,
            npp,
            lane,
            foundingFeeLocal,
            currentTurn,
            homeRate,
            blockedCountries,
            preset,
            initialStrategyId
          ),
        { sourceKey: `${currentTurn}:${npp._id}` }
      )
    );
  } catch (error) {
    return {
      ok: false,
      reason: `Corporation founding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function foundInTransaction(
  db: Db,
  npp: Pick<NPP, "_id" | "countryId" | "party" | "homeState" | "personality">,
  lane: OperatingSectorType,
  foundingFeeLocal: number,
  currentTurn: number,
  homeRate?: number,
  blockedCountries?: ReadonlySet<CountryId>,
  preset?: string,
  initialStrategyId?: string
): Promise<NppFoundCorporationResult> {
  if (!Number.isFinite(foundingFeeLocal) || foundingFeeLocal <= 0)
    return { ok: false, reason: "Invalid corporation founding fee." };

  if (!npp.homeState) {
    return { ok: false, reason: "NPP has no home state to headquarter a corporation in." };
  }
  const countryId = npp.countryId ?? "US";

  // Defence in depth. `foundNppCorporationsSurplus` already excludes command
  // economies from the candidate pool, but this is a creation path and must not
  // depend on every future caller remembering to filter. Reads the dial, so a
  // country converting either direction is honoured without touching this code.
  const blocked = blockedCountries
    ? blockedCountries.has(countryId as CountryId)
    : await isPrivateEnterpriseBlocked(db, countryId);
  if (blocked) {
    return {
      ok: false,
      reason: "Private corporations cannot be founded in a command economy.",
    };
  }

  const alreadyCeo = await corporationsCollection(db).findOne(
    { ceoId: npp._id, ceoVacant: { $ne: true } },
    { projection: { _id: 1 } }
  );
  if (alreadyCeo) {
    return { ok: false, reason: "NPP already runs a corporation." };
  }

  // Founding is real-economy → charge the personal forex account, not campaign
  // `funds`. Fee is quoted LOCAL; convert at the FX boundary.
  const rate = homeRate ?? (await nppHomeFxRate(db, npp.countryId, undefined, preset));
  if (!Number.isFinite(rate) || rate <= 0)
    return { ok: false, reason: "Founding currency quote is unavailable." };
  const foundingFeeAnchor = localToAnchor(foundingFeeLocal, rate);
  const now = new Date();
  const deducted = await nppsCollection(db).findOneAndUpdate(
    { _id: npp._id, nppInvestmentCashAnchor: { $gte: foundingFeeAnchor } },
    { $inc: { nppInvestmentCashAnchor: -foundingFeeAnchor }, $set: { updatedAt: now } },
    // Only the balance is read back; an NPP document is ~28 KB.
    { returnDocument: "after", projection: { nppInvestmentCashAnchor: 1 } }
  );
  if (!deducted) {
    return { ok: false, reason: "Insufficient investment capital to found a corporation." };
  }

  const name = generateNppCorpName(countryId, lane, []);
  const spawnResult = await spawnNppCorporation(db, {
    name,
    realName: "sector",
    type: lane,
    countryId,
    headquartersState: npp.homeState,
    nppPartyId: npp.party,
    foundedAtTurn: currentTurn,
    ...(initialStrategyId ? { initialStrategyId } : {}),
  });
  await witnessNppFoundingCash(db, npp, foundingFeeAnchor, now);

  const corporationId = new ObjectId(spawnResult.corporationId);
  const autoCeoId = new ObjectId(spawnResult.nppId);

  // Reassign CEO + the auto-selected CEO's stake to the founding NPP, unless
  // the balancer already happened to pick the founder. This renames the
  // existing shareholder entry's holder in place — NOT a debit+credit trade
  // — because the initial CEO stake is a grant with no cost basis
  // (spawnNppCorporation never sets avgCostPerShare on it), and a rename
  // preserves that instead of forcing a price through the trade-basis math
  // creditSharesToNpp/debitSharesFromNpp are built for.
  if (!autoCeoId.equals(npp._id)) {
    const assigned = await corporationsCollection(db).updateOne(
      { _id: corporationId, ceoId: autoCeoId, "shareholders.nppId": autoCeoId },
      {
        $set: {
          "shareholders.$.nppId": npp._id,
          ceoId: npp._id,
          updatedAt: new Date(),
        },
      }
    );
    if (assigned.matchedCount !== 1)
      throw new Error("Founding CEO ownership changed during assignment");
  }

  return {
    ok: true,
    corporationId: spawnResult.corporationId,
    name: spawnResult.name,
    type: lane,
    foundingFee: foundingFeeLocal,
    foundingFeeAnchor,
    investmentCashAnchor: deducted.nppInvestmentCashAnchor ?? 0,
  };
}
