// POST /api/admin/forex/[currencyId]/nudge
// Sets the exchange rate once; normal drift resumes next turn.
// Body: { rate: number }
// Auth: requireAdmin
// Errors: 400, 403, 404

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { invalidateCorpFxRateCache } from "@/lib/currency/corporationCapital";
import { afterCommit } from "@/lib/db/sessionDb";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

const schema = z.object({ rate: z.number().positive() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ currencyId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { currencyId } = await params;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    return await withAtomicEconomicCommand(db, async (transactionDb) => {
      const quote = await exchangeRatesCollection(transactionDb).findOne({ _id: currencyId });
      if (!quote) throw notFound("Currency not found");
      await exchangeRatesCollection(transactionDb).updateMany(
        { currencyCode: quote.currencyCode },
        { $set: { rate: parsed.data.rate, updatedAt: new Date() } }
      );
      await afterCommit(transactionDb, () => invalidateCorpFxRateCache(db));
      return NextResponse.json({ success: true });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
