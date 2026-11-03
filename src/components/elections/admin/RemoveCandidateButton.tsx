"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";

/** Admin: remove one candidate from a race, after a confirmation. */
export function RemoveCandidateButton({
  candidateId,
  electionId,
  onRemoveSuccess,
  candidateName,
}: {
  candidateId: string;
  electionId: string;
  onRemoveSuccess: () => void;
  /** Names the candidate for screen readers where several Remove buttons share a list. */
  candidateName?: string;
}) {
  const [removing, setRemoving] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Remove this candidate from the race?")) return;
        setRemoving(true);
        try {
          const res = await fetch(`/api/admin/elections/${electionId}/remove-candidate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId }),
          });
          const data = await res.json();
          if (res.ok) onRemoveSuccess();
          else alert(apiErrorText(data, "Failed to remove"));
        } catch {
          alert("Network error");
        } finally {
          setRemoving(false);
        }
      }}
      disabled={removing}
      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50"
      title="Remove candidate (admin)"
      aria-label={candidateName ? `Remove ${candidateName}` : undefined}
    >
      {removing ? "…" : "Remove"}
    </button>
  );
}
