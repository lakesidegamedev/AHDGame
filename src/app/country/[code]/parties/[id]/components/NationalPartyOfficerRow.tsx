import { OfficeholderPortrait } from "@/components/OfficeholderPortrait";
import { PARTY_SECTION_HEADING_CLASS } from "@/components/party/partyPageStyles";
import { getPositionLabels, POSITION_DESC } from "./helpers";
import type { PartyData } from "./types";

const officerOrder = ["chair", "viceChair", "treasurer"] as const;

export function NationalPartyOfficerRow({ party }: { party: PartyData }) {
  const labels = getPositionLabels(party.countryId, party.leadershipTitles);

  return (
    <section aria-labelledby="leadership-title" className="min-w-0">
      <h2 id="leadership-title" className={`mb-4 ${PARTY_SECTION_HEADING_CLASS}`}>
        National leadership
      </h2>
      <ul role="list" className="grid gap-3 sm:grid-cols-3">
        {officerOrder.map((office) => {
          const officer = party[office];
          return (
            <li key={office} className="min-w-0 rounded-xl border border-card-border bg-card p-3">
              <OfficeholderPortrait
                role={labels[office]}
                holder={
                  officer && {
                    ...officer,
                    href: `/character/${officer.sequentialId ?? officer.id}`,
                  }
                }
              />
              <p className="mt-2 text-center text-body-sm leading-relaxed text-muted">
                {POSITION_DESC[office]}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
