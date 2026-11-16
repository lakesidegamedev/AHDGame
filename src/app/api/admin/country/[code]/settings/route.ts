import {
  GET as handleGET,
  PATCH as handlePATCH,
} from "@/lib/api/commands/admin/country/[code]/settings/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function PATCH(...args: Parameters<typeof handlePATCH>) {
  return handlePATCH(...args);
}
