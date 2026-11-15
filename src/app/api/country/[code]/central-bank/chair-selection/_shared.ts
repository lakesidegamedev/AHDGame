import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { forbidden, notFound, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { Character } from "@/lib/db/types";
import { getGameState } from "@/lib/gameState";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCentralBankScope } from "@/lib/centralBank/helpers";

export type ChairSelectionContext =
  | { ok: false; response: Response }
  | { ok: true; db: Db; countryId: CountryId; character: Character; currentTurn: number };

/** Auth, rate limit and central-bank membership check shared by accept and decline. */
export async function loadChairSelectionContext(
  action: "accept" | "decline",
  params: Promise<{ code: string }>
): Promise<ChairSelectionContext> {
  const authResult = await requireAuthWithCharacter();
  if (!authResult.ok) return { ok: false, response: authResult.response };

  const rateLimit = checkRateLimit(
    `api/country/[code]/central-bank/chair-selection/${action}:${authResult.user.userId}`,
    15,
    60000
  );
  if (!rateLimit.ok) return { ok: false, response: rateLimitResponse(rateLimit.retryAfter) };

  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) {
    return {
      ok: false,
      response: NextResponse.json(notFound("Country not found").toJson(), { status: 404 }),
    };
  }

  const db = await getDb();
  const { memberCountries } = await getCentralBankScope(db, countryId);
  const character = authResult.user.character as Character;
  if (!memberCountries.includes(character.countryId as CountryId)) {
    return { ok: false, response: NextResponse.json(forbidden().toJson(), { status: 403 }) };
  }
  const gameState = await getGameState();
  const currentTurn = gameState?.currentTurn ?? 0;

  return { ok: true, db, countryId, character, currentTurn };
}

/** Map a failed chair-selection command to its HTTP error. */
export function chairSelectionError(msg: string): Response {
  if (msg.includes("not the pending")) {
    return errorResponse(403, msg);
  }
  return errorResponse(400, msg);
}
