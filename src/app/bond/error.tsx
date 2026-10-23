"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function BondError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load bond"
      description="This bond page failed to load. This may be a temporary issue."
      logPrefix="Bond page error"
      navigationLinks={[
        { href: "/portfolio", label: "Back to Portfolio" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
