"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function SettingsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load settings"
      description="Settings failed to load. This may be a temporary issue."
      logPrefix="Settings page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
