import { lawsFromJson } from "@/lib/politicalLegislation/laws/catalogFile";
import type { PoliticalLaw } from "@/lib/politicalLegislation/types";
import catalog from "./ukLawCatalog.json";

/**
 * The UK authored law book. The content is `ukLawCatalog.json`; edit that
 * file, and `validateCatalog` (run by the catalog test) checks its rules.
 */
export const UK_LAWS: PoliticalLaw[] = lawsFromJson(catalog, "UK");
