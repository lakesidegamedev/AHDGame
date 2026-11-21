import { GET as handleGET } from "@/lib/api/commands/sectors/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
