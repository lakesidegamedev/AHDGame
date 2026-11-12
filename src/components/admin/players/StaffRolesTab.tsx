"use client";

import { InlineError } from "@/components/ui/InlineError";
import { apiErrorText } from "@/lib/errors/catalog";
import { useState, useEffect, useCallback } from "react";
import { PlayerSelector } from "@/components/PlayerSelector";
import { LocalTime } from "@/components/time/LocalTime";
import { staffRoleLabel } from "@/lib/staff/grantRules";
import type { GrantableStaffRole } from "@/lib/staff/rules";

interface StaffMember {
  userId: string;
  username: string;
  email: string;
  moderatorSince: string;
  characterName: string | null;
}

const ROLE_BLURB: Record<GrantableStaffRole, string> = {
  moderator: "Player management, transaction review and content moderation.",
  junior_dev: "Read-only view of every admin tool, logs and diagnostics. Cannot change anything.",
};

/** Admin-only: grant and remove the moderator and junior dev roles. */
export function StaffRolesTab() {
  const [role, setRole] = useState<GrantableStaffRole>("moderator");
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const label = staffRoleLabel(role);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/moderators?role=${role}`);
      if (!res.ok) throw new Error(`Failed to fetch ${staffRoleLabel(role)}s`);
      const data = await res.json();
      setMembers(data.moderators);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const post = async (path: "assign" | "remove", userId: string) => {
    const res = await fetch(`/api/admin/moderators/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorText(data, `Failed to ${path} ${label}`));
      return false;
    }
    setError("");
    return true;
  };

  const handleAssign = async () => {
    if (!selectedUser) return;
    setAssigning(true);
    try {
      if (await post("assign", selectedUser.userId)) {
        setSelectedUser(null);
        fetchMembers();
      }
    } catch {
      setError(`Failed to assign ${label}`);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (userId: string, username: string) => {
    if (!confirm(`Remove ${label} role from ${username}?`)) return;
    try {
      if (await post("remove", userId)) fetchMembers();
    } catch {
      setError(`Failed to remove ${label}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-card-border bg-card p-1" role="tablist">
        {(["moderator", "junior_dev"] as const).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={role === r}
            onClick={() => {
              setRole(r);
              setSelectedUser(null);
              setError("");
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
              role === r ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground"
            }`}
          >
            {staffRoleLabel(r)}s
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-card-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Assign {label}</h3>
        <p className="mb-3 text-body-sm text-muted">{ROLE_BLURB[role]} Changes are admin logged.</p>
        <div className="flex gap-2">
          {selectedUser ? (
            <div className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm">
                <span className="font-medium">{selectedUser.username}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-md border border-card-border bg-card px-3 py-2 text-xs text-muted hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {assigning ? "Assigning..." : "Assign"}
              </button>
            </div>
          ) : (
            <PlayerSelector
              onSelect={(char) => {
                setSelectedUser({ userId: char.userId ?? char.id, username: char.name });
                setError("");
              }}
              placeholder="Search by username, character, or discord name..."
              className="flex-1"
            />
          )}
        </div>
        <InlineError error={error} className="mt-2 text-sm text-error" />
      </div>

      <div className="rounded-lg border border-card-border bg-card">
        <div className="border-b border-card-border px-4 py-3">
          <h3 className="text-sm font-semibold">
            Current {label}s ({members.length})
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : members.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No {label}s assigned</p>
        ) : (
          <div className="divide-y divide-card-border">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium">{m.username}</span>
                  {m.characterName && (
                    <span className="ml-2 text-sm text-muted">({m.characterName})</span>
                  )}
                  <span className="ml-3 text-xs text-muted">
                    Since <LocalTime value={m.moderatorSince} options={{ dateStyle: "medium" }} />
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(m.userId, m.username)}
                  className="rounded-lg bg-error/10 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
