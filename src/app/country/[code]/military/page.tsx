import { notFound, redirect } from "next/navigation";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { defenseSeatUrl } from "@/lib/military/defenseSeatUrl";

export const dynamic = "force-dynamic";

/** The military has no page of its own; it lives in the defence seat's office. */
export default async function MilitaryRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) notFound();
  redirect(defenseSeatUrl(countryId));
}
