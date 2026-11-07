import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import type { NPP } from "@/lib/db/types";
import type { Db } from "@/lib/mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { selectPoliticianImage, weightedRandomEthnicity } from "@/lib/npp/generator";

/**
 * Give every active NPP without an avatar a generic portrait.
 *
 * Uses the same demographic pick as NPP generation, so the stored avatar is an
 * opaque portrait path. It never stores a raw source URL, whose file name
 * would identify the person in the photograph.
 */
export async function handleBackfillImages(db: Db): Promise<NextResponse> {
  try {
    const nppsWithoutAvatar = await db
      .collection<NPP>("npps")
      .find({ retiredAt: null, avatarUrl: { $exists: false } })
      .project<Pick<NPP, "_id" | "name" | "countryId" | "gender" | "ethnicity">>({
        name: 1,
        countryId: 1,
        gender: 1,
        ethnicity: 1,
      })
      .toArray();

    if (nppsWithoutAvatar.length === 0) {
      return NextResponse.json({ message: "No NPPs need backfilling.", updated: 0 });
    }

    const now = new Date();
    const ops = nppsWithoutAvatar.flatMap((npp) => {
      // Legacy NPPs predate stored countries and demographics.
      const countryId = (npp.countryId ?? "US") as CountryId;
      const avatarUrl = selectPoliticianImage(
        countryId,
        npp.gender ?? (Math.random() < 0.5 ? "male" : "female"),
        npp.ethnicity ?? weightedRandomEthnicity(countryId),
        npp.name
      );
      return avatarUrl
        ? [
            {
              updateOne: {
                filter: { _id: npp._id },
                update: { $set: { avatarUrl, updatedAt: now } },
              },
            },
          ]
        : [];
    });

    if (ops.length > 0) await db.collection<NPP>("npps").bulkWrite(ops);

    return NextResponse.json({
      message: `Successfully backfilled avatars for ${ops.length} NPPs.`,
      updated: ops.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
