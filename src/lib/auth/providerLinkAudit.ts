import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { recordAudit } from "@/lib/audit/recordAudit";
import type { ProviderLinkProvider } from "./providerLinkContext";

type LinkAuditReason =
  | "started"
  | "completed"
  | "already_linked"
  | "registration_blocked"
  | "session_expired"
  | "account_mismatch"
  | "context_invalid"
  | "rate_limited"
  | "not_configured"
  | "missing_mode"
  | "missing_params"
  | "invalid_state"
  | "provider_denied"
  | "exchange_failed";

export function recordProviderLinkAudit(input: {
  provider: ProviderLinkProvider;
  stage: "start" | "callback" | "result";
  reason: LinkAuditReason;
  userId?: string;
  state?: string | null;
}): void {
  try {
    const userId =
      input.userId && ObjectId.isValid(input.userId) ? new ObjectId(input.userId) : undefined;
    // Correlate the round trip without storing the OAuth state or credential material.
    const flowId =
      input.state && input.state.length <= 1024
        ? createHash("sha256").update(`${input.provider}:${input.state}`).digest("hex")
        : undefined;
    recordAudit({
      source: "api",
      category: "auth",
      action: `auth.provider_link.${input.stage}`,
      actor: userId ? { kind: "player", userId } : { kind: "system" },
      subject: { type: "account", id: userId },
      outcome: ["started", "completed"].includes(input.reason)
        ? "ok"
        : input.reason === "exchange_failed"
          ? "error"
          : "rejected",
      reason: input.reason,
      meta: { provider: input.provider, flowId },
    });
  } catch {
    // Observability must not change an authentication outcome.
  }
}
