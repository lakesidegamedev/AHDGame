"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { LegislatureSkeleton } from "./LegislatureSkeleton";

const USCongressPage = dynamic(
  () => import("@/app/congress/CongressClient").then((module) => module.USCongressPage),
  { ssr: false }
);

export function USLegislatureClient() {
  return (
    <Suspense fallback={<LegislatureSkeleton />}>
      <USCongressPage countryId="US" />
    </Suspense>
  );
}
