/** Actor kind is part of identity, including while an old motion is still open. */
export function noConfidenceTargetStillInOffice(
  government: { status: string; pmCharacterId?: string | null; pmNppId?: string | null } | null,
  vote: { targetPmCharacterId?: string | null; targetPmNppId?: string | null }
): boolean {
  if (government?.status !== "formed") return false;
  if (vote.targetPmCharacterId && !vote.targetPmNppId)
    return government.pmCharacterId === vote.targetPmCharacterId && !government.pmNppId;
  if (vote.targetPmNppId && !vote.targetPmCharacterId)
    return government.pmNppId === vote.targetPmNppId && !government.pmCharacterId;
  return false;
}
