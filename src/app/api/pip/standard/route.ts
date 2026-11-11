import { loadNationalGdpPerCapita } from "@/lib/campaigns/nationalGdpBasis";
import { loadCampaignPriceLevel } from "@/lib/campaigns/campaignCurrency";
import { notificationTypeFilter } from "@/lib/notifications/visibility";
// GET /api/pip/standard — Returns decay projections, income summary, and recent notifications for the Standard PiP view.
// Auth: requireAuth
// Errors: 401, 404
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { calculateFullFundDistribution } from "@/lib/utils/fundGeneration";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { unionContributionIncomePerTurn } from "@/lib/unions/unionContributionIncome";
import {
  projectInfluenceDecay,
  projectFavorabilityDecay,
  projectInfamyDecay,
} from "@/lib/utils/decayProjections";
import type { User, Notification, PoliticalParty, State, StatePartyOrg } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { usersCollection } from "@/lib/db/repositories/users";
import { notificationsCollection } from "@/lib/db/repositories/notifications";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const character = await charactersCollection(db).findOne({
      userId: new ObjectId(auth.user.userId),
    });
    if (!character) {
      return errorResponse(404, "Character not found");
    }

    const userId = new ObjectId(auth.user.userId);
    const user = await usersCollection(db).findOne(
      { _id: userId },
      { projection: { notificationPreferences: 1 } }
    );
    const visibility = notificationTypeFilter(user?.notificationPreferences, new Date());

    const [
      homeState,
      party,
      statePartyOrg,
      recentNotifications,
      unreadCount,
      unreadMailCount,
      unionContribution,
    ] = await Promise.all([
      character.homeState
        ? statesCollection(db).findOne({ _id: character.homeState, countryId: character.countryId })
        : null,
      character.party && Number.isFinite(Number(character.party))
        ? politicalPartiesCollection(db).findOne({
            sequentialId: Number(character.party),
            countryId: character.countryId,
          })
        : null,
      character.party
        ? statePartyOrgCollection(db).findOne({
            stateId: character.homeState,
            partyId: character.party,
          })
        : null,
      notificationsCollection(db)
        .find({ userId, ...visibility, read: false })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray(),
      notificationsCollection(db).countDocuments({ userId, ...visibility, read: false }),
      db
        .collection("playerMail")
        .countDocuments({ toUserId: userId, read: false, deletedByRecipient: false }),
      unionContributionIncomePerTurn(db, character._id),
    ]);

    const pi = character.politicalInfluence ?? 0;
    const fav = character.favorability ?? 50;
    const infamy = character.infamy ?? 0;

    // GDP-baseline era for income math: the world's reset preset, so
    // historical worlds project in their own denomination (issue #798).
    const preset = await getGameStatePresetOrDefault(db);
    const fundDistribution = calculateFullFundDistribution(
      homeState?.population ?? 1_000_000,
      character.donorBaseLevel ?? 0,
      character.currentOffice,
      statePartyOrg?.stateTaxRate ?? 0,
      party?.nationalTaxRate ?? 0,
      homeState?.gdp,
      character.countryId,
      undefined,
      preset,
      await loadCampaignPriceLevel(db),
      homeState?.gdp === undefined
        ? undefined
        : await loadNationalGdpPerCapita(db, character.countryId ?? "US")
    );

    return NextResponse.json(
      {
        decay: {
          pi: projectInfluenceDecay(pi),
          fav: projectFavorabilityDecay(fav),
          infamy: projectInfamyDecay(infamy),
        },
        income: {
          netPerTurn: fundDistribution.characterReceives + unionContribution,
          base: fundDistribution.baseGeneration,
          donorBonus: fundDistribution.donorBaseBonus,
          officeBonus: fundDistribution.officeBonus,
          unionContribution,
          stateTax: fundDistribution.stateTaxAmount,
          nationalTax: fundDistribution.nationalTaxAmount,
        },
        notifications: {
          unreadCount,
          unreadMailCount: user?.notificationPreferences?.muteMail ? 0 : unreadMailCount,
          recent: recentNotifications.map((n) => ({
            id: n._id.toString(),
            message: n.message,
            type: n.type,
            createdAt:
              n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
          })),
        },
      },
      { headers: { "Cache-Control": "private, max-age=30, no-transform" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
