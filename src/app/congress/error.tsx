"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function CongressError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The Congress page couldn't load. This may be a temporary issue."
      logPrefix="Congress page error"
      navigationLinks={[
        { href: "/congress?chamber=senate&tab=bills", label: "Back to Senate bills" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
