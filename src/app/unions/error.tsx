"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function UnionsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load unions"
      description="The unions page failed to load. This may be a temporary issue."
      logPrefix="Unions page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
