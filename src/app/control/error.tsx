"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ControlError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load this tool"
      description="The control panel tool failed to load. This may be a temporary issue."
      logPrefix="Control panel error"
      navigationLinks={[{ href: "/control", label: "Back to control panel" }]}
    />
  );
}
