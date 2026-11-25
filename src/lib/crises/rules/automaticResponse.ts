import type { CrisisDecisionNode } from "@/lib/db/types/crisis";

export function automaticCrisisOption(node: CrisisDecisionNode) {
  return node.options?.find((option) => option.optionId === "decline") ?? node.options?.[0];
}
