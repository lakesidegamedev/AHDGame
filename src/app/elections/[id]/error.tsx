"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ElectionError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load election"
      description="This election page failed to load. It may have been removed or there may be a temporary issue."
      logPrefix="Election page error"
      navigationLinks={[{ href: "/elections", label: "Browse elections" }]}
    />
  );
}
