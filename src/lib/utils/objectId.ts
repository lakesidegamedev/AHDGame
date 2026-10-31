import { ObjectId } from "mongodb";

/**
 * Safely parse a string into a MongoDB ObjectId.
 * Returns the ObjectId if valid, or null if the string is invalid.
 * Use this in API routes with dynamic [id] params to avoid uncaught exceptions.
 */
export function parseObjectId(id: string | null | undefined): ObjectId | null {
  if (id == null || typeof id !== "string" || id.trim() === "") {
    return null;
  }
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}
