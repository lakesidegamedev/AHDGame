import {
  GET as handleGET,
  POST as handlePOST,
  PATCH as handlePATCH,
  DELETE as handleDELETE,
} from "@/lib/api/commands/admin/country/[code]/elections/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function PATCH(...args: Parameters<typeof handlePATCH>) {
  return handlePATCH(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
