import {
  POST as handlePOST,
  PATCH as handlePATCH,
  DELETE as handleDELETE,
} from "@/lib/api/commands/country/[code]/central-bank/intervention/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function PATCH(...args: Parameters<typeof handlePATCH>) {
  return handlePATCH(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
