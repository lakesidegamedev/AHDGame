"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function MapError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load the map"
      description="The map failed to load. This may be a temporary issue."
      logPrefix="Map page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
