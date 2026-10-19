"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function SingleplayerError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load singleplayer"
      description="Singleplayer failed to load. This may be a temporary issue."
      logPrefix="Singleplayer page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
