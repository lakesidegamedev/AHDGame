/** Strategic directions and the two supply systems have independent activation rules. */
export function groupCapabilities(input: {
  marketSystemMode?: string;
  groupSupplyCoordinationEnabled?: boolean;
}) {
  const supplyEngineEnabled =
    input.marketSystemMode === "plants" && input.groupSupplyCoordinationEnabled === true;
  return {
    directionsEnabled: true,
    supplyEngineEnabled,
    internalSupplyEnabled: input.marketSystemMode === "plants" && !supplyEngineEnabled,
  };
}
