import type { BroadcastSink, PublishedMessage } from "./broadcast";
import type { BroadcastChannel, EventSeverity } from "./types";

/**
 * Broadcast sinks: the concrete destinations the bus delivers to. The collecting
 * sink is for tests and dry-runs; a real integration supplies its own thin
 * adapter so the bus stays pure.
 */

/** Records everything delivered; used by tests and by a dry-run preview. */
export function collectingSink(
  channel: BroadcastChannel,
  minSeverity: EventSeverity = "minor"
): BroadcastSink & { messages: PublishedMessage[] } {
  const messages: PublishedMessage[] = [];
  return {
    channel,
    minSeverity,
    messages,
    async deliver(message) {
      messages.push(message);
    },
  };
}
