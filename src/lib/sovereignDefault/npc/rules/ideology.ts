import type { NpcIdeology } from "../npcConstants";

type PolicyPositionsLike = { economic?: number; social?: number };

export function deriveIdeology(positions: PolicyPositionsLike | undefined): NpcIdeology {
  const e = positions?.economic ?? 0;
  const s = positions?.social ?? 0;
  // Far-left economic + liberal social → socialist
  if (e < -2 && s < 1) return "socialist";
  // Free-market + traditional → conservative
  if (e > 2 && s > 1.5) return "conservative";
  // Free-market + socially-open / moderate → technocrat
  if (e > 1.5 && s < -0.5) return "technocrat";
  // Strongly traditional → nationalist (regardless of economic)
  if (s > 3) return "nationalist";
  // Extremes on either axis without fitting above → populist
  if (Math.abs(e) > 2.75 || Math.abs(s) > 2.75) return "populist";
  return "centrist";
}
