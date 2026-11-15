import { redirect } from "next/navigation";

// Wars live on the crisis board now; the sub-pages under /world/conflicts stay.
export default function ConflictsPage() {
  redirect("/world/crises?view=conflicts");
}
