"use client";

import { PositionLabel } from "@/components/PositionLabel";

/** Display a player/opponent economic position using canonical labels */
export function EconomicPositionPip({ value }: { value: number }) {
  return <PositionLabel value={value} axis="economic" className="text-body-sm font-medium" />;
}

/** Display a player/opponent social position using canonical labels */
export function SocialPositionPip({ value }: { value: number }) {
  return <PositionLabel value={value} axis="social" className="text-body-sm font-medium" />;
}
