"use client";

import { useState } from "react";
import { NoticeStrip } from "@/components/corporation/ledger/NoticeStrip";
import { announceCharacterSwitch } from "@/lib/characterSwitchSignal";

/** The viewer's account runs this corporation through a different character than the active one. */
export function SwitchToCeoCharacterNotice({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);

  const switchCharacter = async () => {
    if (switching) return;
    setSwitching(true);
    setFailed(false);
    try {
      const res = await fetch("/api/auth/active-character", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (res.ok) {
        announceCharacterSwitch({ characterId, name: characterName });
        window.location.reload();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setSwitching(false);
  };

  return (
    <NoticeStrip
      tone="info"
      tag="Your character"
      action={
        <button
          type="button"
          onClick={() => void switchCharacter()}
          disabled={switching}
          className="inline-flex h-7 items-center rounded-[calc(var(--corp-rad)-2px)] border border-card-border px-2.5 text-body-sm font-medium text-foreground hover:bg-card-elevated disabled:opacity-50"
        >
          {switching ? "Switching" : "Switch character"}
        </button>
      }
    >
      <span className="font-medium text-foreground" data-testid="switch-to-ceo-line">
        Your character {characterName} runs this corporation. Switch character to manage it.
      </span>
      {failed && <span className="ml-2 text-error">Could not switch. Try again.</span>}
    </NoticeStrip>
  );
}
