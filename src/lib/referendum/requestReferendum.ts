import { withSessionDb, afterCommit } from "@/lib/db/sessionDb";
/**
 * Domain logic for a regional head of government requesting an independence /
 * reunification referendum for a region in the sovereignty registry. Mirrors the changeDevolutionPolicy contract:
 * validate inputs + eligibility + AP, write the referendum doc, decrement AP,
 * return a thin status/body for the API route.
 *
 * See the independence-process design.
 */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { GovernorOfficeState } from "@/lib/db/types/governorOfficeState";
import type { Referendum, ReferendumKind, ReferendumStatus } from "@/lib/db/types/referendum";
import { getReferendumCollection } from "@/lib/db/collections/referendum";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { REQUEST_AP_COST, referendumRequestEligibility } from "@/lib/constants/referendum";
import { announceReferendumRequested } from "@/lib/referendum/referendumWebhooks";
import { recordWireEvent } from "@/lib/referendum/wire";
import {
  sovereigntyMemberRegionIds,
  sovereigntyRegionIn,
} from "@/lib/referendum/rules/sovereigntyRegions";
import { loadPooledDesire } from "@/lib/referendum/blocMembers";
import { governorOfficeStateCollection } from "@/lib/db/repositories/governorOfficeState";

/** Non-terminal statuses that count as "a referendum is in progress". */
const ACTIVE_STATUSES: ReferendumStatus[] = [
  "requested",
  "granted",
  "campaigning",
  "polling",
  "actuating",
];

/** Terminal statuses whose longest constitutional cooldown supplies the gate. */
const TERMINAL_STATUSES: ReferendumStatus[] = ["declined", "settled", "completed", "cancelled"];

export interface RequestReferendumInput {
  countryId: CountryId;
  stateId: string;
  /** Admin override — bypasses eligibility + AP. Routes must verify the caller. */
  adminOverride?: boolean;
}

export interface RequestReferendumResult {
  status: number;
  body: { error?: string; referendumId?: string; kind?: ReferendumKind };
}

export async function requestReferendum(
  db: Db,
  input: RequestReferendumInput
): Promise<RequestReferendumResult> {
  return withSessionDb(db, (transactionDb) => requestReferendumInTransaction(transactionDb, input));
}

async function requestReferendumInTransaction(
  db: Db,
  input: RequestReferendumInput
): Promise<RequestReferendumResult> {
  const { countryId } = input;
  const stateId = input.stateId.toUpperCase();
  const adminOverride = input.adminOverride === true;

  const region = sovereigntyRegionIn(countryId, stateId);
  if (!region) {
    return { status: 400, body: { error: "Region cannot hold an independence referendum." } };
  }
  if (!region.actuates) {
    return {
      status: 400,
      body: { error: "This region's referendum cannot be held until its successor state exists." },
    };
  }

  const currentTurn = await getCurrentTurn(db);
  const refs = getReferendumCollection(db);

  // Any member of a bloc may ask; the referendum is filed under the bloc.
  const regionKey = region.regionId;
  // A shared office write serializes requests even when an admin pays no AP.
  // A bloc takes the write on every member so two Governors cannot both open one.
  for (const memberId of sovereigntyMemberRegionIds(regionKey)) {
    await governorOfficeStateCollection(db).updateOne(
      { countryId, stateId: memberId },
      { $inc: { referendumRequestRevision: 1 } }
    );
  }
  const active = await refs.findOne({ regionId: regionKey, status: { $in: ACTIVE_STATUSES } });
  const lastTerminal = await refs
    .find({
      regionId: regionKey,
      kind: { $in: ["independence", "reunification"] },
      status: { $in: TERMINAL_STATUSES },
    })
    .sort({ cooldownReadyAtTurn: -1, updatedAt: -1 })
    .limit(1)
    .toArray();

  // SP5: independenceDesire lives top-level on macroMetrics. A bloc pools its members.
  const desire = (await loadPooledDesire(db, regionKey)) ?? 0;

  const elig = referendumRequestEligibility({
    desire,
    hasActiveReferendum: active != null,
    cooldownReadyAtTurn: lastTerminal[0]?.cooldownReadyAtTurn ?? null,
    currentTurn,
  });
  if (active) return { status: 400, body: { error: "A referendum is already in progress." } };
  if (!elig.eligible && !adminOverride) return { status: 400, body: { error: elig.reason } };

  const office = await governorOfficeStateCollection(db).findOne({ countryId, stateId });
  if (!office) return { status: 400, body: { error: "Office state row missing." } };
  if (!adminOverride && (office.gubernatorialActions ?? 0) < REQUEST_AP_COST) {
    return { status: 400, body: { error: "Insufficient office action points." } };
  }

  const kind: ReferendumKind = region.kind;
  const now = new Date();
  const doc: Referendum = {
    countryId,
    regionId: regionKey,
    kind,
    targetCountryId: region.targetCountryId,
    status: "requested",
    requestedTurn: currentTurn,
    grantedTurn: null,
    campaignOpenTurn: null,
    campaignCloseTurn: null,
    yesShare: desire,
    campaignBaseYesShare: desire,
    campaignSpendUnits: { yes: 0, no: 0 },
    conversionDeadlineTurn: null,
    westminsterBillId: null,
    dailBillId: null,
    result: null,
    cooldownReadyAtTurn: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!adminOverride) {
    const debit = await governorOfficeStateCollection(db).updateOne(
      { countryId, stateId, gubernatorialActions: { $gte: REQUEST_AP_COST } },
      { $inc: { gubernatorialActions: -REQUEST_AP_COST }, $set: { updatedAt: now } }
    );
    if (debit.modifiedCount === 0)
      return { status: 400, body: { error: "Insufficient office action points." } };
  }

  const ins = await refs.insertOne(doc);

  await afterCommit(db, () =>
    announceReferendumRequested({ ...doc, _id: ins.insertedId }).catch(() => {})
  );
  await recordWireEvent(db, {
    referendumId: ins.insertedId,
    countryId,
    regionId: regionKey,
    turn: currentTurn,
    kind: "requested",
    summary: `The ${region.executiveTitle} requested a ${
      kind === "reunification" ? "reunification" : "independence"
    } referendum.`,
  }).catch(() => {});

  return { status: 200, body: { referendumId: String(ins.insertedId), kind } };
}
