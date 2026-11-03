"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { ElectionAdminPanel } from "@/components/elections/admin/ElectionAdminPanel";
import { RemoveCandidateButton } from "@/components/elections/admin/RemoveCandidateButton";
import { EYEBROW } from "../ui";

/**
 * Admin tools for the selected race, as on the election page: resolve the
 * election, and remove a candidate. Same routes, same confirmations. Shown
 * only to admins (`isAdmin` from the race's full view).
 */
export function RaceAdmin({
  electionId,
  isAdmin,
  inPrimary,
  isEnded,
  candidates,
  onDone,
}: {
  electionId: string;
  isAdmin: boolean;
  inPrimary: boolean;
  isEnded: boolean;
  candidates: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const t = useTranslations("elections.campaignManager.admin");
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          alignSelf: "flex-start",
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: FONT.sans,
          fontSize: 12,
          fontWeight: 600,
          color: BLEND.caution,
        }}
      >
        {t("toggle")}
      </button>
      {open ? (
        <>
          <ElectionAdminPanel
            electionId={electionId}
            inPrimary={inPrimary}
            isEnded={isEnded}
            onSuccess={onDone}
          />
          {!isEnded && candidates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={EYEBROW}>{t("candidates")}</span>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <span>{c.name}</span>
                    <RemoveCandidateButton
                      candidateId={c.id}
                      candidateName={c.name}
                      electionId={electionId}
                      onRemoveSuccess={onDone}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
