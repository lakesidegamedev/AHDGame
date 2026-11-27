import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, badRequest, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse, SAVINGS_WALLET_LIMITS } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { z } from "zod";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  getHomeCurrency,
  getSavingsBalance,
  isSavingsAccountOpened,
  buildTransferToSavingsInc,
} from "@/lib/currency/characterFunds";
import { insertSavingsLedgerEntry } from "@/lib/savings/ledger";
import { moveCharacterSavings } from "@/lib/banking/deposits";
import { getCurrentTurn } from "@/lib/currentTurn";
import { withRecordedEconomicCommand } from "@/lib/api/withRecordedEconomicCommand";
import { afterCommit, unboundDb } from "@/lib/db/sessionDb";
import { emitTx } from "@/lib/financialTxLog/emit";
import { normalizeSavingsMutationAmount } from "@/lib/api/savings/savingsAmount";
import { ZOD_ACTIVE_CURRENCY_ENUM } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { runSavingsCommand } from "@/lib/savings/accountsShell";
import { charactersCollection } from "@/lib/db/repositories/characters";

const depositSchema = z.object({
  currency: z.enum(ZOD_ACTIVE_CURRENCY_ENUM),
  amount: z.number(),
  requestId: z.string().min(1).max(100).optional(),
  // Optional: route this currency's savings to a specific bank in the same
  // action (a bank corp id hex, or "centralBank"). Lets a player deposit into a
  // bank straight from its own page. Omitted = balance stays where it is.
  holder: z.string().optional(),
});

// POST /api/character/savings/deposit â€” Move liquid cash into savings for a currency
// Auth: requireBasicAuth
// Errors: 400, 401, 429
export async function POST(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/character/savings/deposit:${auth.user.userId}`,
      SAVINGS_WALLET_LIMITS.maxRequests,
      SAVINGS_WALLET_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, depositSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { currency, amount: rawAmount, holder } = parsed.data;
    const c = currency as CurrencyCode;

    const normalized = normalizeSavingsMutationAmount(rawAmount, c);
    if (normalized === null) {
      return NextResponse.json(badRequest("Invalid amount").toJson(), { status: 400 });
    }

    const sourceDb = await getDb();
    return await withRecordedEconomicCommand(
      sourceDb,
      "savings-deposit",
      auth.user.userId,
      parsed.data.requestId,
      { currency: c, amount: normalized, holder: holder?.trim() ?? "" },
      async (db) => {
        const forexEnabled = await isForexEnabled();

        const character = await getCharacterByUserId(db, auth.user.userId);
        if (!character) {
          return NextResponse.json(badRequest("Character not found").toJson(), { status: 400 });
        }

        if (!forexEnabled && c !== getHomeCurrency(character)) {
          return NextResponse.json(
            badRequest("Foreign-currency savings require the forex system").toJson(),
            { status: 400 }
          );
        }

        if (!isSavingsAccountOpened(character, c)) {
          return NextResponse.json(
            badRequest("Open a savings account for this currency first").toJson(),
            {
              status: 400,
            }
          );
        }

        const now = new Date();
        const inc = buildTransferToSavingsInc(normalized, c, forexEnabled);
        const policy = await loadBankingPolicy(db);
        const accountsAuthoritative = policy.savingsAccounts === "authoritative" && forexEnabled;

        if (accountsAuthoritative) {
          // The account command moves the cash into the holder and keeps the
          // character's legacy fields in step as projections.
          const deposited = await runSavingsCommand(db, character._id, c, {
            type: "deposit",
            amount: normalized,
          });
          if (!deposited.ok) {
            return NextResponse.json(badRequest(deposited.error).toJson(), { status: 400 });
          }
        } else if (forexEnabled) {
          const res = await charactersCollection(db).updateOne(
            {
              _id: character._id,
              [`currencyBalances.personal.${c}`]: { $gte: normalized },
            },
            { $inc: inc, $set: { updatedAt: now } }
          );
          if (res.matchedCount === 0) {
            return NextResponse.json(badRequest("Insufficient liquid balance").toJson(), {
              status: 400,
            });
          }
        } else {
          const res = await charactersCollection(db).updateOne(
            {
              _id: character._id,
              cashOnHand: { $gte: normalized },
            },
            { $inc: inc, $set: { updatedAt: now } }
          );
          if (res.matchedCount === 0) {
            return NextResponse.json(badRequest("Insufficient liquid balance").toJson(), {
              status: 400,
            });
          }
        }

        // Routing and the deposit must share one outcome so a refusal cannot strand funds.
        let holderMove: { ok: boolean; error?: string } | null = null;
        if (holder && holder.trim()) {
          const move = await moveCharacterSavings(db, character._id, c, holder.trim());
          if (!move.ok) return NextResponse.json(badRequest(move.error).toJson(), { status: 400 });
          holderMove = { ok: true };
        }

        const turn = await getCurrentTurn(db);
        const after = await charactersCollection(db).findOne({ _id: character._id });
        if (!after) throw new Error("Savings owner disappeared before the command receipt");
        {
          await insertSavingsLedgerEntry(db, {
            characterId: character._id,
            currencyCode: c,
            type: "deposit",
            amount: normalized,
            balanceAfter: getSavingsBalance(after, c, forexEnabled),
            turn,
          });
        }

        await afterCommit(db, () =>
          emitBankingAuditEvent(
            {
              kind: "account.deposited",
              command: "savings.deposit",
              turn,
              outcome: "ok",
              currency: c,
              subjectType: "character",
              subjectId: character._id.toString(),
              statusAfter:
                (after?.currencyBalances?.savingsHolder?.[c] as string | undefined) ??
                "centralBank",
              amount: normalized,
              meta: { holderRequested: holder?.trim() ? true : false },
            },
            unboundDb(db)
          )
        );

        await emitTx(db, {
          type: "savings_deposit",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: character._id,
          subjectName: character.name,
          amount: normalized,
          currencyCode: c,
        });

        return NextResponse.json({
          success: true,
          currency: c,
          amount: normalized,
          ...(holderMove ? { holderRouted: holderMove.ok, holderError: holderMove.error } : {}),
        });
      }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
