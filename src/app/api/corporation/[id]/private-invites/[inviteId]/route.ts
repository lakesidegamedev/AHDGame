import { validPrivateShareOffer } from "@/lib/corporations/rules/privateShareOffer";
import { withRecordedEconomicCommand } from "@/lib/api/withRecordedEconomicCommand";
import { afterCommit } from "@/lib/db/sessionDb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
/**
 * Single-invite actions:
 *  POST /api/corporation/[id]/private-invites/[inviteId]
 *    { action: "accept" | "decline" | "cancel" }
 *
 *  - accept: invitee pays cash (atomically) and receives the shares; corp gets cash.
 *  - decline: invitee passes; invite is closed.
 *  - cancel: CEO retracts an outstanding invite.
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { getLegalStructureForCorp } from "@/lib/corporations/legalStructure";
import { creditShares } from "@/lib/corporations/shareholderOps";
import { atomicallyDebitCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import {
  getCorpFxRate,
  corpLiquidCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { createNotification } from "@/lib/notifications";
import { emitTx } from "@/lib/financialTxLog/emit";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { usersCollection } from "@/lib/db/repositories/users";
import { corporationShareInvitesCollection } from "@/lib/db/repositories/corporationShareInvites";

const actionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
});

interface RouteParams {
  params: Promise<{ id: string; inviteId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id, inviteId } = await params;
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { action } = parsed.data;

    if (!ObjectId.isValid(inviteId)) {
      return errorResponse(400, "Invalid inviteId");
    }
    const inviteOid = new ObjectId(inviteId);

    const sourceDb = await getDb();
    return await withRecordedEconomicCommand(
      sourceDb,
      "private-share-invite",
      auth.user.userId,
      `${inviteId}:${action}`,
      { id, inviteId, action },
      async (db) => {
        const resolved = await resolveCorporation(db, id);
        if (!resolved.ok) return resolved.response;
        const { corporation } = resolved;

        const invite = await corporationShareInvitesCollection(db).findOne({
          _id: inviteOid,
          corporationId: corporation._id,
        });
        if (!invite) {
          return errorResponse(404, "Invite not found");
        }
        if (invite.status !== "pending") {
          return errorResponse(409, `Invite is already ${invite.status}`);
        }
        const now = new Date();
        if (invite.expiresAt <= now) {
          // Lazy-mark expired
          await corporationShareInvitesCollection(db).updateOne(
            { _id: inviteOid },
            { $set: { status: "expired", updatedAt: now } }
          );
          return errorResponse(410, "Invite has expired");
        }

        if (action === "cancel") {
          const ceoCheck = requireCeo(corporation, auth.user);
          if (ceoCheck) return ceoCheck;
          await corporationShareInvitesCollection(db).updateOne(
            { _id: inviteOid, status: "pending" },
            { $set: { status: "cancelled", cancelledAt: now, updatedAt: now } }
          );
          const invitee = await charactersCollection(db).findOne({
            _id: invite.invitedCharacterId,
          });
          if (invitee) {
            await afterCommit(db, () =>
              createNotification({
                userId: invitee.userId,
                type: "share_invite_cancelled",
                title: `Share offer from ${corporation.name} cancelled`,
                message: `The ${invite.shares.toLocaleString()}-share offer was withdrawn before you could respond.`,
                metadata: {
                  corporationId: corporation._id.toString(),
                  inviteId: invite._id.toString(),
                },
              }).catch(() => {})
            );
          }
          return NextResponse.json({ success: true });
        }

        // decline / accept: caller must be the invitee.
        const userDoc = await usersCollection(db).findOne({ _id: new ObjectId(auth.user.userId) });
        const callerCharacterId = userDoc?.activeCharacterId;
        if (!callerCharacterId || !callerCharacterId.equals(invite.invitedCharacterId)) {
          return errorResponse(403, "Only the invitee can accept or decline");
        }

        if (action === "decline") {
          await corporationShareInvitesCollection(db).updateOne(
            { _id: inviteOid, status: "pending" },
            { $set: { status: "declined", declinedAt: now, updatedAt: now } }
          );
          const ceoId = corporation.ceoId;
          if (ceoId) {
            const ceo = await charactersCollection(db).findOne({ _id: ceoId });
            if (ceo) {
              await afterCommit(db, () =>
                createNotification({
                  userId: ceo.userId,
                  type: "share_invite_declined",
                  title: `${invite.invitedCharacterName} declined your share offer`,
                  message: `${invite.invitedCharacterName} declined the ${invite.shares.toLocaleString()}-share offer in ${corporation.name}.`,
                  metadata: {
                    corporationId: corporation._id.toString(),
                    inviteId: invite._id.toString(),
                  },
                }).catch(() => {})
              );
            }
          }
          return NextResponse.json({ success: true });
        }

        // action === "accept": atomic flow — re-check cap and unissued capacity,
        // debit invitee cash, credit shares, credit corp liquidCapital.
        const invitee = await charactersCollection(db).findOne({ _id: invite.invitedCharacterId });
        if (!invitee) {
          return errorResponse(404, "Invitee character not found");
        }

        const legalStructure = getLegalStructureForCorp(corporation);
        if (!corporation.isPrivate)
          return errorResponse(409, "This corporation is no longer private.");
        if (!validPrivateShareOffer(invite)) {
          return errorResponse(409, "The share offer has invalid price or quantity details.");
        }
        const issued =
          (corporation.shareholders ?? []).reduce(
            (sum, sh) => sum + Math.max(0, sh.shares ?? 0),
            0
          ) + (corporation.publicFloat ?? 0);
        if (invite.shares > (corporation.totalShares ?? 0) - issued)
          return errorResponse(
            409,
            "The corporation no longer has enough unissued shares for this offer."
          );
        const alreadyHoldsShares = (corporation.shareholders ?? []).some(
          (sh) => sh.characterId?.equals(invitee._id) && sh.shares > 0
        );
        const maxShareholders = legalStructure.maxShareholders ?? 1;
        const currentShareholders = (corporation.shareholders ?? []).filter(
          (sh) => (sh.shares ?? 0) > 0
        ).length;
        if (currentShareholders + (alreadyHoldsShares ? 0 : 1) > maxShareholders) {
          return errorResponse(
            409,
            `Shareholder cap of ${maxShareholders} has been reached since the invite was sent.`
          );
        }

        const state = await gameStateCollection(db).findOne(
          { _id: "current" },
          { projection: { preset: 1 } }
        );
        const homeCurrency = getHomeCurrency(invitee, state?.preset);
        const corpCurrency = resolveCorpLiquidCurrencyCode(corporation);
        if (invite.currencyCode !== corpCurrency)
          return errorResponse(
            409,
            "The offer must be reissued in the corporation's current currency."
          );
        if (homeCurrency !== corpCurrency) {
          return errorResponse(
            400,
            `Cross-currency private placements aren't supported yet. Your wallet is ${homeCurrency} but the offer is denominated in ${corpCurrency}.`
          );
        }

        // Claim the invite before any money moves: a double-submit or an
        // accept-vs-cancel race must fail here, not debit twice and miss an
        // unchecked post-facto status write.
        const inviteClaim = await corporationShareInvitesCollection(db).updateOne(
          { _id: inviteOid, status: "pending" },
          { $set: { status: "accepted", acceptedAt: now, updatedAt: now } }
        );
        if (inviteClaim.modifiedCount === 0) {
          return errorResponse(409, "Invite is no longer pending");
        }

        const forexEnabled = await isForexEnabled();
        const debitResult = await atomicallyDebitCharacterCash(
          db,
          invitee._id,
          homeCurrency,
          invite.totalCost,
          forexEnabled
        );
        if (!debitResult.ok) {
          return errorResponse(
            400,
            `Insufficient funds. Need ${invite.totalCost.toLocaleString()} ${homeCurrency}.`
          );
        }

        const purchaseTurn = await getCurrentTurn(db);
        const basisAnchor = corpLiquidCapitalToAnchor(
          invite.totalCost,
          corporation,
          await getCorpFxRate(db, corporation)
        );
        const credited = await creditShares(
          db,
          corporation._id,
          invitee._id,
          invite.shares,
          {
            $inc: { liquidCapital: invite.totalCost },
            $set: { updatedAt: now },
          },
          { pricePerShare: basisAnchor / invite.shares, holdingChange: { turn: purchaseTurn } }
        );
        if (!credited)
          return errorResponse(409, "Could not credit the offered shares. Refresh and try again.");

        await emitTx(db, {
          type: "stock_trade_buy",
          turn: await getCurrentTurn(db),
          createdAt: now,
          subjectType: "character",
          subjectId: invitee._id,
          subjectName: invitee.name,
          amount: -invite.totalCost,
          balanceAfter: debitResult.newBalance,
          currencyCode: homeCurrency,
          counterpartyType: "corporation",
          counterpartyId: corporation._id,
          counterpartyName: corporation.name,
          meta: {
            privatePlacement: true,
            inviteId: invite._id.toString(),
            shares: invite.shares,
            pricePerShare: invite.pricePerShare,
          },
        });

        if (corporation.ceoId) {
          const ceo = await charactersCollection(db).findOne({ _id: corporation.ceoId });
          if (ceo) {
            await afterCommit(db, () =>
              createNotification({
                userId: ceo.userId,
                type: "share_invite_accepted",
                title: `${invitee.name} accepted your share offer`,
                message: `${invitee.name} purchased ${invite.shares.toLocaleString()} shares of ${corporation.name} for ${invite.currencyCode} ${invite.totalCost.toLocaleString()}.`,
                metadata: {
                  corporationId: corporation._id.toString(),
                  inviteId: invite._id.toString(),
                },
              }).catch(() => {})
            );
          }
        }

        return NextResponse.json({
          success: true,
          shares: invite.shares,
          totalCost: invite.totalCost,
        });
      }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
