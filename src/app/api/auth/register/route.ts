import { POST as handlePOST } from "@/lib/api/commands/auth/register/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
