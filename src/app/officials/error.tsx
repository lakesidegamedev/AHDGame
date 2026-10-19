"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function OfficialsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The officials page couldn't load. This may be a temporary issue."
      logPrefix="Officials page error"
      navigationLinks={[
        { href: "/officials", label: "Back to Officials" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
