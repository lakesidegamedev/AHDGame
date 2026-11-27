// POST /api/character/loc/open — Open an LOC account bucket for a currency (forex + admin flag)
// Auth: requireBasicAuth
// Errors: 400, 401, 404, 429

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, badRequest, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse, SAVINGS_WALLET_LIMITS } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { z } from "zod";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { isLineOfCreditEnabled } from "@/lib/lineOfCredit/featureFlag";
import { getGameState } from "@/lib/gameState";
import { insertLocLedgerEntry } from "@/lib/lineOfCredit/ledger";
import { ZOD_ACTIVE_CURRENCY_ENUM } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { charactersCollection } from "@/lib/db/repositories/characters";

const openSchema = z.object({
  currency: z.enum(ZOD_ACTIVE_CURRENCY_ENUM),
});

export async function POST(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/character/loc/open:${auth.user.userId}`,
      SAVINGS_WALLET_LIMITS.maxRequests,
      SAVINGS_WALLET_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, openSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { currency } = parsed.data;
    const c = currency as CurrencyCode;

    const baseDb = await getDb();
    return await withAtomicEconomicCommand(baseDb, async (db) => {
      const [forexEnabled, locEnabled] = await Promise.all([
        isForexEnabled(),
        isLineOfCreditEnabled(),
      ]);

      if (!locEnabled) {
        return errorResponse(404, "Line of credit is not available");
      }
      const character = await getCharacterByUserId(db, auth.user.userId);
      if (!character) {
        return NextResponse.json(badRequest("Character not found").toJson(), { status: 400 });
      }

      // Cross-border lending is allowed: opening a JPY LOC means the player is
      // borrowing yen at the Bank of Japan, even if their home country is the US.
      // Forex must be on so we have FX rates to value the loan in internal units.
      if (!forexEnabled) {
        return NextResponse.json(badRequest("Line of credit requires the forex system").toJson(), {
          status: 400,
        });
      }

      const loc = character.lineOfCredit ?? {
        balances: {},
        arrears: {},
      };
      if (loc.accountsOpened?.[c]) {
        return NextResponse.json(
          badRequest("LOC account already open for this currency").toJson(),
          {
            status: 400,
          }
        );
      }

      const now = new Date();
      const opened = await charactersCollection(db).updateOne(
        {
          _id: character._id,
          pendingLocSettlement: { $exists: false },
          [`lineOfCredit.accountsOpened.${c}`]: { $ne: true },
        },
        [
          {
            $set: {
              lineOfCredit: {
                $mergeObjects: [
                  { balances: {}, arrears: {} },
                  { $ifNull: ["$lineOfCredit", {}] },
                  {
                    accountsOpened: {
                      $mergeObjects: [
                        { $ifNull: ["$lineOfCredit.accountsOpened", {}] },
                        { [c]: true },
                      ],
                    },
                  },
                ],
              },
              lineOfCreditRevision: { $add: [{ $ifNull: ["$lineOfCreditRevision", 0] }, 1] },
              updatedAt: now,
            },
          },
        ]
      );
      if (opened.matchedCount !== 1)
        return errorResponse(409, "Credit account is busy or already open; refresh and retry");

      const gameState = await getGameState(db);
      const turn = gameState?.currentTurn ?? 0;
      const after = await charactersCollection(db).findOne({ _id: character._id });
      if (after?.lineOfCredit) {
        await insertLocLedgerEntry(db, {
          characterId: character._id,
          currencyCode: c,
          type: "open",
          amount: 0,
          balanceAfter: after.lineOfCredit.balances?.[c] ?? 0,
          arrearsAfter: after.lineOfCredit.arrears?.[c] ?? 0,
          turn,
        });
      }

      return NextResponse.json({ success: true, currency: c });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
