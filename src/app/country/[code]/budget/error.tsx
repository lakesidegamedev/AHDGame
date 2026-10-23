"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function NationalBudgetError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load national budget"
      description="The national budget page failed to load. This may be a temporary issue."
      logPrefix="National budget error"
      navigationLinks={[{ href: "/map", label: "View map" }]}
      fullScreen
    />
  );
}
