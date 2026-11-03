import type { ObjectId } from "mongodb";
import { createNotification, type NotificationInput } from "@/lib/notifications";
import type { Corporation } from "@/lib/db/types/corporation";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commodities";

export type SupplyAgreementEvent = "accepted" | "taken" | "started" | "cancelled" | "expired";

const VERB: Record<SupplyAgreementEvent, string> = {
  accepted: "accepted",
  taken: "taken",
  started: "started",
  cancelled: "cancelled",
  expired: "expired",
};

function commodityName(commodity: CommodityType): string {
  return COMMODITY_LABELS[commodity] ?? commodity;
}

/**
 * One alert for every agreement of one corporation that ran out in the same
 * expiry pass. The contract book retires agreements in batches, and one alert
 * per agreement buried the inbox (dozens a week per player, almost none
 * opened). A single expiry keeps the per-agreement wording.
 */
export function supplyAgreementsExpiredNotification(args: {
  recipient: Pick<Corporation, "_id" | "userId">;
  agreements: { _id: ObjectId; commodity: CommodityType }[];
}): NotificationInput | null {
  const [first] = args.agreements;
  if (!first) return null;
  if (args.agreements.length === 1) {
    return supplyAgreementNotification({
      recipient: args.recipient,
      agreementId: first._id,
      commodity: first.commodity,
      event: "expired",
    });
  }
  if (!args.recipient.userId) return null;
  const byCommodity = new Map<CommodityType, number>();
  for (const a of args.agreements)
    byCommodity.set(a.commodity, (byCommodity.get(a.commodity) ?? 0) + 1);
  const parts = [...byCommodity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([commodity, n]) =>
      n > 1 ? `${commodityName(commodity)} (${n})` : commodityName(commodity)
    );
  const listed =
    parts.length > 4
      ? `${parts.slice(0, 4).join(", ")} and ${parts.length - 4} more`
      : parts.join(", ");
  return {
    userId: args.recipient.userId,
    type: "corp_supply_agreement_update",
    title: `${args.agreements.length} supply agreements ended`,
    message: `These reached the end of their term: ${listed}. Sign new ones in the Commodities tab if you still need the supply.`,
    metadata: {
      corporationId: args.recipient._id.toString(),
      agreementIds: args.agreements.map((a) => a._id.toString()),
      count: args.agreements.length,
      event: "expired",
    },
  };
}

/**
 * The notification one CEO gets when a supply agreement changes state. `actor`
 * names who caused it and is omitted for expiry, which nobody caused. A vacant
 * corporation has no one to tell, so the input is null.
 */
export function supplyAgreementNotification(args: {
  recipient: Pick<Corporation, "_id" | "userId">;
  actor?: Pick<Corporation, "name">;
  agreementId: ObjectId;
  commodity: CommodityType;
  event: SupplyAgreementEvent;
  detail?: string;
}): NotificationInput | null {
  if (!args.recipient.userId) return null;
  const link = args.event === "started" ? "with" : "by";
  const by = args.actor?.name ? ` ${link} ${args.actor.name}` : "";
  return {
    userId: args.recipient.userId,
    type: "corp_supply_agreement_update",
    title: `Supply agreement ${VERB[args.event]}`,
    message: `Your ${commodityName(args.commodity)} supply agreement was ${VERB[args.event]}${by}.${args.detail ? ` ${args.detail}` : ""}`,
    metadata: {
      corporationId: args.recipient._id.toString(),
      agreementId: args.agreementId.toString(),
      event: args.event,
    },
  };
}

/** Tell one CEO a supply agreement changed state. */
export async function notifySupplyAgreementEvent(
  args: Parameters<typeof supplyAgreementNotification>[0]
): Promise<void> {
  const input = supplyAgreementNotification(args);
  if (input) await createNotification(input);
}
