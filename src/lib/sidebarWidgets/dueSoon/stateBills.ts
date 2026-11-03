import type { StateBill } from "@/lib/db/types/stateBill";
import {
  getRegionalExecutiveOfficeKey,
  getSubNationalLegislatureKey,
} from "@/lib/constants/countryClientConfig";
import type { DueSoonContext, DueSoonItem, PlayerSeat } from "./types";

const BILL_LIMIT = 50;

type Role = "legislator" | "executive";

function regionalRole(seat: PlayerSeat): Role | null {
  if (!seat.countryId || !seat.state) return null;
  if (seat.officeType === getSubNationalLegislatureKey(seat.countryId)) return "legislator";
  if (seat.officeType === getRegionalExecutiveOfficeKey(seat.countryId)) return "executive";
  return null;
}

/** The open deadline in the unit the source keeps, or null once it has passed. */
function closesAt(
  dueTurn: number | undefined,
  dueAt: Date | undefined,
  ctx: DueSoonContext
): Pick<DueSoonItem, "dueTurn" | "dueAt"> | null {
  if (typeof dueTurn === "number") {
    return ctx.currentTurn < dueTurn ? { dueTurn, dueAt: null } : null;
  }
  if (dueAt instanceof Date && dueAt.getTime() > ctx.now.getTime()) {
    return { dueTurn: null, dueAt: dueAt.toISOString() };
  }
  return null;
}

function stateBillHref(bill: Pick<StateBill, "_id" | "stateId">, countryId: string): string {
  return `/country/${countryId.toLowerCase()}/region/${bill.stateId.toLowerCase()}/legislature/bills/${bill._id.toString()}`;
}

/**
 * Regional bills waiting on the player: floor and override votes for members
 * of the regional legislature, and signature or veto for the regional chief
 * executive. Only seats the player holds in person count.
 */
export async function stateBillActions(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const roles = new Map<string, { countryId: string; stateId: string; roles: Set<Role> }>();
  for (const seat of ctx.seats) {
    const role = regionalRole(seat);
    if (!role) continue;
    const stateId = seat.state!.toUpperCase();
    const entry = roles.get(stateId) ?? { countryId: seat.countryId!, stateId, roles: new Set() };
    entry.roles.add(role);
    roles.set(stateId, entry);
  }
  if (roles.size === 0) return [];

  const statuses = new Set<StateBill["status"]>();
  for (const entry of roles.values()) {
    if (entry.roles.has("legislator")) statuses.add("active").add("veto_override");
    if (entry.roles.has("executive")) statuses.add("passed");
  }
  const bills = await ctx.db
    .collection<StateBill>("stateBills")
    .find(
      { status: { $in: [...statuses] }, stateId: { $in: [...roles.keys()] } },
      {
        projection: {
          stateId: 1,
          countryId: 1,
          title: 1,
          status: 1,
          votingEndsOnTurn: 1,
          votingEndsAt: 1,
          overrideVotingEndsOnTurn: 1,
          governorActionDeadline: 1,
          [`votes.${ctx.charKey}`]: 1,
          [`overrideVotes.${ctx.charKey}`]: 1,
        },
      }
    )
    .limit(BILL_LIMIT)
    .toArray();

  const items: DueSoonItem[] = [];
  for (const bill of bills) {
    const entry = roles.get(bill.stateId);
    if (!entry || (bill.countryId && bill.countryId !== entry.countryId)) continue;
    let kind: DueSoonItem["kind"];
    let dueTurn: number | undefined;
    let dueAt: Date | undefined;
    if (bill.status === "active" && entry.roles.has("legislator")) {
      if (bill.votes?.[ctx.charKey]) continue;
      kind = "stateBillVote";
      // Bills from a governor's queue only carry the date.
      dueTurn = bill.votingEndsOnTurn;
      dueAt = bill.votingEndsAt;
    } else if (bill.status === "veto_override" && entry.roles.has("legislator")) {
      if (bill.overrideVotes?.[ctx.charKey]) continue;
      kind = "stateOverrideVote";
      dueTurn = bill.overrideVotingEndsOnTurn;
    } else if (bill.status === "passed" && entry.roles.has("executive")) {
      // The governor's window is stored as a date only.
      kind = "stateBillSign";
      dueAt = bill.governorActionDeadline;
    } else {
      continue;
    }
    const deadline = closesAt(dueTurn, dueAt, ctx);
    if (!deadline) continue;
    items.push({
      kind,
      id: `stateBill:${bill._id.toString()}`,
      subject: bill.title,
      href: stateBillHref(bill, entry.countryId),
      ...deadline,
    });
  }
  return items;
}
