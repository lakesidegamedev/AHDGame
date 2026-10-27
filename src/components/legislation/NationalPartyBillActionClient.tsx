"use client";

import { useGameEvents } from "@/hooks/useGameEvents";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { CountryId } from "@/lib/constants/countriesCore";
const Composer = dynamic(() =>
  import("@/app/country/[code]/legislature/ProposeLegislationModal").then(
    (m) => m.ProposeLegislationModal
  )
);
export function NationalPartyBillActionClient({
  countryId,
  initialChamber,
  blocked,
}: {
  countryId: CountryId;
  initialChamber: string;
  blocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useGameEvents(() => router.refresh(), ["turn_complete", "bill_enacted"]);
  const t = useTranslations("layout.guidedLegislation");
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border bg-card p-4">
        <p className="text-sm text-muted">
          {t(blocked ? "nationalPartyBillBlocked" : "nationalPartyBillHelp")}
        </p>
        <button
          disabled={blocked}
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("proposeViaPartyNpp")}
        </button>
      </div>
      {open && (
        <Composer
          countryId={countryId}
          chambers={[]}
          defaultChamber={initialChamber}
          hasActiveBill={blocked}
          proposeViaPartyNpp
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
