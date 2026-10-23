"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ForexError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load forex"
      description="The forex page failed to load. This may be a temporary issue."
      logPrefix="Forex page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
      fullScreen
    />
  );
}
