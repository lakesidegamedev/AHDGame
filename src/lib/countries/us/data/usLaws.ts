import { lawsFromJson } from "@/lib/politicalLegislation/laws/catalogFile";
import type { PoliticalLaw } from "@/lib/politicalLegislation/types";
import catalog from "./usLawCatalog.json";

/**
 * The US authored law book. The content is `usLawCatalog.json`; edit that
 * file, and `validateCatalog` (run by the catalog test) checks its rules.
 */
export const US_LAWS: PoliticalLaw[] = lawsFromJson(catalog, "US");
