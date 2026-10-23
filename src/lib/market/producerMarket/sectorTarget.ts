/** The physical identity a producer plan settles against. */
import type { CorporateSector } from "@/lib/db/types";
import type { ProducerCapacityState } from "./capacityRules";

export interface ProducerSectorTarget {
  producerId: string;
  sectorId: string;
  corporationId: string;
  capacity: ProducerCapacityState;
  operatingRecipeRatio: number;
  recessionCapacityFactor: number;
  plantType: Pick<CorporateSector, "sectorType" | "industryModel" | "mediaDiscriminator">;
}
