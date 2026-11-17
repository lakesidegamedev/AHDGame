import { GET as handleGET } from "@/lib/api/commands/wiki/elections/[id]/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
