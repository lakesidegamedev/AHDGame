import { OfficeholderPortrait } from "@/components/OfficeholderPortrait";
import { getPartyLabel } from "@/lib/utils/politics";

export interface LeaderCardCharacter {
  characterId: string | null;
  nppId?: string | null;
  isNPP?: boolean;
  sequentialId?: number | null;
  characterName: string;
  party: string | null;
  since: string | null;
  avatarUrl?: string | null;
}

export function LeaderCard({
  title,
  subtitle,
  emptyLabel,
  character,
}: {
  title: string;
  subtitle?: string;
  emptyLabel?: string;
  character: (Omit<LeaderCardCharacter, "party" | "since"> & { party?: string | null }) | null;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <OfficeholderPortrait
        role={title}
        vacancyLabel={emptyLabel}
        holder={
          character && {
            name: character.characterName,
            avatarUrl: character.avatarUrl,
            href: character.isNPP
              ? character.sequentialId != null
                ? `/politicians/npp/${character.sequentialId}`
                : undefined
              : character.characterId
                ? `/character/${character.sequentialId ?? character.characterId}`
                : undefined,
          }
        }
      />
      {(subtitle || character?.party) && (
        <div className="mt-2 text-center text-body-sm text-muted">
          {subtitle && <p>{subtitle}</p>}
          {character?.party && <p>{getPartyLabel(character.party)}</p>}
        </div>
      )}
    </div>
  );
}
