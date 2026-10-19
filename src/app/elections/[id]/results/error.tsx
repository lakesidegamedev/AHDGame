"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ElectionResultsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load live results"
      description="The election results page failed to load. There may be a temporary issue."
      logPrefix="Election results page error"
      navigationLinks={[{ href: "/elections", label: "Browse elections" }]}
    />
  );
}
