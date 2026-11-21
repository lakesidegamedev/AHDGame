export const ACCOUNT_CHANGED_MESSAGE =
  "Your signed-in account changed. Reload this page before linking Discord or creating a character. Your saved draft is kept for the original account.";

export function providerLinkSessionStatus(
  expectedUserId: string | null,
  currentUserId: unknown
): "same" | "changed" | "unknown" {
  if (!expectedUserId || typeof currentUserId !== "string" || !currentUserId) return "unknown";
  return currentUserId === expectedUserId ? "same" : "changed";
}
