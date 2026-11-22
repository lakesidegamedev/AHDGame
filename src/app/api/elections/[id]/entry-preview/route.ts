import { GET as handleGET } from "@/lib/api/commands/elections/[id]/entry-preview/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
