"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { CardSkeleton, Skeleton } from "@/components/ui";
import { toolForLegacy, toolPath, type LegacyRef, type ToolDef } from "@/lib/staff/panelRegistry";
import type { StaffRole } from "@/lib/staff/rules";
import { useAdminBadgeCounts } from "@/components/admin/nav/useAdminBadgeCounts";
import type { MainTabId } from "@/components/admin/tabs/AdminTabsConfig";

const Fallback = () => (
  <CardSkeleton className="min-h-[320px] space-y-4">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </CardSkeleton>
);

// Every tool body mounts on demand; one tool is open at a time.
const lazy = <P extends object>(load: () => Promise<React.ComponentType<P>>) =>
  dynamic<P>(() => load().then((c) => ({ default: c })), { loading: Fallback, ssr: false });

const AdminDashboardTab = lazy(() =>
  import("@/components/admin/tabs/AdminDashboardTab").then((m) => m.AdminDashboardTab)
);
const AdminPoliticsTab = lazy(() =>
  import("@/components/admin/tabs/AdminPoliticsTab").then((m) => m.AdminPoliticsTab)
);
const AdminWorldTab = lazy(() =>
  import("@/components/admin/tabs/AdminWorldTab").then((m) => m.AdminWorldTab)
);
const AdminEconomyTab = lazy(() =>
  import("@/components/admin/tabs/AdminEconomyTab").then((m) => m.AdminEconomyTab)
);
const AdminContentTab = lazy(() =>
  import("@/components/admin/tabs/AdminContentTab").then((m) => m.AdminContentTab)
);
const AdminPlayersTab = lazy(() =>
  import("@/components/admin/tabs/AdminPlayersTab").then((m) => m.AdminPlayersTab)
);
const AdminSupportTab = lazy(() =>
  import("@/components/admin/tabs/AdminSupportTab").then((m) => m.AdminSupportTab)
);
const AdminSystemTab = lazy(() =>
  import("@/components/admin/tabs/AdminSystemTab").then((m) => m.AdminSystemTab)
);
const TasksPageClient = lazy(() =>
  import("@/components/admin/tasks/TasksPageClient").then((m) => m.TasksPageClient)
);
const PositionMapView = lazy(() =>
  import("@/components/positionEditor/PositionMapView").then((m) => m.PositionMapView)
);
const ModeratorPriorityTab = lazy(() =>
  import("@/components/moderator/tabs/ModeratorPriorityTab").then((m) => m.ModeratorPriorityTab)
);
const ModeratorSiteTab = lazy(() =>
  import("@/components/moderator/tabs/ModeratorSiteTab").then((m) => m.ModeratorSiteTab)
);
const ModNewsTab = lazy(() =>
  import("@/components/moderator/ModNewsTab").then((m) => m.ModNewsTab)
);
const SupporterRequestsTab = lazy(() =>
  import("@/components/moderator/SupporterRequestsTab").then((m) => m.SupporterRequestsTab)
);
const PlayerAdsModTab = lazy(() =>
  import("@/components/moderator/PlayerAdsModTab").then((m) => m.PlayerAdsModTab)
);
const ModAuditLogTab = lazy(() =>
  import("@/components/moderator/ModAuditLogTab").then((m) => m.ModAuditLogTab)
);
const UsersTab = lazy(() => import("@/components/admin/players/UsersTab").then((m) => m.UsersTab));
const AchievementsTab = lazy(() =>
  import("@/components/admin/players/AchievementsTab").then((m) => m.AchievementsTab)
);
const CharacterStateManager = lazy(() =>
  import("@/components/admin/players/CharacterStateManager").then((m) => m.CharacterStateManager)
);
const PatreonManagementTab = lazy(() =>
  import("@/components/admin/players/PatreonManagementTab").then((m) => m.PatreonManagementTab)
);
const ActivityLogTab = lazy(() =>
  import("@/components/admin/players/ActivityLogTab").then((m) => m.ActivityLogTab)
);
const SuspiciousActivityTab = lazy(() =>
  import("@/components/admin/players/SuspiciousActivityTab").then((m) => m.SuspiciousActivityTab)
);
const WikiManagementTab = lazy<{ isAdmin?: boolean }>(() =>
  import("@/components/admin/wiki/WikiManagementTab").then((m) => m.WikiManagementTab)
);
const WikiReviewTab = lazy(() =>
  import("@/components/admin/wiki/WikiReviewTab").then((m) => m.WikiReviewTab)
);
const MailReportsTab = lazy(() =>
  import("@/components/admin/content/MailReportsTab").then((m) => m.MailReportsTab)
);
const PlayerReportsTab = lazy(() =>
  import("@/components/admin/content/PlayerReportsTab").then((m) => m.PlayerReportsTab)
);
const FinancialLedgerAdminPanel = lazy(() =>
  import("@/components/admin/economy/FinancialLedgerAdminPanel").then(
    (m) => m.FinancialLedgerAdminPanel
  )
);

