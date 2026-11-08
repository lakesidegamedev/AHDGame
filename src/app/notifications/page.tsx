import { Suspense } from "react";
import { InboxClient } from "./inbox/InboxClient";

export default function NotificationsPage() {
  // Message bodies are excluded from PostHog session replay.
  return (
    <div data-replay-block>
      <Suspense fallback={null}>
        <InboxClient />
      </Suspense>
    </div>
  );
}
