import { GET as handleGET } from "@/lib/api/commands/admin/debug/primary-projection/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
