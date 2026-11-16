import { GET as handleGET } from "@/lib/api/commands/corporations/[id]/expand-suggestions/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
