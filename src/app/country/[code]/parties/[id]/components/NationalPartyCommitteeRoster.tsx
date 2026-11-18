import { OfficeholderPortrait } from "@/components/OfficeholderPortrait";
import { PARTY_SECTION_HEADING_CLASS } from "@/components/party/partyPageStyles";
import { getPartyRoleLabel } from "@/lib/parties/partyRoleLabels";
import type { CommitteeData, PartyData } from "./types";

export function NationalPartyCommitteeRoster({
  countryId,
  committeeResult,
  showSeatNumbers = false,
}: {
  countryId: PartyData["countryId"];
  committeeResult: CommitteeData | "unavailable" | null;
  showSeatNumbers?: boolean;
}) {
  const title = getPartyRoleLabel(countryId, "committee");

  return (
    <section aria-labelledby="committee-title">
      <h2 id="committee-title" className={PARTY_SECTION_HEADING_CLASS}>
        {title}
      </h2>
      {showSeatNumbers && (
        <p className="mt-1 max-w-2xl text-body text-muted">
          {`The ${title} consists of up to 6 elected members who help guide party policy and strategy.`}
        </p>
      )}
      {committeeResult && committeeResult !== "unavailable" ? (
        <ol role="list" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({
            length: Math.max(
              committeeResult.committeeSize,
              committeeResult.committeeMembers.length
            ),
          }).map((_, idx) => {
            const member = committeeResult.committeeMembers[idx];
            return (
              <li
                key={member?.id ?? `empty-${idx}`}
                className="min-w-0 rounded-xl border border-card-border bg-card p-3"
              >
                <OfficeholderPortrait
                  role={showSeatNumbers ? `Seat ${idx + 1}` : undefined}
                  holder={
                    member
                      ? { ...member, href: `/character/${member.sequentialId ?? member.id}` }
                      : null
                  }
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <p role="status" className="mt-4 text-body-sm text-muted">
          {committeeResult === "unavailable"
            ? "Committee seats are unavailable."
            : "Loading committee seats…"}
        </p>
      )}
    </section>
  );
}
