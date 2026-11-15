import { lawsFromJson } from "@/lib/politicalLegislation/laws/catalogFile";
import type { PoliticalLaw } from "@/lib/politicalLegislation/types";
import catalog from "./ddLawCatalog.json";

/**
 * The DD authored law book. The content is `ddLawCatalog.json`; edit that
 * file, and `validateCatalog` (run by the catalog test) checks its rules.
 */
export const DD_LAWS: PoliticalLaw[] = lawsFromJson(catalog, "DD");
