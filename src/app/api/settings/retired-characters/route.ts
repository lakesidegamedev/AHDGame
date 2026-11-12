// GET — Fetches all retired characters for the authenticated user's account
// Auth: requireBasicAuth (no character needed)
// Errors: 401

import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError } from "@/lib/api/errors";
import { ObjectId } from "mongodb";
import { retiredCharactersCollection } from "@/lib/db/repositories/retiredCharacters";
import type { Document } from "mongodb";

async function handleGET() {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const userId = new ObjectId(auth.user.userId);

    const retired = await retiredCharactersCollection<Document>(db)
      .find({ userId })
      .sort({ retiredAt: -1 })
      .toArray();

    return NextResponse.json({ retiredCharacters: retired });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
