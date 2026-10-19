"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function PoliticiansError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The politicians page couldn't load. This may be a temporary issue."
      logPrefix="Politicians page error"
      navigationLinks={[
        { href: "/politicians", label: "Back to Politicians" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
