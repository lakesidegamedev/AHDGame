import { ObjectId } from "mongodb";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import type { User, ImperialCharacter } from "@/lib/db/types";
import { corporationPathIdFromDoc } from "@/lib/api/corporations/resolveQuery";
import { handleRouteError } from "@/lib/api/errors";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";
import { usersCollection } from "@/lib/db/repositories/users";

export const dynamic = "force-dynamic";

// Auth: signed-in account. Resolve on arrival, never from a cached navbar id.
export async function GET(request: Request) {
  // Relative Location on purpose: behind the production proxy request.url is the
  // internal origin, so an absolute URL built from it sends the browser to a dead host.
  const redirect = (path: string) =>
    new Response(null, {
      status: 307,
      headers: { Location: path, "Cache-Control": "private, no-store" },
    });
  try {
    const auth = await getAuthUser();
    if (!auth) return redirect("/login");
    const db = await getDb();
    const userId = new ObjectId(auth.userId);
    const user = await usersCollection(db).findOne(
      { _id: userId },
      {
        projection: {
          activeCharacterId: 1,
          activeCharacterType: 1,
          activeImperialCharacterId: 1,
        },
      }
    );
    if (!user) return redirect("/login");
    const imperial = user.activeCharacterType === "imperial";
    const character = imperial
      ? user.activeImperialCharacterId
        ? await imperialCharactersCollection(db).findOne(
            { _id: user.activeImperialCharacterId, userId },
            { projection: { _id: 1 } }
          )
        : null
      : await (
          await getCharactersCollection(db)
        ).findOne(user.activeCharacterId ? { _id: user.activeCharacterId, userId } : { userId }, {
          projection: { _id: 1 },
        });
    if (!character) return redirect("/market");
    const corporation = await (
      await getCorporationsCollection(db)
    ).findOne(
      {
        ceoId: character._id,
        ceoVacant: { $ne: true },
        imfInstitution: { $ne: true },
        ...(imperial ? { ceoType: "imperial" as const } : {}),
      },
      { projection: { _id: 1, sequentialId: 1 } }
    );
    return redirect(
      corporation ? `/corporation/${corporationPathIdFromDoc(corporation)}` : "/market"
    );
  } catch (error) {
    const response = handleRouteError(error, { request, route: "/api/corporations/mine" });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
