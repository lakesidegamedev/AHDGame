"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import {
  parseAccountFieldsMode,
  parseUsernameMode,
  type AccountFieldsMode,
  type UsernameMode,
} from "@/lib/auth/accountFields/rules";

/** Where email and password changes happen. Off until the server answers. */
export function useAccountFieldsMode(): AccountFieldsMode {
  const [mode, setMode] = useState<AccountFieldsMode>("off");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await fetchJson<{ mode?: string }>("/api/auth/account-fields", {
          cache: "no-store",
          feature: "account-fields-mode",
        });
        if (!cancelled) setMode(parseAccountFieldsMode(body.mode));
      } catch {
        // The forms stay; the API still refuses writes server side.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}

/** Whether usernames are changed at the Lakeside account. Off until the server answers. */
export function useUsernameMode(): UsernameMode {
  const [mode, setMode] = useState<UsernameMode>("off");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await fetchJson<{ usernameMode?: string }>("/api/auth/account-fields", {
          cache: "no-store",
          feature: "username-mode",
        });
        if (!cancelled) setMode(parseUsernameMode(body.usernameMode));
      } catch {
        // Stays off; there is no username write to refuse here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}
