import { ObjectId } from "mongodb";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { User, Character, ImperialCharacter } from "@/lib/db/types";
import type { Corporation } from "@/lib/db/types/corporation";
import { corporationPathIdFromDoc } from "@/lib/api/corporations/resolveQuery";
import { handleRouteError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

// Auth: signed-in account. Resolve on arrival, never from a cached navbar id.
export async function GET(request: Request) {
  const redirect = (path: string) =>
    // Relative Location: request.url is the internal origin behind the proxy.
    new Response(null, {
      status: 307,
      headers: { Location: path, "Cache-Control": "private, no-store" },
    });
  try {
    const auth = await getAuthUser();
    if (!auth) return redirect("/login");
    const db = await getDb();
    const userId = new ObjectId(auth.userId);
    const user = await db.collection<User>("users").findOne(
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
        ? await db
            .collection<ImperialCharacter>("imperialCharacters")
            .findOne({ _id: user.activeImperialCharacterId, userId }, { projection: { _id: 1 } })
        : null
      : await db
          .collection<Character>("characters")
          .findOne(user.activeCharacterId ? { _id: user.activeCharacterId, userId } : { userId }, {
            projection: { _id: 1 },
          });
    if (!character) return redirect("/market");
    const corporation = await db.collection<Corporation>("corporations").findOne(
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
