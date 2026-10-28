import type { LegislativePrioritySelection } from "@/lib/demographics/legislativePriorities/rules";

/** Admin-authored content, preserved across world resets until explicitly restored. */
export interface ElectoratePriorityOverride {
  /** country:region:dimension:group, addressed only through Mongo's built-in _id index. */
  _id: string;
  countryId: string;
  regionId: string;
  bucketId: string;
  priorities: LegislativePrioritySelection;
  updatedAt: Date;
  updatedBy: string;
}
