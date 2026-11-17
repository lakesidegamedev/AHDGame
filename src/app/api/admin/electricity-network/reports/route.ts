import { REPORTS as handleGET } from "@/lib/api/commands/admin/electricity-network/handlers";
export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
