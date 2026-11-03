"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import type { Character } from "@/lib/db/types";

// Both panels are full campaign screens (CanvassingPanel alone is ~620 lines)
// and only mount after the player opens the modal, so they must not sit in the
// /actions initial chunk. The modal itself is already only rendered on demand.
const TargetedAdsPanel = dynamic(
  () => import("@/app/campaign/[id]/components/TargetedAdsPanel").then((m) => m.TargetedAdsPanel),
  { ssr: false, loading: () => <ModalPanelSkeleton /> }
);
const CanvassingPanel = dynamic(
  () => import("@/app/campaign/[id]/components/CanvassingPanel").then((m) => m.CanvassingPanel),
  { ssr: false, loading: () => <ModalPanelSkeleton /> }
);

function ModalPanelSkeleton() {
  return <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden="true" />;
}

export function CampaignActionModal({
  action,
  character,
  onClose,
  onResourcesSpent,
}: {
  action: "canvass" | "targetedAds" | null;
  character: Character;
  onClose: () => void;
  onResourcesSpent: () => void;
}) {
  const t = useTranslations("elections.campaignTargeting");
  return (
    <Modal
      open={action !== null}
      title={t(action === "canvass" ? "canvassTitle" : "title")}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      scrollable
    >
      {action === "targetedAds" && <TargetedAdsPanel onResourcesSpent={onResourcesSpent} />}
      {action === "canvass" && (
        <CanvassingPanel
          countryId={character.countryId}
          characterActions={character.actions}
          characterFunds={character.currencyBalances?.campaign ?? character.funds ?? 0}
          onResourcesSpent={onResourcesSpent}
        />
      )}
    </Modal>
  );
}
