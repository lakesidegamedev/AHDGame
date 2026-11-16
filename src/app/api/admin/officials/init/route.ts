import {
  POST as handlePOST,
  DELETE as handleDELETE,
  GET as handleGET,
} from "@/lib/api/commands/admin/officials/init/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
