/** Default identity protection and an active tier-demotion notice in the national header. */
import { DefaultPartyBadge } from "@/components/parties/DefaultPartyBadge";
import { MAJOR_DEMOTION_GRACE_TURNS } from "@/lib/parties/partyTier";
import type { PartyData } from "@/lib/parties/dto/partyView";

export function NationalPartyIdentityStatus({
  party,
  currentTurn,
}: {
  party: Pick<PartyData, "isDefault" | "majorDemotionWarning">;
  currentTurn: number;
}) {
  return (
    <>
      {party.isDefault && <DefaultPartyBadge />}
      {party.majorDemotionWarning ? (
        <p className="mt-3 max-w-xl text-body-sm text-muted">
          <span className="font-semibold text-warning">Major party status at risk.</span> Org has
          fallen below 10% in two-thirds of regions. Regain 20% Org in at least a third of regions
          within{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {Math.max(
              0,
              party.majorDemotionWarning.startedTurn + MAJOR_DEMOTION_GRACE_TURNS - currentTurn
            )}
          </span>{" "}
          turns or this party will be demoted to Minor.
        </p>
      ) : null}
    </>
  );
}
