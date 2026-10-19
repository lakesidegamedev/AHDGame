"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function Error({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load legislature"
      description="The legislature page failed to load. This may be a temporary issue."
      logPrefix="State legislature error"
      navigationLinks={[{ href: "/map", label: "View map" }]}
      fullScreen
    />
  );
}
