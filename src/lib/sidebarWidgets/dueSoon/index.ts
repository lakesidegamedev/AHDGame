import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { Character } from "@/lib/db/types/character";
import type { ElectedOfficial } from "@/lib/db/types/officials";
import { getGameStateCore } from "@/lib/gameState";
import { nationalBillVotes, presidentialBillActions } from "./nationalBills";
import { stateBillActions } from "./stateBills";
import { confirmationVotes, partyBallots } from "./politics";
import { corporateVotes } from "./corporate";
import type { DueSoonContext, DueSoonItem, DueSoonSource, DueSoonWidgetData } from "./types";

export const DUE_SOON_LIMIT = 8;
const HOUR_MS = 3_600_000;

const SOURCES: DueSoonSource[] = [
  nationalBillVotes,
  presidentialBillActions,
  stateBillActions,
  confirmationVotes,
  partyBallots,
  corporateVotes,
];

/** Hours until the item closes; one turn is one hour. Unknown deadlines sort last. */
function hoursLeft(item: DueSoonItem, ctx: Pick<DueSoonContext, "currentTurn" | "now">): number {
  if (item.dueTurn !== null) return item.dueTurn - ctx.currentTurn;
  if (item.dueAt !== null) return (Date.parse(item.dueAt) - ctx.now.getTime()) / HOUR_MS;
  return Number.POSITIVE_INFINITY;
}

/** Runs every source, isolating failures, and keeps the soonest rows. */
export async function collectDueSoon(
  ctx: DueSoonContext,
  sources: DueSoonSource[] = SOURCES
): Promise<DueSoonWidgetData> {
  const settled = await Promise.allSettled(sources.map((source) => source(ctx)));
  const seen = new Set<string>();
  const items = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => !seen.has(item.id) && !!seen.add(item.id))
    .sort((a, b) => hoursLeft(a, ctx) - hoursLeft(b, ctx) || a.subject.localeCompare(b.subject));
  return {
    currentTurn: ctx.currentTurn,
    asOf: ctx.now.toISOString(),
    total: items.length,
    items: items.slice(0, DUE_SOON_LIMIT),
  };
}

/** Everything waiting on the viewer's active character. Null without one. */
export async function loadDueSoon(db: Db, userId: string): Promise<DueSoonWidgetData | null> {
  const user = await db
    .collection<User>("users")
    .findOne(
      { _id: new ObjectId(userId) },
      { projection: { activeCharacterId: 1, activeCharacterType: 1, createdAt: 1 } }
    );
  if (!user?.activeCharacterId || user.activeCharacterType === "imperial") return null;
  const characterId = user.activeCharacterId;
  const [character, game, seats] = await Promise.all([
    db.collection<Character>("characters").findOne(
      { _id: characterId },
      {
        projection: {
          countryId: 1,
          party: 1,
          homeState: 1,
          partyJoinedTurn: 1,
          foundedPartyId: 1,
          createdAt: 1,
        },
      }
    ),
    getGameStateCore(db),
    db
      .collection<ElectedOfficial>("electedOfficials")
      .find(
        { characterId, isNPP: { $ne: true } },
        { projection: { officeType: 1, countryId: 1, state: 1, seatsHeld: 1 } }
      )
      .limit(20)
      .toArray(),
  ]);
  if (!character) return null;
  return collectDueSoon({
    db,
    characterId,
    charKey: characterId.toString(),
    countryId: character.countryId ?? null,
    currentTurn: game?.currentTurn ?? 0,
    preset: game?.preset,
    now: new Date(),
    seats,
    member: {
      party: character.party,
      homeState: character.homeState,
      partyJoinedTurn: character.partyJoinedTurn,
      foundedPartyId: character.foundedPartyId,
      createdAt: character.createdAt,
      userCreatedAt: user.createdAt,
    },
  });
}
