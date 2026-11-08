import { redirect } from "next/navigation";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { DEFENSE_POSITION_BY_COUNTRY } from "@/lib/constants/military";
import type { CountryId } from "@/lib/constants/countries";

// The Military Commands builder now lives in the Secretary-of-Defense office
// (Commands tab). This route redirects there for the viewer's country.
export default async function MilitaryCommandsRedirect() {
  const authUser = await getAuthUserWithCharacter();
  const country = (authUser?.character?.countryId ?? "US") as CountryId;
  const position = DEFENSE_POSITION_BY_COUNTRY[country];
  if (!position) redirect("/world");

  redirect(`/country/${country.toLowerCase()}/executive/cabinet/${position}/office`);
}
