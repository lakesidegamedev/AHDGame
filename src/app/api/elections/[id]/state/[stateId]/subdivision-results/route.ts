import { GET as handleGET } from "@/lib/api/commands/elections/[id]/state/[stateId]/subdivision-results/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
