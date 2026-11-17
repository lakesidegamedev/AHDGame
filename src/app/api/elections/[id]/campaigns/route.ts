import { GET as handleGET } from "@/lib/api/commands/elections/[id]/campaigns/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
