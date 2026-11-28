import type { SovereignResolutionChoice } from "@/lib/db/types/budget";

export interface ExecutivePoliticalImpact {
  favorabilityDelta: number;
  infamyDelta: number;
}

const IMPACT_BY_PATH: Record<SovereignResolutionChoice, ExecutivePoliticalImpact> = {
  repudiate: { favorabilityDelta: -20, infamyDelta: 15 },
  monetize: { favorabilityDelta: -15, infamyDelta: 10 },
  bailout: { favorabilityDelta: -10, infamyDelta: 5 },
  restructure: { favorabilityDelta: -8, infamyDelta: 5 },
};

export function computeExecutivePoliticalImpact(
  choice: SovereignResolutionChoice
): ExecutivePoliticalImpact {
  return IMPACT_BY_PATH[choice];
}
