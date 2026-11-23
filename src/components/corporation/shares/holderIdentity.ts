import type { ShareholderInfo } from "../CorporationPageTypes";

/**
 * A stable, id-based tag for a register row, so two holders that read alike
 * can be told apart even when a name changes between loads.
 */
export function holderIdentityTag(
  sh: Pick<ShareholderInfo, "characterId" | "corporationId" | "sequentialId" | "isNpp" | "isFund">
): string | null {
  if (sh.isFund) return null;
  if (sh.corporationId && !sh.characterId) return null;
  if (!sh.isNpp && sh.sequentialId != null) return `#${sh.sequentialId}`;
  const id = sh.characterId;
  return id ? `ref ${id.slice(-6)}` : null;
}
