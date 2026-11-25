"use client";

import { useState } from "react";
import type { PartyCommitteeTitles } from "@/lib/db/types/party";
import { apiErrorText } from "@/lib/errors/catalog";
import {
  DEFAULT_COMMITTEE_MEMBER_TITLE,
  getNationalCommitteeName,
  MAX_PARTY_LEADERSHIP_TITLE_LENGTH,
} from "@/lib/parties/partyRoleLabels";
import { partyApiUrl } from "@/lib/urls";
import type { CommitteeData } from "./types";

const inputClass =
  "w-full rounded-lg border border-card-border bg-background px-3 py-2 text-body text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

interface Props {
  partyId: string;
  countryId: string;
  titles?: PartyCommitteeTitles;
  members?: CommitteeData["committeeMembers"];
  onUpdate: () => void;
}

export function PartyCommitteeTitlesControl({
  partyId,
  countryId,
  titles,
  members,
  onUpdate,
}: Props) {
  const [name, setName] = useState(titles?.name?.trim() ?? "");
  const [member, setMember] = useState(titles?.member?.trim() ?? "");
  const [byMember, setByMember] = useState(titles?.byMember ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeMembers = members ?? [];
  const changes: Omit<PartyCommitteeTitles, "byMember"> & {
    byMember?: Record<string, string | null>;
  } = {};
  if (name.trim() !== (titles?.name?.trim() ?? "")) changes.name = name.trim() || null;
  if (member.trim() !== (titles?.member?.trim() ?? "")) changes.member = member.trim() || null;
  const editedTitles = activeMembers.flatMap(({ id }) => {
    const draft = byMember[id]?.trim() ?? "";
    const saved = titles?.byMember?.[id]?.trim() ?? "";
    return draft === saved ? [] : [[id, draft || null] as const];
  });
  if (editedTitles.length) changes.byMember = Object.fromEntries(editedTitles);
  const hasChanges = Object.keys(changes).length > 0;

  async function saveTitles() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${partyApiUrl(countryId, partyId)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeTitles: changes }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessage(apiErrorText(data, "Could not save committee titles."));
        return;
      }
      setMessage("Committee titles saved.");
      onUpdate();
    } catch {
      setMessage("Network error saving committee titles.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="party-committee-titles-heading" className="space-y-4">
      <div>
        <h3 id="party-committee-titles-heading" className="text-body-lg font-semibold text-muted">
          Committee titles
        </h3>
        <p className="mt-1 text-body text-muted">
          Leave an individual title blank to use the default member title.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-body font-medium text-foreground">
          <span>Committee name</span>
          <input
            className={inputClass}
            maxLength={MAX_PARTY_LEADERSHIP_TITLE_LENGTH}
            placeholder={getNationalCommitteeName(countryId)}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-body font-medium text-foreground">
          <span>Default member title</span>
          <input
            className={inputClass}
            maxLength={MAX_PARTY_LEADERSHIP_TITLE_LENGTH}
            placeholder={DEFAULT_COMMITTEE_MEMBER_TITLE}
            value={member}
            onChange={(event) => setMember(event.target.value)}
          />
        </label>
        {activeMembers.map(({ id, name: memberName }) => (
          <label key={id} className="space-y-1.5 text-body font-medium text-foreground">
            <span>Title for {memberName}</span>
            <input
              className={inputClass}
              maxLength={MAX_PARTY_LEADERSHIP_TITLE_LENGTH}
              placeholder={member.trim() || DEFAULT_COMMITTEE_MEMBER_TITLE}
              value={byMember[id] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setByMember((current) => ({ ...current, [id]: value }));
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveTitles}
          disabled={saving || !hasChanges}
          className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-body font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save committee titles"}
        </button>
        {message && (
          <p role="status" className="text-body text-muted">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
