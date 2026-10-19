"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function CountryForexError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load forex"
      description="The forex page failed to load. This may be a temporary issue."
      logPrefix="Country forex error"
      navigationLinks={[{ href: "/map", label: "View map" }]}
      fullScreen
    />
  );
}
