import { LoadingSpinner } from "@/components/ui";

/** The page resolves the player, the country's regions and the world preset before it can draw. */
export default function CampaignManagerLoading() {
  return <LoadingSpinner label="Loading Campaign Manager..." centered />;
}
