import { POST as handlePOST } from "@/lib/api/commands/auth/login/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
