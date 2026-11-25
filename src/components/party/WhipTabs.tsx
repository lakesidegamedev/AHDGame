"use client";

import { useState } from "react";
import { NppWhipPanel } from "./NppWhipPanel";
import { PlayerWhipPanel } from "./PlayerWhipPanel";
import { WhipDefiancePanel } from "./WhipDefiancePanel";
import { PILL_TRACK, pillClass } from "@/components/ui/selectedState";

export interface WhipEndpointConfig {
  billsUrl: string;
  leadershipUrl: string;
  whipUrl: string;
  stateBillsUrlTemplate?: string;
  defianceUrl?: string;
}

interface WhipTabsProps {
  /** National-party page: true. State-party page: false. */
  showPlayerTab: boolean;
  isNational: boolean;
  countryId: string;
  partyId: string;
  partyColor: string;
  stateId?: string;
  eligibleStates?: Array<{ id: string; name: string }>;
  endpointConfig?: WhipEndpointConfig;
}

/**
 * Outer Players / NPPs tab switcher for the Whip sub-tab on party pages.
 * On state-party pages, pass showPlayerTab={false} to render only the NPP panel
 * (state parties can't issue Player Whips).
 */
export function WhipTabs({
  showPlayerTab,
  isNational,
  countryId,
  partyId,
  partyColor,
  stateId,
  eligibleStates,
  endpointConfig,
}: WhipTabsProps) {
  const [audience, setAudience] = useState<"player" | "npp" | "defiance">(
    showPlayerTab ? "player" : "npp"
  );
  const defaultWhipUrl =
    endpointConfig?.whipUrl ??
    (isNational
      ? `/api/country/${countryId.toLowerCase()}/parties/${partyId}/whip`
      : `/api/country/${countryId.toLowerCase()}/region/${stateId}/party/${partyId}/whip`);
  const defianceUrl = endpointConfig?.defianceUrl ?? `${defaultWhipUrl}/defiance`;

  return (
    <div className="space-y-4">
      <div role="tablist" className={`${PILL_TRACK} w-fit`}>
        {showPlayerTab ? (
          <button
            role="tab"
            aria-selected={audience === "player"}
            onClick={() => setAudience("player")}
            className={`px-4 py-1.5 text-sm ${pillClass(audience === "player")}`}
          >
            Players
          </button>
        ) : null}
        <button
          role="tab"
          aria-selected={audience === "npp"}
          onClick={() => setAudience("npp")}
          className={`px-4 py-1.5 text-sm ${pillClass(audience === "npp")}`}
        >
          NPPs
        </button>
        <button
          role="tab"
          aria-selected={audience === "defiance"}
          onClick={() => setAudience("defiance")}
          className={`px-4 py-1.5 text-sm ${pillClass(audience === "defiance")}`}
        >
          Defiance
        </button>
      </div>

      {audience === "defiance" ? (
        <WhipDefiancePanel defianceUrl={defianceUrl} />
      ) : audience === "player" && showPlayerTab ? (
        <PlayerWhipPanel
          countryId={countryId}
          partyId={partyId}
          partyColor={partyColor}
          eligibleStates={eligibleStates}
          endpointConfig={endpointConfig}
        />
      ) : (
        <NppWhipPanel
          isNational={isNational}
          countryId={countryId}
          partyId={partyId}
          partyColor={partyColor}
          stateId={stateId}
          eligibleStates={eligibleStates}
          endpointConfig={endpointConfig}
        />
      )}
    </div>
  );
}
