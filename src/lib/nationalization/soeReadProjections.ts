import { CORPORATE_SECTOR_LEAN_FIELDS } from "@/lib/db/collections/corporateSectors";

/** Reporting needs the funded generation marker, not each commodity lot. */
export const SOE_REPORTING_SECTOR_FIELDS = {
  ...CORPORATE_SECTOR_LEAN_FIELDS,
  "producerInventory.inputStock": 0,
  "producerInventory.outputStock": 0,
} as const;
