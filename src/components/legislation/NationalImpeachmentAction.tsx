import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { Character, ElectedOfficial } from "@/lib/db/types";
import { getExecutiveOfficialFilter } from "@/lib/elections/executiveOfficeFilters";
import ImpeachmentPanel from "@/app/whitehouse/ImpeachmentPanel";

/** The legislature offers the same filing flow as the executive's office. */
export async function NationalImpeachmentAction({ countryId }: { countryId: CountryId }) {
  if (COUNTRY_CONFIGS[countryId]?.governmentType !== "presidential") return null;
  const auth = await getAuthUserWithCharacter();
  if (!auth?.character) return null;
  const db = await getDb();
  const official = await db
    .collection<ElectedOfficial>("electedOfficials")
    .findOne(getExecutiveOfficialFilter(countryId, "president"), {
      projection: { characterId: 1 },
    });
  if (!official?.characterId) return null;
  const target = await db
    .collection<Character>("characters")
    .findOne({ _id: official.characterId }, { projection: { name: 1 } });
  if (!target) return null;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-8">
      <ImpeachmentPanel
        countryId={countryId}
        targetCharacterId={target._id.toString()}
        targetName={target.name}
        isViewerTarget={auth.character._id.equals(target._id)}
      />
    </div>
  );
}
