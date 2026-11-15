/** Build the per-run indexes used by NPP corporation decisions. */
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { NPP } from "@/lib/db/types/npp";
import { deriveCeoArchetype, type CeoArchetype } from "@/lib/turn/ceoArchetype";

type NppPersonalityRow = Pick<NPP, "_id"> & Partial<Pick<NPP, "personality">>;
type NppDecisionCorporation = Pick<Corporation, "_id" | "ceoId" | "ceoType">;

export function nppDecisionCohortIds(corporations: NppDecisionCorporation[]) {
  return {
    corporationIds: corporations.map((corp) => corp._id),
    ceoNppIds: corporations.flatMap((corp) =>
      corp.ceoType === "npp" && corp.ceoId ? [corp.ceoId] : []
    ),
  };
}

/**
 * Index the fetched decision snapshots without changing their ordering or identity.
 * Equal-turn price rows preserve the coordinator's last-row-wins behavior.
 */
export function buildNppCorporationDecisionIndexes<
  TSector extends Pick<CorporateSector, "corporationId">,
  TPrice extends { commodity: string; turn?: number },
>(ceoNpps: NppPersonalityRow[], allSectors: TSector[], commodityPriceDocs: TPrice[]) {
  const archetypeByNppId = new Map<string, CeoArchetype>();
  for (const npp of ceoNpps) {
    if (npp.personality) {
      archetypeByNppId.set(npp._id.toString(), deriveCeoArchetype(npp.personality));
    }
  }

  const sectorsByCorp = new Map<string, TSector[]>();
  for (const sector of allSectors) {
    const corporationId = sector.corporationId.toString();
    if (!sectorsByCorp.has(corporationId)) sectorsByCorp.set(corporationId, []);
    sectorsByCorp.get(corporationId)!.push(sector);
  }

  const priceByCommodity = new Map<string, TPrice>();
  for (const doc of commodityPriceDocs) {
    const existing = priceByCommodity.get(doc.commodity);
    if (!existing || (doc.turn ?? 0) >= (existing.turn ?? 0)) {
      priceByCommodity.set(doc.commodity, doc);
    }
  }

  return { archetypeByNppId, sectorsByCorp, priceByCommodity };
}
