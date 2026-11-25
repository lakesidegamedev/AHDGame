"use client";

import { useState } from "react";
import { StateOrganizationTab } from "./StateOrganizationTab";
import { campaignPageHref } from "@/lib/campaignManager/links";
import { PILL_SHAPE, pillClass } from "@/components/ui/selectedState";

interface Props {
  activePresidentialCandidacy: {
    electionId: string;
    candidateId: string;
    campaignId: string;
  } | null;
}

type SubTab = "stateOrg" | "campaignManager";

const INELIGIBLE_TOOLTIP = "You are not in an eligible election";

export function PresidentialElectionPanel({ activePresidentialCandidacy }: Props) {
  const [sub, setSub] = useState<SubTab>("stateOrg");
  const cmDisabled = !activePresidentialCandidacy;

  return (
    <div>
      <nav className="mb-4 flex gap-2 text-body" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={sub === "stateOrg"}
          onClick={() => setSub("stateOrg")}
          className={`px-3 py-1.5 ${pillClass(sub === "stateOrg")}`}
        >
          Campaign presence
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sub === "campaignManager"}
          aria-disabled={cmDisabled}
          disabled={cmDisabled}
          onClick={() => {
            if (!cmDisabled) setSub("campaignManager");
          }}
          title={cmDisabled ? INELIGIBLE_TOOLTIP : undefined}
          className={`px-3 py-1.5 ${
            cmDisabled
              ? `${PILL_SHAPE} cursor-not-allowed text-muted/50`
              : pillClass(sub === "campaignManager")
          }`}
        >
          Campaign manager
        </button>
      </nav>
      {sub === "stateOrg" && <StateOrganizationTab />}
      {sub === "campaignManager" && activePresidentialCandidacy && (
        <iframe
          src={campaignPageHref({
            campaignId: activePresidentialCandidacy.campaignId,
            embedded: true,
          })}
          className="h-[700px] w-full rounded border border-card-border"
          title="Campaign manager"
        />
      )}
    </div>
  );
}
