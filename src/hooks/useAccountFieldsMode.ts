"use client";

import { useEffect, useState } from "react";
import { parseAccountFieldsMode, type AccountFieldsMode } from "@/lib/auth/accountFields/rules";

/** Where email and password changes happen. Off until the server answers. */
export function useAccountFieldsMode(): AccountFieldsMode {
  const [mode, setMode] = useState<AccountFieldsMode>("off");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/account-fields", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { mode?: string } | null) => {
        if (!cancelled && body) setMode(parseAccountFieldsMode(body.mode));
      })
      .catch((error: unknown) => {
        // The screens stay on the normal forms; the API still refuses a write server side.
        console.warn(
          "account fields mode unavailable",
          error instanceof Error ? error.name : "error"
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}
