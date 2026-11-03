import { isFinishedPrimary, type CmRace, type RaceFilter } from "./rules";
import type { CmLinkFilter } from "./links";

/**
 * The filter the page opens on before the player chooses one: the linked
 * race's type and region (a finished race on Finished at its year), else the
 * player's own race, else the first race type nationwide; link params win over
 * each of those. A link to a race the index does not hold (gone, presidential,
 * another country's) opens the same way as no link.
 */
export function openingFilter(
  races: CmRace[],
  pickedKey: string | null,
  initial: Partial<CmLinkFilter>
): Omit<RaceFilter, "regionNames"> | null {
  const linked = races.find((r) => r.key === pickedKey);
  const mine = races.find((r) => r.isMine && r.stage !== "final");
  const start = linked ?? mine ?? races[0];
  const type = initial.type ?? start?.electionType;
  if (!type) return null;
  const linkedFinal = linked && linked.stage === "final" && !isFinishedPrimary(linked);
  return {
    type,
    stage: initial.stage ?? (linkedFinal ? "final" : "all"),
    regionId: initial.regionId ?? (start && (linked || mine) ? start.regionId : "ALL"),
    query: "",
    year: initial.year ?? (linkedFinal ? linked.year : null),
    party: initial.party ?? null,
  };
}
