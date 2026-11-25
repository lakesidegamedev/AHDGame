"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { apiErrorText } from "@/lib/errors/catalog";

interface WikiReviewActionsProps {
  slug: string;
  onApprove: () => void;
  onReject: () => void;
}

export function WikiReviewActions({ slug, onApprove, onReject }: WikiReviewActionsProps) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleApprove = async () => {
    if (!confirm("Approve this wiki page submission?")) return;

    setApproving(true);
    try {
      const response = await fetch(`/api/admin/wiki/review/${slug}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approveNote.trim() ? { note: approveNote.trim() } : {}),
      });

      if (response.ok) {
        onApprove();
      } else {
        const data = await response.json();
        alert(apiErrorText(data, "Failed to approve"));
      }
    } catch {
      alert("Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 10) {
      alert("Reason must be at least 10 characters.");
      return;
    }

    setRejecting(true);
    try {
      const response = await fetch(`/api/admin/wiki/review/${slug}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (response.ok) {
        setShowRejectModal(false);
        setRejectReason("");
        onReject();
      } else {
        const data = await response.json();
        alert(apiErrorText(data, "Failed to reject"));
      }
    } catch {
      alert("Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={approveNote}
          onChange={(e) => setApproveNote(e.target.value)}
          maxLength={500}
          placeholder="Optional note on approval"
          aria-label="Optional note on approval"
          className="w-56 rounded-md border border-card-border bg-background px-3 py-2 text-body text-foreground"
        />
        <button
          onClick={handleApprove}
          disabled={approving}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {approving ? "Approving..." : "Approve"}
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={rejecting}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      <Modal
        open={showRejectModal}
        title="Reject submission"
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason("");
        }}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Provide a reason for rejection..."
          rows={4}
          className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => {
              setShowRejectModal(false);
              setRejectReason("");
            }}
            className="px-4 py-2 border border-card-border rounded-md text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={rejecting || !rejectReason.trim()}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {rejecting ? "Rejecting..." : "Confirm reject"}
          </button>
        </div>
      </Modal>
    </>
  );
}
