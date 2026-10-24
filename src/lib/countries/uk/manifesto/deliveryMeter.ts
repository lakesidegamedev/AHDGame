import type { Db } from "mongodb";
import type { EnactedLaw } from "@/lib/db/types/budget";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { getManifestosCollection } from "@/lib/db/collections/manifestos";
import { nationalLawCountryQuery } from "@/lib/policy/nationalPolicyRecords";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { getPledgeCatalogEntry } from "./pledgeCatalog";
import { evaluateDelivery, type EnactedPolicyLookup } from "./manifestoPopularity";
import type { Pledge } from "@/lib/db/types/manifesto";

function enactedLookup(laws: Pick<EnactedLaw, "legislationTypeId" | "policyOptionIndex">[]) {
  const lookup: EnactedPolicyLookup = {};
  for (const law of laws) {
    // Later rows win, matching "the latest enactment is the active policy".
    lookup[law.legislationTypeId] = { policyOptionIndex: law.policyOptionIndex };
  }
  return lookup;
}

/** A stored pledge resolved to the catalog entry that judges it. */
function pledgeEntries(pledges: Pledge[]) {
  return pledges.flatMap((pledge) => {
    const entry = getPledgeCatalogEntry(pledge.catalogEntryId);
    return entry
      ? [
          {
            catalogEntryId: entry.id,
            targets: entry.targets,
            targetSemantics: entry.targetSemantics,
          },
        ]
      : [];
  });
}

/**
 * How much of the sitting UK government's manifesto is still being delivered,
 * as kept / pledged (0..1), or undefined when there is nothing to judge.
 *
 * The confidence gauge has always documented a bleed for broken pledges, but
 * the turn tick never supplied a meter, so a government that tore up its
 * manifesto lost confidence only through approval (#4354). This reads the
 * governing party's most recent locked manifesto and judges it against the
 * national laws in force, which is the same delivery model the manifesto
 * scorer uses.
 *
 * Undefined (not 0) when there is no formed government, no locked manifesto,
 * or no recognised pledges: an unjudgeable government must not be treated as
 * having broken everything.
 */
export async function loadUkBrokenPromiseMeter(db: Db): Promise<number | undefined> {
  const government = await getGovernmentFormationsCollection(db).findOne(
    { _id: COUNTRY_CONFIGS.UK.id },
    { projection: { governingPartyId: 1, status: 1 } }
  );
  const party = government?.governingPartyId;
  if (!party || government?.status !== "formed") return undefined;

  const manifesto = await getManifestosCollection(db).findOne(
    { countryId: COUNTRY_CONFIGS.UK.id, party, lockedAt: { $ne: null } },
    { projection: { pledges: 1 }, sort: { createdAt: -1 } }
  );
  const entries = manifesto ? pledgeEntries(manifesto.pledges ?? []) : [];
  if (entries.length === 0) return undefined;

  const laws = await db
    .collection<EnactedLaw>("enactedLaws")
    .find(
      {
        scope: "national",
        ...nationalLawCountryQuery(COUNTRY_CONFIGS.UK.id),
        repealedAt: { $exists: false },
      },
      { projection: { legislationTypeId: 1, policyOptionIndex: 1 } }
    )
    .toArray();

  return evaluateDelivery(entries, enactedLookup(laws)).meter;
}
