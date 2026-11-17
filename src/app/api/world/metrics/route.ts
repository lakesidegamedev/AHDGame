import { GET as handleGET } from "@/lib/api/commands/world/metrics/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
