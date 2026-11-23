"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { apiErrorText } from "@/lib/errors/catalog";
import type { ElectionDetail } from "./ElectionDetailTypes";

/**
 * Shown to a player who has been invited onto a presidential ticket. They join
 * only by accepting here (ticket 1889); declining clears the invitation.
 */
export function RunningMateInvitationPanel({
  election,
  electionId,
  onAnswered,
}: {
  election: ElectionDetail;
  electionId: string;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const myCharId = election.myCharId;
  if (!myCharId || election.isEnded) return null;
  const invitations = election.allCandidates.filter(
    (c) => c.pendingRunningMateCharacterId === myCharId
  );
  if (invitations.length === 0) return null;

  const answer = async (nomineeCandidateId: string, accept: boolean) => {
    setBusy(`${nomineeCandidateId}:${accept}`);
    setError("");
    try {
      const response = await fetch(`/api/elections/${electionId}/running-mate/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomineeCandidateId, accept }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(apiErrorText(data, "Unable to answer the invitation."));
        return;
      }
      onAnswered();
    } catch {
      setError("Network error while answering the invitation.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      {invitations.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-sm text-foreground">
            <span className="font-medium">{c.characterName}</span> has invited you to be their
            running mate. You join the ticket only if you accept. If the ticket wins, its running
            mate becomes Vice President.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => answer(c.id, true)}
              isLoading={busy === `${c.id}:true`}
              disabled={busy !== null}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => answer(c.id, false)}
              isLoading={busy === `${c.id}:false`}
              disabled={busy !== null}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
