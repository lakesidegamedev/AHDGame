import { lawsFromJson } from "@/lib/politicalLegislation/laws/catalogFile";
import type { PoliticalLaw } from "@/lib/politicalLegislation/types";
import catalog from "./ruLawCatalog.json";

/**
 * The RU authored law book. The content is `ruLawCatalog.json`; edit that
 * file, and `validateCatalog` (run by the catalog test) checks its rules.
 */
export const RU_LAWS: PoliticalLaw[] = lawsFromJson(catalog, "RU");
