import { reserveExchangeQuote } from "@/lib/centralBank/rules/reserveExchange";
// POST /api/country/[code]/central-bank/reserve-exchange - Convert central-bank reserve balances between currencies.
// Auth: requireAuth
// Errors: 400, 401, 403, 404

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, badRequest, forbidden, notFound, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isSameCountry } from "@/lib/api/sameCountry";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { FOREX_ACTIVE_CURRENCIES, ZOD_ACTIVE_CURRENCY_ENUM } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import type { Character } from "@/lib/db/types";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

interface RouteContext {
  params: Promise<{ code: string }>;
}

const exchangeSchema = z.object({
  fromCurrency: z.enum(ZOD_ACTIVE_CURRENCY_ENUM),
  toCurrency: z.enum(ZOD_ACTIVE_CURRENCY_ENUM),
  amount: z.number().finite().positive().max(1_000_000_000_000_000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const rateLimit = checkRateLimit(
      `api/country/[code]/central-bank/reserve-exchange:${auth.user.userId}`,
      20,
      60_000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { code } = await context.params;
    const rawCountryId = code.toUpperCase();
    if (!(rawCountryId in COUNTRY_CONFIGS)) throw badRequest("Invalid country code");
    const countryId = rawCountryId as CountryId;

    const parsed = await parseJsonBody(request, exchangeSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { fromCurrency, toCurrency } = parsed.data;
    const amount = Math.floor(parsed.data.amount);
    if (fromCurrency === toCurrency) throw badRequest("Choose two different currencies");
    if (amount <= 0) throw badRequest("Amount must be at least 1");
    if (
      !FOREX_ACTIVE_CURRENCIES.includes(fromCurrency) ||
      !FOREX_ACTIVE_CURRENCIES.includes(toCurrency)
    ) {
      throw badRequest("Currency is not active for forex");
    }

    const myChar = auth.user.character as Character | null;
    const isAdmin = auth.user.isAdmin === true;
    if (!myChar) throw forbidden("Character required");

    const db = await getDb();
    const bankId = getBankId(countryId);
    const bank = await centralBanksCollection(db).findOne({ _id: bankId });
    if (!bank) throw notFound("Central bank not found");

    const isChair = !!bank.chairCharacterId && myChar._id.equals(bank.chairCharacterId);
    if (isChair && !isSameCountry(myChar, { countryId })) {
      throw forbidden("Chair must be a citizen of this country");
    }
    if (!isAdmin && !isChair) {
      throw forbidden("Only the current chair can exchange central-bank reserves");
    }
    if (!isAdmin && bank.chairControlsLocked === true) {
      throw forbidden("Chair controls are locked by an administrator");
    }

    const currentBalance = bank.spreadFeeReserveBalances?.[fromCurrency] ?? 0;
    if (!Number.isFinite(currentBalance) || currentBalance < amount) {
      throw badRequest(`Insufficient ${fromCurrency} reserve balance`);
    }

    const rates = await exchangeRatesCollection(db)
      .find({ $or: [{ currencyCode: { $in: [fromCurrency, toCurrency] } }, { _id: bankId }] })
      .toArray();
    const rateByCurrency = new Map(rates.map((rate) => [rate.currencyCode, rate.rate]));
    const fromRate = rateByCurrency.get(fromCurrency);
    const toRate = rateByCurrency.get(toCurrency);
    if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) {
      throw badRequest("Exchange rate is unavailable for one or both currencies");
    }

    const homeRate = rates.find((rate) => rate._id === bankId)?.rate;
    const quote = reserveExchangeQuote(amount, fromRate, toRate, homeRate ?? NaN);
    if (!quote)
      throw badRequest("Exchange amount or home-currency quote is unavailable at current rates");
    const { receivedAmount, revenueHome } = quote;

    const result = await centralBanksCollection(db).updateOne(
      {
        _id: bankId,
        [`spreadFeeReserveBalances.${fromCurrency}`]: { $gte: amount },
        ...(!isAdmin ? { chairCharacterId: myChar._id, chairControlsLocked: { $ne: true } } : {}),
      },
      {
        $inc: {
          [`spreadFeeReserveBalances.${fromCurrency}`]: -amount,
          [`spreadFeeReserveBalances.${toCurrency}`]: receivedAmount,
          forexRevenue: revenueHome,
        },
        $set: { updatedAt: new Date() },
      }
    );
    if (result.matchedCount === 0) throw badRequest(`Insufficient ${fromCurrency} reserve balance`);

    return NextResponse.json({
      success: true,
      fromCurrency,
      toCurrency,
      spentAmount: amount,
      receivedAmount,
      rate: quote.rate,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
