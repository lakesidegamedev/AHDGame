import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import type { Db } from "mongodb";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import type { CountryId } from "@/lib/constants/countries";
import type {
  CrisisDefinition,
  ForcedEventKind,
  ForcedEventThreshold,
} from "@/lib/crises/v2/types";
import { logger } from "@/lib/observability/logger";
import { FAILED_AUCTION_COUNT_FOR_CRISIS } from "@/lib/sovereignDefault/constants";
import { logWireEvent } from "@/lib/wireEvent";
import { applyBankStress, MAX_PANIC_TURNS } from "./intents";

const COMPONENT = "crisisV2ForcedEvents";

export interface ForcedEventScope {
  crisisId: string;
  label: string;
  stateIds: readonly string[];
  countryIds: readonly string[];
  turn: number;
  def: Pick<CrisisDefinition, "affectedSectors">;
}

/** Forced events with a world effect beyond the instance itself. */
const WORLD_EVENTS: ReadonlySet<ForcedEventKind> = new Set([
  "strike",
  "impeachmentMotion",
  "sovereignDefaultPath",
  "bankRun",
]);

async function startStrikes(db: Db, scope: ForcedEventScope): Promise<void> {
  if (scope.stateIds.length === 0) return;
  const sectors = scope.def.affectedSectors;
  await (
    await getCorporateSectorsCollection(db)
  ).updateMany(
    {
      stateId: { $in: [...scope.stateIds] },
      ...(sectors ? { sectorType: { $in: [...sectors] as never[] } } : {}),
      $and: [
        { $or: [{ strikeStartedAtTurn: null }, { strikeStartedAtTurn: { $exists: false } }] },
        {
          $or: [
            { strikeCooldownUntilTurn: null },
            { strikeCooldownUntilTurn: { $exists: false } },
            { strikeCooldownUntilTurn: { $lte: scope.turn } },
          ],
        },
      ],
    },
    {
      $set: { strikeStartedAtTurn: scope.turn },
    }
  );
}

/** Pushes each country one failed auction short of the sovereign default crisis. */
async function openSovereignDefaultPath(db: Db, scope: ForcedEventScope): Promise<void> {
  if (scope.countryIds.length === 0) return;
  await (
    await getFederalBudgetCollection(db)
  ).updateMany(
    {
      _id: { $in: scope.countryIds.map((id) => getNationalBudgetId(id as CountryId)) },
      sovereignCrisisState: { $nin: ["crisisPending", "crisisResolving", "recovering"] },
    },
    {
      $set: { sovereignCrisisState: "warning" },
      $max: { failedAuctionConsecutiveCount: FAILED_AUCTION_COUNT_FOR_CRISIS - 1 },
    }
  );
}

const HEADLINES: Partial<Record<ForcedEventKind, (label: string) => string>> = {
  strike: (label) => `Workers walk out as the ${label.toLowerCase()} deepens.`,
  impeachmentMotion: (label) =>
    `Calls grow in the legislature to hold the government to account over the ${label.toLowerCase()}.`,
  sovereignDefaultPath: (label) => `Lenders warn of default as the ${label.toLowerCase()} deepens.`,
  bankRun: (label) => `Depositors line up at banks as the ${label.toLowerCase()} deepens.`,
};

/**
 * Carries out the forced events a crisis fired this turn. State of emergency
 * lives on the instance and is handled by the turn itself; the rest reach into
 * the system that owns them: sector strikes, the sovereign default state
 * machine and the bank panic path. An impeachment motion needs a sitting
 * legislator to file it, so it is announced as pressure and left to them.
 * Each event is isolated so one failure leaves the rest.
 */
export async function runForcedEvents(
  db: Db,
  fired: readonly ForcedEventThreshold[],
  scope: ForcedEventScope
): Promise<number> {
  let done = 0;
  for (const threshold of fired) {
    if (!WORLD_EVENTS.has(threshold.event)) continue;
    try {
      switch (threshold.event) {
        case "strike":
          await startStrikes(db, scope);
          break;
        case "sovereignDefaultPath":
          await openSovereignDefaultPath(db, scope);
          break;
        case "bankRun":
          await applyBankStress(db, MAX_PANIC_TURNS, [...scope.countryIds]);
          break;
        default:
          break;
      }
      const headline = HEADLINES[threshold.event]?.(scope.label);
      if (headline) {
        await logWireEvent("crisis_outcome", headline, { href: `/world/crises/${scope.crisisId}` });
      }
      done += 1;
    } catch (error) {
      logger.error(COMPONENT, "forced event failed", error, {
        crisisId: scope.crisisId,
        event: threshold.event,
      });
    }
  }
  return done;
}
