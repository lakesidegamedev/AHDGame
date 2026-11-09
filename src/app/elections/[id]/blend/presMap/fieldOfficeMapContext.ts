"use client";

import { createContext, useContext } from "react";

/**
 * How the state overview's own blocks reach the map: the "Open a field office
 * in this state" link flies the map into that state's counties in a
 * field-office view. Absent where there is no field-office layer (Race mode),
 * and the link falls back to the campaign page.
 */
export interface FieldOfficeMapControl {
  showFieldOffices: (stateId: string) => void;
  /** The map is beside the overview and can fly to a state. False on a phone. */
  canZoom: boolean;
}

const FieldOfficeMapContext = createContext<FieldOfficeMapControl | null>(null);

export const FieldOfficeMapProvider = FieldOfficeMapContext.Provider;

export function useFieldOfficeMapControl(): FieldOfficeMapControl | null {
  return useContext(FieldOfficeMapContext);
}
