import type { Db } from "mongodb";
import type { Bill, BillStatus } from "@/lib/db/types/legislation";
import type { ElectedOfficial } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { loadRuntimeCountryOffices } from "@/lib/countries/runtimeOffices";
import { getVotingUpperChamberKey } from "@/lib/countries/rules/officeLayout";
import {
  getChamberKeyForOfficeType,
  getOfficeTypeForChamber,
} from "@/lib/legislature/chamberOfficeType";
import { resolveBillVoteField } from "@/lib/congress/billVoteField";
import { loadViewerCharacter, loadWidgetGameState, turnsUntil } from "./viewerContext";

export type FloorVote = "for" | "against" | "abstain";

export interface FloorBill {
  id: string;
  title: string;
  vote: FloorVote | null;
  /** Turns until this chamber's vote closes; null when unknown. */
  turnsLeft: number | null;
}

export interface ChamberFloorWidgetData {
  countryId: CountryId;
  chamber: string;
  bills: FloorBill[];
  /** Open bills in this chamber, including any past the shown limit. */
  total: number;
}

/** Statuses a seated member can vote on, matching the national bill vote command. */
const FLOOR_STATUSES: BillStatus[] = ["active", "active_other", "active_both", "override_shugiin"];
const SCAN_LIMIT = 30;
const SHOWN = 6;

/**
 * Bills open for a vote in the viewer's own national chamber and how they
 * voted on each. Null when the viewer holds no voting seat.
 */
export async function loadChamberFloor(
  db: Db,
  viewer: { userId: string }
): Promise<ChamberFloorWidgetData | null> {
  const character = await loadViewerCharacter(db, viewer);
  if (!character) return null;
  const countryId = character.countryId;
  const gameState = await loadWidgetGameState(db, viewer);
  const preset = gameState?.preset;
  const { config } = await loadRuntimeCountryOffices(db, countryId, preset);
  const lower = config.legislature.lowerChamber;
  if (lower.elected === false || lower.seats < 1) return null;
  const upperKey = getVotingUpperChamberKey(config);
  const chamberKeys = upperKey ? [lower.key, upperKey] : [lower.key];
  const officeTypes = chamberKeys.map((key) =>
    getOfficeTypeForChamber(countryId, key, preset, config)
  );

  const seat = await db
    .collection<ElectedOfficial>("electedOfficials")
    .findOne(
      { characterId: character._id, officeType: { $in: officeTypes }, countryId },
      { projection: { officeType: 1 } }
    );
  if (!seat) return null;
  const myChamber = getChamberKeyForOfficeType(countryId, seat.officeType, preset, config);
  const chamberName =
    myChamber === lower.key
      ? (lower.shortName ?? lower.name)
      : (config.legislature.upperChamber?.shortName ?? config.legislature.upperChamber?.name);

  const key = character._id.toString();
  const bills = await db
    .collection<Bill>("bills")
    .find(
      { countryId, status: { $in: FLOOR_STATUSES } },
      {
        projection: {
          title: 1,
          status: 1,
          currentChamber: 1,
          votingEndsOnTurn: 1,
          otherChamberVotingEndsOnTurn: 1,
          [`votes.${key}`]: 1,
          [`otherChamberVotes.${key}`]: 1,
        },
      }
    )
    .sort({ proposedAt: -1 })
    .limit(SCAN_LIMIT)
    .toArray();

  const onMyFloor: FloorBill[] = [];
  for (const bill of bills) {
    const field = resolveBillVoteField(bill, {
      voterOfficeType: seat.officeType,
      lowerOfficeType: officeTypes[0],
    });
    if (bill.status !== "active_both") {
      const chamber = bill.currentChamber === "joint" ? lower.key : bill.currentChamber;
      if (chamber !== myChamber) continue;
    }
    const other = field === "otherChamberVotes";
    onMyFloor.push({
      id: bill._id.toString(),
      title: bill.title,
      vote: (other ? bill.otherChamberVotes : bill.votes)?.[key] ?? null,
      turnsLeft: turnsUntil(
        other ? bill.otherChamberVotingEndsOnTurn : bill.votingEndsOnTurn,
        gameState?.currentTurn
      ),
    });
  }
  // Bills still waiting on the viewer first, then the soonest to close.
  onMyFloor.sort(
    (a, b) =>
      Number(a.vote !== null) - Number(b.vote !== null) ||
      (a.turnsLeft ?? Infinity) - (b.turnsLeft ?? Infinity)
  );
  return {
    countryId,
    chamber: chamberName ?? "",
    bills: onMyFloor.slice(0, SHOWN),
    total: onMyFloor.length,
  };
}
