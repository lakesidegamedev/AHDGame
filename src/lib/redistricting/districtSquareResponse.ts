import type { CongressionalDistrict, DistrictSquares } from "@/lib/db/types/congressionalDistrict";

export interface DistrictSquareView {
  index: number;
  cd: string;
  squares: DistrictSquares;
  netLean: number;
  greyShare: number;
  holderParty: string | null;
  holderName: string | null;
}

/**
 * Join district codes to the matching numbered office and resolve holder names. Codes without a
 * doc are omitted (e.g. seed not yet run for that state).
 */
export function buildDistrictSquareViews(
  staticCds: string[],
  docs: CongressionalDistrict[],
  holderNames: Record<string, string>,
  partyLabels: Record<string, string> = {}
): DistrictSquareView[] {
  const byIndex = new Map<number, CongressionalDistrict>();
  for (const d of docs) byIndex.set(d.index, d);

  const sortedCds = [...staticCds].sort((a, b) => a.localeCompare(b));
  const views: DistrictSquareView[] = [];
  sortedCds.forEach((cd) => {
    const match = /^([A-Z]{2})-(\d{2}|AL)$/.exec(cd);
    if (!match) return;
    if ((match[2] === "AL" || match[2] === "00") && docs.length !== 1) return;
    const index = match[2] === "AL" || match[2] === "00" ? 1 : Number(match[2]);
    const d = byIndex.get(index);
    if (!d || d.stateId !== match[1]) return;
    // NPP-held seats key off holderNppId (id in `npps`); player seats off
    // holderCharacterId. holderNames is keyed by whichever id string applies.
    const holderId = d.holderCharacterId ?? d.holderNppId ?? null;
    const holderName = holderId ? (holderNames[String(holderId)] ?? null) : null;
    views.push({
      index,
      cd,
      squares: d.squares,
      netLean: d.netLean,
      greyShare: d.greyShare,
      holderParty: d.holderParty
        ? (partyLabels[d.holderParty] ??
          (/^\d+$/.test(d.holderParty) ? "Unknown party" : d.holderParty))
        : null,
      holderName,
    });
  });
  return views;
}
