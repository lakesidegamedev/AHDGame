import {
  GET as handleGET,
  PATCH as handlePATCH,
  POST as handlePOST,
} from "@/lib/api/commands/admin/corporations/[id]/imf-bailout/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function PATCH(...args: Parameters<typeof handlePATCH>) {
  return handlePATCH(...args);
}

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
