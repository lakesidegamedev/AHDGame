import { GET as handleGET } from "@/lib/api/commands/admin/elections/log/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
