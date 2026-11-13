import { STAFF_ROLES, type StaffRole } from "@/lib/staff/rules";

export const GRANT_KINDS = [
  "actions",
  "funds",
  "cash",
  "voucher",
  "access",
  "credit",
  "treasury",
  "balance",
] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export const GRANT_RECIPIENT_TYPES = [
  "character",
  "user",
  "npp",
  "corporation",
  "country",
  "all_players",
] as const;
export type GrantRecipientType = (typeof GRANT_RECIPIENT_TYPES)[number];

export interface GrantRecipient {
  type: GrantRecipientType;
  id?: string;
  name?: string;
}

/** A tool or agent acting on a person's behalf. `requestedBy` is a user id. */
export interface GrantVia {
  tool: string;
  requestedBy: string;
}

export interface GrantInput {
  actorUserId: string;
  /** Resolved from the account at the moment of the grant. */
  actorRole: StaffRole | null;
  via?: GrantVia;
  recipients: GrantRecipient[];
  kind: GrantKind;
  /** What was given, in words, when there is no single amount (an access tier, a voucher). */
  item?: string;
  amount?: number;
  currencyCode?: string;
  reason: string;
  world?: string;
}

const HEX_ID = /^[0-9a-f]{24}$/;
const MAX_RECIPIENTS_STORED = 200;
const MIN_REASON_LENGTH = 5;

export const isUserId = (value: unknown): value is string =>
  typeof value === "string" && HEX_ID.test(value);

/** Every reason the grant must be refused, so a caller fixes it in one pass. */
export function grantProblems(input: GrantInput): string[] {
  const problems: string[] = [];
  if (!isUserId(input.actorUserId)) problems.push("the acting user must be a user id");
  if (!input.actorRole || !(STAFF_ROLES as readonly string[]).includes(input.actorRole)) {
    problems.push("the acting user must hold a staff role");
  }
  if (input.via) {
    if (!input.via.tool || input.via.tool.trim().length === 0) {
      problems.push("a script or agent must name its tool");
    }
    if (!isUserId(input.via.requestedBy)) {
      problems.push("requestedBy must be the id of the person who asked, never free text");
    }
  }
  if (!(GRANT_KINDS as readonly string[]).includes(input.kind)) problems.push("unknown grant kind");
  if (input.recipients.length === 0) problems.push("at least one recipient is required");
  for (const recipient of input.recipients) {
    if (!(GRANT_RECIPIENT_TYPES as readonly string[]).includes(recipient.type)) {
      problems.push("unknown recipient type");
    } else if (recipient.type !== "all_players" && !recipient.id) {
      problems.push(`a ${recipient.type} recipient needs an id`);
    }
  }
  if (input.amount !== undefined && !Number.isFinite(input.amount)) {
    problems.push("amount must be a finite number");
  }
  if (input.amount === undefined && !input.item) problems.push("give an amount or name the item");
  if (!input.reason || input.reason.trim().length < MIN_REASON_LENGTH) {
    problems.push("a reason is required");
  }
  return problems;
}

/** What is stored under `meta.grant` on the audit record. */
export interface GrantMeta {
  kind: GrantKind;
  item?: string;
  recipients: GrantRecipient[];
  recipientCount: number;
  via?: GrantVia;
}

export function buildGrantMeta(input: GrantInput): GrantMeta {
  return {
    kind: input.kind,
    ...(input.item ? { item: input.item } : {}),
    recipients: input.recipients.slice(0, MAX_RECIPIENTS_STORED),
    recipientCount: input.recipients.length,
    ...(input.via ? { via: input.via } : {}),
  };
}

export const GRANT_ACTION_PREFIX = "grant.";
export const grantAction = (kind: GrantKind): string => `${GRANT_ACTION_PREFIX}${kind}`;

export interface ResourceGrantRequest {
  characterIds?: string[];
  allPlayers?: boolean;
  actions?: number;
  funds?: number;
  cashOnHand?: number;
  currency?: string;
  positionUpdateVoucher?: boolean;
  reason?: string;
}

/** One grant per resource kind in a Control panel resources request. */
export function resourceGrantInputs(
  request: ResourceGrantRequest,
  actorUserId: string,
  fallbackReason: string
): Array<Omit<GrantInput, "actorRole" | "world">> {
  const recipients: GrantRecipient[] = request.allPlayers
    ? [{ type: "all_players" }]
    : (request.characterIds ?? []).map((id) => ({ type: "character", id }));
  const reason = request.reason?.trim() || fallbackReason;
  const base = { actorUserId, recipients, reason };
  const grants: Array<Omit<GrantInput, "actorRole" | "world">> = [];
  if (request.actions) grants.push({ ...base, kind: "actions", amount: request.actions });
  if (request.funds) grants.push({ ...base, kind: "funds", amount: request.funds });
  if (request.cashOnHand) {
    grants.push({
      ...base,
      kind: "cash",
      amount: request.cashOnHand,
      ...(request.currency ? { currencyCode: request.currency } : {}),
    });
  }
  if (request.positionUpdateVoucher) {
    grants.push({ ...base, kind: "voucher", item: "Positions Update Voucher" });
  }
  return grants;
}
