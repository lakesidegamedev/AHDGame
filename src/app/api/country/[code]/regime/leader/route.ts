import { GET as handleGET } from "@/lib/api/commands/country/[code]/regime/leader/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
