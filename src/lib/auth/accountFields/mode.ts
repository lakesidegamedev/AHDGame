import { NextResponse } from "next/server";
import { authConfig } from "@/lib/config/auth";
import { errorResponse } from "@/lib/api/errors";
import {
  ACCOUNT_URL,
  accountFieldsMessage,
  parseAccountFieldsMode,
  type AccountFieldKind,
  type AccountFieldsMode,
} from "./rules";

/** The one place the switch is read. */
export function getAccountFieldsMode(): AccountFieldsMode {
  return parseAccountFieldsMode(authConfig.accountFieldsMode());
}

/**
 * The refusal an email or password write returns when this deployment follows
 * the central account, or null when the write may proceed. Freeze answers 503
 * (back soon), central answers 409 with the account address.
 */
export function accountFieldsRefusal(kind: AccountFieldKind): NextResponse | null {
  const mode = getAccountFieldsMode();
  if (mode === "off") return null;
  const headers = { "Cache-Control": "private, no-store" };
  if (mode === "freeze") {
    return errorResponse(503, accountFieldsMessage(mode, kind), {
      headers,
      extra: { accountFieldsMode: mode },
    });
  }
  return errorResponse(409, accountFieldsMessage(mode, kind), {
    headers,
    extra: { accountFieldsMode: mode, accountUrl: ACCOUNT_URL },
  });
}
