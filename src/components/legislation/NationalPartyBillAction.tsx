import { hasBillLifecycle } from "@/lib/legislature/hasBillLifecycle";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getGameState } from "@/lib/gameState";
import { loadRuntimeCountryOffices } from "@/lib/countries/runtimeOffices";
import { getOfficeTypeForChamber } from "@/lib/legislature/chamberOfficeType";
import { resolveNationalPartyNppAccess } from "@/lib/legislature/queries/nationalPartyNppAccess";
import type { CountryId } from "@/lib/constants/countries";
import { NationalPartyBillActionClient } from "./NationalPartyBillActionClient";
export async function NationalPartyBillAction({ countryId }: { countryId: CountryId }) {
  if (!hasBillLifecycle(countryId)) return null;
  const auth = await getAuthUserWithCharacter();
  if (!auth?.character) return null;
  const db = await getDb();
  const state = await getGameState(db);
  const { config } = await loadRuntimeCountryOffices(db, countryId, state?.preset);
  if (
    config.legislature.lowerChamber.elected === false ||
    config.legislature.lowerChamber.seats < 1
  )
    return null;
  const lower = config.legislature.lowerChamber,
    upper = config.legislature.upperChamber;
  const chambers = config.legislature.bicameral && upper ? [lower, upper] : [lower];
  const access = await resolveNationalPartyNppAccess(
    db,
    countryId,
    auth.character,
    chambers.map((c) => ({
      chamber: c.key,
      officeType: getOfficeTypeForChamber(countryId, c.key, state?.preset, config),
    }))
  );
  if (!access.authorized) return null;
  return (
    <NationalPartyBillActionClient
      countryId={countryId}
      initialChamber={lower.key}
      blocked={access.blocked}
      unavailable={!access.blocked && !access.sponsor}
    />
  );
}
