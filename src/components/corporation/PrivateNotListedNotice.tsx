"use client";

import { useEffect, useState } from "react";
import { NoticeStrip } from "./ledger/NoticeStrip";

interface PrivateNotListedNoticeProps {
  corporationId: string;
  corporationName: string;
}

function dismissKey(corporationId: string): string {
  return `ahd-private-not-listed-v1:${corporationId}`;
}

/**
 * One-line explainer for the CEO of a private corp: it is deliberately
 * excluded from every exchange snapshot, so its absence from the stock market
 * is not a listing that failed (#1153). Dismissable per corporation — once the
 * owner knows, it never nags again.
 */
export default function PrivateNotListedNotice({
  corporationId,
  corporationName,
}: PrivateNotListedNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  const key = dismissKey(corporationId);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      // storage blocked — show the notice, best effort
    }
  }, [key]);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // private mode — dismissal just won't persist
    }
  };

  return (
    <NoticeStrip
      tone="info"
      tag="Not listed"
      onDismiss={dismiss}
      dismissLabel="Dismiss not-listed notice"
    >
      <p className="font-semibold text-foreground">Not listed on any exchange</p>
      <p className="mt-0.5 text-muted">
        {corporationName} is private, and private corporations do not appear on the stock market.
        Take it public from the Shares tab to list it. Buying your own shares back until nothing is
        left on the public float has the same effect as staying private.
      </p>
    </NoticeStrip>
  );
}
