"use client";

import dynamic from "next/dynamic";

const FeedbackTab = dynamic(
  () => import("@/components/admin/feedback/FeedbackTab").then((m) => ({ default: m.FeedbackTab })),
  { ssr: false }
);
const LogsTab = dynamic(
  () => import("@/components/admin/system/LogsTab").then((m) => ({ default: m.LogsTab })),
  { ssr: false }
);
const DebugTab = dynamic(
  () => import("@/components/admin/system/DebugTab").then((m) => ({ default: m.DebugTab })),
  { ssr: false }
);
const MigrationsTab = dynamic(
  () =>
    import("@/components/admin/system/MigrationsTab").then((m) => ({ default: m.MigrationsTab })),
  { ssr: false }
);
const MailReportsTab = dynamic(
  () =>
    import("@/components/admin/content/MailReportsTab").then((m) => ({
      default: m.MailReportsTab,
    })),
  { ssr: false }
);
const PlayerReportsTab = dynamic(
  () =>
    import("@/components/admin/content/PlayerReportsTab").then((m) => ({
      default: m.PlayerReportsTab,
    })),
  { ssr: false }
);
const SuggestionsTab = dynamic(
  () =>
    import("@/components/admin/suggestions/SuggestionsTab").then((m) => ({
      default: m.SuggestionsTab,
    })),
  { ssr: false }
);

const PollBannerTab = dynamic(
  () =>
    import("@/components/admin/support/PollBannerTab").then((m) => ({
      default: m.PollBannerTab,
    })),
  { ssr: false }
);

export type SupportSubTab =
  | "suggestions"
  | "feedback"
  | "logs"
  | "debug"
  | "migrations"
  | "mail-reports"
  | "player-reports"
  | "poll-banner";

interface AdminSupportTabProps {
  activeSub: SupportSubTab;
  initialFeedbackIssue?: number;
  initialSuggestionIssue?: number;
}

export function AdminSupportTab({
  activeSub,
  initialFeedbackIssue,
  initialSuggestionIssue,
}: AdminSupportTabProps) {
  return (
    <>
      <div className="space-y-6">
        {activeSub === "suggestions" && (
          <SuggestionsTab initialIssueNumber={initialSuggestionIssue} />
        )}
        {activeSub === "feedback" && <FeedbackTab initialIssueNumber={initialFeedbackIssue} />}
        {activeSub === "logs" && <LogsTab />}
        {activeSub === "debug" && <DebugTab />}
        {activeSub === "migrations" && <MigrationsTab />}
        {activeSub === "poll-banner" && <PollBannerTab />}
        {activeSub === "mail-reports" && (
          <MailReportsTab backHref="/control/support/mail-reports" />
        )}
        {activeSub === "player-reports" && <PlayerReportsTab />}
      </div>
    </>
  );
}
