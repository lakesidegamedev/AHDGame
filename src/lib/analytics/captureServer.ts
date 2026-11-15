import type { GameIteration } from "@/lib/db/types/gameState";
import { gameEventEnvelope } from "./gameEventEnvelope";

/** Server events are sent to PostHog with the same event name and properties. */
export async function captureServerProductEvent(
  event: string,
  properties: Record<string, string | number | boolean>,
  context?: { iteration?: GameIteration | null; turn?: number }
): Promise<void> {
  const eventProperties = {
    ...properties,
    ...gameEventEnvelope(
      context?.iteration,
      context?.turn ??
        (typeof properties.turn_number === "number" ? properties.turn_number : undefined)
    ),
  };
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const distinctId = "system:turn-processor";
  const results = await Promise.allSettled([
    posthogKey
      ? fetch("https://us.i.posthog.com/i/v0/e/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: posthogKey,
            event,
            distinct_id: distinctId,
            properties: eventProperties,
          }),
          signal: AbortSignal.timeout(2000),
        })
      : Promise.resolve(),
  ]);
  for (const result of results) {
    const response = result.status === "fulfilled" ? result.value : undefined;
    if (result.status === "rejected" || (response && !response.ok)) {
      console.warn(
        `[Analytics] PostHog rejected ${event}: ${response ? response.status : "network error"}`
      );
    }
  }
}
