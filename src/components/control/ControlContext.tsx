"use client";

import { createContext, useContext } from "react";
import type { StaffRole } from "@/lib/staff/rules";

export interface ControlPanelContextValue {
  role: StaffRole;
  /** False for junior devs: the server refuses every write, the UI says so. */
  canWrite: boolean;
}

/**
 * Present only inside the control panel. Shared admin components read it to
 * drop their old panel chrome (their own section nav) because the control
 * panel supplies one.
 */
export const ControlPanelContext = createContext<ControlPanelContextValue | null>(null);

export function useControlPanel(): ControlPanelContextValue | null {
  return useContext(ControlPanelContext);
}
