import { closeDb } from "../utils/db";

export async function closeResetDb(): Promise<void> {
  // Contest writes still own the connection after processTurn returns.
  while (globalThis._ahdContestsRunning) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  const applicationClient = global._mongoClientPromise;
  global._mongoClientPromise = undefined;
  try {
    if (applicationClient) await (await applicationClient).close();
  } finally {
    await closeDb();
  }
}
