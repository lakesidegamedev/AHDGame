"use client";

import { useWorldFlags } from "@/hooks/useWorldFlags";
import { ResetMetricsPage } from "../metrics/ResetMetricsPage";
import PoliticalMetricsClient from "./PoliticalMetricsClient";
import { isResetV2Country, type ResetV2Country } from "@/lib/resetVersions/rules";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import type { CountryId } from "@/lib/constants/countriesCore";

/** Shown when this world has no detailed metrics board for a nation. */
export function NoMetricsBoardNotice({ countryId }: { countryId: string }) {
  const name = COUNTRY_CLIENT_CONFIGS[countryId as CountryId]?.name ?? countryId;
  return (
    <p
      role="alert"
      className="mx-auto mt-8 max-w-3xl rounded-lg border border-card-border bg-card p-4 text-muted"
    >
      {name} has no detailed metrics board in this world. Its national figures are on the{" "}
      <a href="/world/rankings" className="text-foreground underline underline-offset-4">
        World rankings
      </a>{" "}
      page.
    </p>
  );
}

export function PoliticalMetricsGate({ code }: { code: string }) {
  const countryId = code.toUpperCase();
  const resetCountry: ResetV2Country | null = isResetV2Country(countryId) ? countryId : null;
  const { loaded, failed, resetSystemVersions, resetV2Countries } = useWorldFlags();

  if (!resetCountry) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <PoliticalMetricsClient code={code.toLowerCase()} />
      </div>
    );
  }

  if (!loaded) {
    return <p role="status">Loading world settings...</p>;
  }

  const selectedV2 = resetSystemVersions.metrics === "v2";
  const verifiedV2 = selectedV2 && resetV2Countries.includes(resetCountry);
  if (!failed && selectedV2 && !verifiedV2) {
    return <NoMetricsBoardNotice countryId={countryId} />;
  }
  if (failed) {
    return (
      <p
        role="alert"
        className="mx-auto mt-8 max-w-3xl rounded-lg border border-error/40 bg-error/10 p-4 text-error"
      >
        The metrics version for this country could not be verified. Legacy metrics were not loaded.
      </p>
    );
  }

  if (verifiedV2) {
    return <ResetMetricsPage country={resetCountry} />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PoliticalMetricsClient code={code.toLowerCase()} />
    </div>
  );
}

export default PoliticalMetricsGate;
