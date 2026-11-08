import { notFound } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { AdminRegimePanel } from "@/components/admin/AdminRegimePanel";

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Regime override panel for a one-party state: force-stage, set-scalar and
 * force-conversion forms plus the country's escalation state and recent
 * transitions. Writes are admin-only at the route level; junior devs see it
 * read-only, moderators do not see it.
 */
export default async function RegimeOverridePage({ params }: Props) {
  const staff = await getAuthStaff();
  if (!staff || staff.staffRole === "moderator") notFound();
  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) notFound();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-heading-sm font-semibold text-foreground">
          Regime override: {COUNTRY_CONFIGS[countryId].name}
        </h1>
        <p className="mt-1 text-body-sm text-muted">
          Each action writes to the country&apos;s regime-escalation history with an admin override
          tag for audit.
        </p>
      </div>
      <AdminRegimePanel countryCode={countryId} />
    </section>
  );
}
