/** Offline adapter to the unmodified production kernels; no database calls. */
import { ObjectId } from "mongodb";
import { computeExtractionCapacityMultipliers } from "../../../src/lib/turn/extraction/extractionCapacity";
import { royaltyDueAnchor } from "../../../src/lib/turn/extraction/contractSettlement";
import type { StateResourceCapacity } from "../../../src/lib/db/types/stateResourceCapacity";
import type { ExtractionContract } from "../../../src/lib/db/types/extractionContract";
import type { ExtractableResource } from "../../../src/lib/constants/commodities";
import type { Kernels } from "./model";
const holder = new ObjectId("000000000000000000000001"),
  others = new ObjectId("000000000000000000000002");
export function productionKernels(
  resource: ExtractableResource = "iron",
  unitCapacity = 1,
  unitPrice = 1
): Kernels {
  return {
    allocate(flow, contractedShare) {
      const inputs = [
        {
          sectorId: "holder",
          stateId: "sim",
          corporationId: holder,
          revenueBasedOutput: { [resource]: flow.holder * unitCapacity },
        },
        {
          sectorId: "others",
          stateId: "sim",
          corporationId: others,
          revenueBasedOutput: { [resource]: flow.others * unitCapacity },
        },
      ];
      const capacities = [
        {
          stateId: "sim",
          resources: { [resource]: flow.capacity * unitCapacity },
        } as StateResourceCapacity,
      ];
      const contracts =
        contractedShare === undefined
          ? []
          : [
              {
                stateId: "sim",
                resource,
                corporationId: holder,
                share: contractedShare,
              } as ExtractionContract,
            ];
      const multipliers = computeExtractionCapacityMultipliers(inputs, contracts, capacities);
      return {
        holder: flow.holder * (multipliers.get("holder")?.[resource] ?? 1),
        others: flow.others * (multipliers.get("others")?.[resource] ?? 1),
      };
    },
    royalty: (rate, share, capacity, price) =>
      royaltyDueAnchor(rate, share, capacity * unitCapacity, price * unitPrice) /
      (unitCapacity * unitPrice),
  };
}
