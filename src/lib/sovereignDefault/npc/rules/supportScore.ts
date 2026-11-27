import type { NPP } from "@/lib/db/types/npp";
import type { SovereignResolutionChoice } from "@/lib/db/types/budget";

export function computeNpcSupportScore(
  npp: Pick<NPP, "policies" | "personality">,
  choice: SovereignResolutionChoice
): number {
  const e = npp.policies?.economic ?? 0;
  const s = npp.policies?.social ?? 0;
  const loyalty = (npp.personality?.loyalty ?? 50) / 100;

  // Base: loyalty pulls support toward 0.55 (slight default-for bias).
  let score = 0.5 + (loyalty - 0.5) * 0.1;

  if (choice === "bailout") {
    if (e > 1.5) score += 0.15; // free-market backs bailout
    if (e < -2.5) score -= 0.15; // far-left opposes
  } else if (choice === "restructure") {
    if (e > 0) score += 0.1;
    if (e < -2.5 && s > 0) score -= 0.1;
  } else if (choice === "monetize") {
    if (e < -1.5 || s < -2.5) score += 0.15; // populist/socialist favor
    if (e > 2.5) score -= 0.15; // conservatives oppose
  } else if (choice === "repudiate") {
    if (e < -2.5 || s > 3) score += 0.2; // populist/nationalist back
    if (e > 1.5 && s < 1.5) score -= 0.15; // technocrats oppose
  }

  return Math.max(0, Math.min(1, score));
}
