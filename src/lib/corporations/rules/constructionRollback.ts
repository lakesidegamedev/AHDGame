import type { CorporateSector, SectorBuildOrder } from "@/lib/db/types/corporation";
import { deliveredFraction, resolveBuildSettledTurn } from "../buildDelivery";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { seedPlantLedger } from "../plantLedger";
import { wholePlantsIn } from "../wholePlants/rules";
import { activeCapacityFraction } from "../investment/rules";

/** Reverse credited construction, not deliveries which have only become due.
 * Whole-plant construction credit is capacity too, but cannot be made into an
 * operating fractional plant by a refund. Existing wear and parking survive.
 */
export function rollbackConstruction(
  sector: CorporateSector,
  orders: readonly SectorBuildOrder[],
  turn: number,
  wholePlants = false
) {
  const settled = resolveBuildSettledTurn(
    turn,
    sector.buildDeliverySettledTurn,
    sector.operatingCapacityTurn
  );
  const units = orders.reduce(
    (sum, order) => sum + order.unitsOrdered * deliveredFraction(order, settled),
    0
  );
  const book = orders.reduce(
    (sum, order) => sum + order.costPaidAnchor * deliveredFraction(order, settled),
    0
  );
  const size = plantSizeForSector(sector);
  const retained = Math.max(
    0,
    (sector.capitalStock ?? 0) + (wholePlants ? (sector.plantUnitRemainder ?? 0) : 0) - units
  );
  const count = wholePlants ? wholePlantsIn(retained, size) : 0;
  const stock = wholePlants ? count * size : retained;
  return {
    capitalStock: stock,
    operatingCapacityUnits: stock * activeCapacityFraction(sector),
    capacityBookAnchor: Math.max(0, (sector.capacityBookAnchor ?? 0) - book),
    ...(wholePlants
      ? {
          plantCount: count,
          plantUnitRemainder: Math.max(0, retained - stock),
          plantWearUnits: count > 0 ? (sector.plantWearUnits ?? 0) : 0,
        }
      : seedPlantLedger(sector, stock)),
  };
}
