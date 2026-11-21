import {
  GET as handleGET,
  POST as handlePOST,
  DELETE as handleDELETE,
} from "@/lib/api/commands/admin/npps/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
