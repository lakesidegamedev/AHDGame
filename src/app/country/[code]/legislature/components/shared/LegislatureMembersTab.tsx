"use client";

import { LegislatureCompositionSection } from "@/components/legislature/LegislatureCompositionSection";
import type { LegislatureCompositionSectionProps } from "@/components/legislature/types";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { MembersData } from "./useLegislatureData";
import { legislatureCompositionData } from "./legislaturePresentation";
import { LegislatureRowsSkeleton } from "./LegislaturePageShell";

type Props = Omit<LegislatureCompositionSectionProps, "data" | "countryId"> & {
  members: MembersData | null;
  loading: boolean;
  countryId: CountryId;
  compositionOptions?: Parameters<typeof legislatureCompositionData>[2];
};

export function LegislatureMembersTab({
  members,
  loading,
  countryId,
  compositionOptions,
  ...props
}: Props) {
  if (loading) return <LegislatureRowsSkeleton kind="members" />;
  if (!members)
    return <p className="text-center text-sm text-muted py-12">Composition data unavailable.</p>;
  return (
    <LegislatureCompositionSection
      {...props}
      data={legislatureCompositionData(members, countryId, compositionOptions)}
      countryId={countryId}
    />
  );
}
