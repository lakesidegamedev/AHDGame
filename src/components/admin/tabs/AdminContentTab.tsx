"use client";

import dynamic from "next/dynamic";

const WikiManagementTab = dynamic(
  () =>
    import("@/components/admin/wiki/WikiManagementTab").then((m) => ({
      default: m.WikiManagementTab,
    })),
  { ssr: false }
);
const WikiReviewTab = dynamic(
  () => import("@/components/admin/wiki/WikiReviewTab").then((m) => ({ default: m.WikiReviewTab })),
  { ssr: false }
);
const RoadmapManager = dynamic(
  () =>
    import("@/components/admin/content/RoadmapManager").then((m) => ({
      default: m.RoadmapManager,
    })),
  { ssr: false }
);

export type ContentSubTab = "wiki" | "wiki-review" | "roadmap";

interface AdminContentTabProps {
  activeSub: ContentSubTab;
}

export function AdminContentTab({ activeSub }: AdminContentTabProps) {
  return (
    <>
      <div className="space-y-6">
        {activeSub === "wiki" && <WikiManagementTab isAdmin />}
        {activeSub === "wiki-review" && <WikiReviewTab />}
        {activeSub === "roadmap" && <RoadmapManager />}
      </div>
    </>
  );
}