/** Tools whose body is the moderator-context component for moderators. */
function ModeratorTool({ id }: { id: string }) {
  switch (id) {
    case "users":
      return <UsersTab context="moderator" />;
    case "achievements":
      return <AchievementsTab context="moderator" />;
    case "characters":
      return <CharacterStateManager context="moderator" />;
    case "patreon":
      return <PatreonManagementTab context="moderator" />;
    case "activity-log":
      return <ActivityLogTab context="moderator" />;
    case "suspicious":
      return <SuspiciousActivityTab context="moderator" />;
    case "mod-audit-log":
      return <ModAuditLogTab apiBase="/api/moderator" />;
    case "banner-ads":
      return <PlayerAdsModTab />;
    case "wiki":
      return <WikiManagementTab isAdmin={false} />;
    case "financial-ledger":
      return <FinancialLedgerAdminPanel apiBase="/api/moderator/financial-logs" />;
    default:
      return null;
  }
}

/** Priority queue jumps use the old moderator tab names; resolve them. */
function ModeratorPriorityBody() {
  const router = useRouter();
  return (
    <ModeratorPriorityTab
      onJump={(tab, sub) => {
        const target = toolForLegacy("moderator", tab, sub ?? null);
        router.push(target ? toolPath(target) : "/control");
      }}
    />
  );
}

/** Tools every role with access sees the same way, regardless of context. */
const SHARED_IDS = new Set([
  "priority",
  "news",
  "supporter-requests",
  "wiki-review",
  "mail-reports",
  "player-reports",
  "site-controls",
  "tasks",
  "position-editor",
]);

function SharedTool({ id, role }: { id: string; role: StaffRole }) {
  switch (id) {
    case "priority":
      return <ModeratorPriorityBody />;
    case "news":
      return <ModNewsTab />;
    case "supporter-requests":
      return <SupporterRequestsTab />;
    case "wiki-review":
      return <WikiReviewTab />;
    case "mail-reports":
      return <MailReportsTab backHref="/control/support/mail-reports" />;
    case "player-reports":
      return <PlayerReportsTab />;
    case "site-controls":
      return <ModeratorSiteTab canChange={role === "admin"} />;
    case "tasks":
      return <TasksPageClient />;
    case "position-editor":
      return <PositionMapView />;
    default:
      return null;
  }
}

/** Admin-panel area tab that hosts `ref.sub`, opened without its own nav chrome. */
function AdminAreaBody({ tool, legacy }: { tool: ToolDef; legacy: LegacyRef }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const counts = useAdminBadgeCounts();
  const sub = legacy.sub ?? "";
  const issue = parseInt(searchParams.get("issue") ?? "", 10);
  const deepLinkIssue = Number.isNaN(issue) || issue < 1 ? undefined : issue;

  const open = (tab: string, nextSub?: string) => {
    const target = toolForLegacy("admin", tab, nextSub ?? null);
    router.replace(target ? toolPath(target) : "/control");
  };

  switch (legacy.tab) {
    case "dashboard":
      return (
        <AdminDashboardTab
          counts={counts}
          onNavigate={(tab: MainTabId, nextSub?: string) => open(tab, nextSub)}
        />
      );
    case "politics":
      return <AdminPoliticsTab activeSub={sub as never} />;
    case "world":
      return <AdminWorldTab activeSub={sub as never} />;
    case "economy":
      return <AdminEconomyTab activeSub={sub as never} />;
    case "content":
      return <AdminContentTab activeSub={sub as never} />;
    case "players":
      return <AdminPlayersTab activeSub={sub as never} />;
    case "support":
      return (
        <AdminSupportTab
          activeSub={sub as never}

          initialSuggestionIssue={sub === "suggestions" ? deepLinkIssue : undefined}
        />
      );
    case "system":
      return <AdminSystemTab activeSub={sub as never} />;
    default:
      return <p className="text-body-sm text-muted">{tool.label} is not available.</p>;
  }
}

export function ToolBody({ tool, role }: { tool: ToolDef; role: StaffRole }) {
  if (SHARED_IDS.has(tool.id)) return <SharedTool id={tool.id} role={role} />;
  if (role === "moderator") return <ModeratorTool id={tool.id} />;

  const legacy = tool.legacy?.admin;
  if (legacy) return <AdminAreaBody tool={tool} legacy={legacy} />;
  return <p className="text-body-sm text-muted">{tool.label} is not available.</p>;
}
