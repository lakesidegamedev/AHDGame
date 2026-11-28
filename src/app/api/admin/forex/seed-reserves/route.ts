import { reserveSeedSpreadSample } from "@/lib/centralBank/rules/reserveSeedSpreads";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { afterCommit } from "@/lib/db/sessionDb";
import { logger } from "@/lib/observability/logger";
// POST /api/admin/forex/seed-reserves — One-shot seeding of CB reserves for launch
// Auth: requireAdmin
// Errors: 400, 403
// Idempotent: countries with a non-zero reserveBalance are skipped.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { withAuditedGrant } from "@/lib/audit/grants/recordGrant";
import { createAdminLog } from "@/lib/adminLog";
import { FOREX_ACTIVE_COUNTRIES, COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { getBankId } from "@/lib/centralBank/helpers";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { tradeHistoryCollection } from "@/lib/db/repositories/tradeHistory";

/** Flat fallback reserves when the country has insufficient trade/LOC history to derive an estimate.
 *  Values are in home-currency face units — same unit as reserveBalance. */
const FALLBACK_RESERVE_SEED: Partial<Record<CountryId, number>> = {
  US: 5_000_000_000,
  UK: 3_000_000_000,
  JP: 500_000_000_000,
  DE: 3_000_000_000,
  // NG has no forex trade history yet (currency just enabled), so it always
  // falls back. ~2T naira ≈ 1.3B USD at the 1550 starting rate — a mid-size
  // emerging-market war chest for the CBN to defend the band. Tune as needed.
  NG: 2_000_000_000_000,
};

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    return await withAtomicEconomicCommand(db, async (db) => {
      const seeded: Record<string, number> = {};
      const excludedSpreadTrades: Record<string, number> = {};
      const skipped: string[] = [];
      await withAuditedGrant(
        db,
        {
          actorUserId: auth.admin.userId,
          recipients: FOREX_ACTIVE_COUNTRIES.map((countryId) => ({
            type: "country" as const,
            id: countryId,
          })),
          kind: "treasury",
          item: "central bank FX reserve seed",
          reason: "Control panel: seed central bank FX reserves",
        },
        async () => {
          const now = new Date();

          for (const countryId of FOREX_ACTIVE_COUNTRIES) {
            // getBankId: DE's bank doc is the shared "ECB" — a raw countryId lookup
            // returned null and silently skipped seeding the EUR reserve entirely.
            const bankId = getBankId(countryId);
            const bank = await centralBanksCollection(db).findOne({ _id: bankId });
            if (!bank) continue;
            if ((bank.reserveBalance ?? 0) > 0) {
              skipped.push(countryId);
              continue;
            }

            // Seed = 6 × avg_turn_spread + 12 × projected_LOC_interest (recent 48 turns).
            // Fallback to FALLBACK_RESERVE_SEED when trade history is sparse.
            const currencyCode = COUNTRY_CURRENCY_MAP[countryId];
            const recentTrades = await tradeHistoryCollection(db)
              .find({
                $or: [{ fromCurrency: currencyCode }, { toCurrency: currencyCode }],
              })
              .sort({ turn: -1 })
              .limit(500)
              .toArray();

            let seedAmount = FALLBACK_RESERVE_SEED[countryId] ?? 0;
            if (recentTrades.length >= 48) {
              const sample = reserveSeedSpreadSample(recentTrades, currencyCode);
              const totalSpread = sample.spread;
              if (sample.excluded > 0) excludedSpreadTrades[countryId] = sample.excluded;
              const avgTurnSpread = (totalSpread / recentTrades.length) * 48;
              const projectedLocInterest = (bank.reserveBalance ?? 0) * 0.5;
              const derived = 6 * avgTurnSpread + 12 * projectedLocInterest;
              // If the derived value is far below the fallback baseline, keep the
              // fallback so chairs have a real war chest to start with.
              const fallback = FALLBACK_RESERVE_SEED[countryId] ?? 0;
              seedAmount = derived < fallback * 0.5 ? fallback : derived;
            }

            const seededBank = await centralBanksCollection(db).updateOne(
              {
                _id: bankId,
                reserveBalance:
                  bank.reserveBalance === undefined ? { $exists: false } : bank.reserveBalance,
              },
              { $set: { reserveBalance: seedAmount, updatedAt: now } }
            );
            if (seededBank.matchedCount === 1) seeded[countryId] = seedAmount;
            else skipped.push(countryId);
          }
        }
      );

      await afterCommit(db, () =>
        createAdminLog({
          category: "system",
          action: "cb_fx_reserve_seed",
          username: auth.admin.username ?? "unknown",
          adminUsername: auth.admin.username ?? undefined,
          details: `Seeded: ${JSON.stringify(seeded)}. Skipped: ${skipped.join(",") || "none"}`,
        }).catch((error) => {
          logger.error("central-bank-reserves", "Reserve seed admin log failed", error);
        })
      );

      return NextResponse.json({ success: true, seeded, skipped, excludedSpreadTrades });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
