"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function CountryPartiesError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load parties"
      description="The parties page failed to load. This may be a temporary issue."
      logPrefix="Country parties error"
      navigationLinks={[{ href: "/map", label: "View map" }]}
      fullScreen
    />
  );
}
