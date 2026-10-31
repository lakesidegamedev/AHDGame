import type { Bill } from "@/lib/db/types/legislation";
import type { CountryId } from "@/lib/constants/countriesCore";
import { loadRuntimeCountryOffices } from "@/lib/countries/runtimeOffices";
import { getVotingUpperChamberKey } from "@/lib/countries/rules/officeLayout";
import { getOfficeTypeForChamber } from "@/lib/legislature/chamberOfficeType";
import type { DueSoonContext, DueSoonItem } from "./types";

/** Statuses where a seated member can still cast a floor vote. */
const VOTING_STATUSES: Bill["status"][] = [
  "active",
  "override_shugiin",
  "active_other",
  "active_both",
  "veto_override",
];
const BILL_LIMIT = 50;

type VoteField = "votes" | "otherChamberVotes" | "vetoOverrideVotes";

/** The map this voter writes into and the turn it closes, or null when they cannot vote. */
export function billVoteSlot(
  bill: Pick<
    Bill,
    | "status"
    | "currentChamber"
    | "votingEndsOnTurn"
    | "otherChamberVotingEndsOnTurn"
    | "overrideVotingEndsOnTurn"
  >,
  chambers: { lowerKey: string; lowerOfficeType: string; chamberOfficeTypes: string[] },
  officeTypeFor: (chamberKey: string) => string,
  seatOfficeTypes: string[]
): { field: VoteField; dueTurn: number | undefined } | null {
  const legislative = seatOfficeTypes.filter((type) => chambers.chamberOfficeTypes.includes(type));
  if (legislative.length === 0) return null;
  switch (bill.status) {
    case "veto_override":
      return { field: "vetoOverrideVotes", dueTurn: bill.overrideVotingEndsOnTurn };
    case "active_both":
      // Each chamber votes into its own map on its own clock.
      return legislative.includes(chambers.lowerOfficeType)
        ? { field: "votes", dueTurn: bill.votingEndsOnTurn }
        : { field: "otherChamberVotes", dueTurn: bill.otherChamberVotingEndsOnTurn };
    case "active":
    case "override_shugiin":
    case "active_other": {
      const chamberKey =
        bill.currentChamber === "joint" ? chambers.lowerKey : String(bill.currentChamber);
      if (!legislative.includes(officeTypeFor(chamberKey))) return null;
      return bill.status === "active_other"
        ? { field: "otherChamberVotes", dueTurn: bill.otherChamberVotingEndsOnTurn }
        : { field: "votes", dueTurn: bill.votingEndsOnTurn };
    }
    default:
      return null;
  }
}

/** National bills open on the floor of a chamber the player sits in, not yet voted. */
export async function nationalBillVotes(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const byCountry = new Map<CountryId, string[]>();
  for (const seat of ctx.seats) {
    if (!seat.countryId) continue;
    byCountry.set(seat.countryId, [...(byCountry.get(seat.countryId) ?? []), seat.officeType]);
  }
  const items: DueSoonItem[] = [];
  for (const [countryId, seatOfficeTypes] of byCountry) {
    const { config } = await loadRuntimeCountryOffices(ctx.db, countryId, ctx.preset);
    // A dissolved legislature cannot act on bills.
    if (
      config.legislature.lowerChamber.elected === false ||
      config.legislature.lowerChamber.seats < 1
    )
      continue;
    const lowerKey = config.legislature.lowerChamber.key;
    const upperKey = getVotingUpperChamberKey(config);
    const officeTypeFor = (key: string) =>
      getOfficeTypeForChamber(countryId, key, ctx.preset, config);
    const chamberOfficeTypes = (upperKey ? [lowerKey, upperKey] : [lowerKey]).map(officeTypeFor);
    if (!seatOfficeTypes.some((type) => chamberOfficeTypes.includes(type))) continue;

    const bills = await ctx.db
      .collection<Bill>("bills")
      .find(
        { countryId, status: { $in: VOTING_STATUSES } },
        {
          projection: {
            title: 1,
            status: 1,
            currentChamber: 1,
            votingEndsOnTurn: 1,
            otherChamberVotingEndsOnTurn: 1,
            overrideVotingEndsOnTurn: 1,
            [`votes.${ctx.charKey}`]: 1,
            [`otherChamberVotes.${ctx.charKey}`]: 1,
            [`vetoOverrideVotes.${ctx.charKey}`]: 1,
          },
        }
      )
      .limit(BILL_LIMIT)
      .toArray();

    for (const bill of bills) {
      const slot = billVoteSlot(
        bill,
        { lowerKey, lowerOfficeType: chamberOfficeTypes[0], chamberOfficeTypes },
        officeTypeFor,
        seatOfficeTypes
      );
      if (!slot || typeof slot.dueTurn !== "number" || ctx.currentTurn >= slot.dueTurn) continue;
      if (bill[slot.field]?.[ctx.charKey]) continue;
      items.push({
        kind: slot.field === "vetoOverrideVotes" ? "overrideVote" : "billVote",
        id: `bill:${bill._id.toString()}`,
        subject: bill.title,
        href: `/congress/bills/${bill._id.toString()}`,
        dueTurn: slot.dueTurn,
        dueAt: null,
      });
    }
  }
  return items;
}

/**
 * Enrolled bills on the desk of a sitting president. Both sign and veto routes
 * accept only the `president` office of the bill's country.
 */
export async function presidentialBillActions(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const countries = [
    ...new Set(
      ctx.seats.flatMap((seat) =>
        seat.officeType === "president" && seat.countryId ? [seat.countryId] : []
      )
    ),
  ];
  if (countries.length === 0) return [];
  const bills = await ctx.db
    .collection<Bill>("bills")
    .find(
      // An enrolled bill held in the Lords is not on anyone's desk.
      { countryId: { $in: countries }, status: "enrolled", currentChamber: { $ne: "lords" } },
      { projection: { title: 1, presidentActionDeadlineOnTurn: 1 } }
    )
    .limit(BILL_LIMIT)
    .toArray();
  return bills.flatMap((bill) => {
    const dueTurn = bill.presidentActionDeadlineOnTurn;
    if (typeof dueTurn !== "number" || ctx.currentTurn >= dueTurn) return [];
    return [
      {
        kind: "billSign" as const,
        id: `bill:${bill._id.toString()}`,
        subject: bill.title,
        href: `/congress/bills/${bill._id.toString()}`,
        dueTurn,
        dueAt: null,
      },
    ];
  });
}
