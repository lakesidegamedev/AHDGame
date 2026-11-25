import Link from "next/link";
import { crisesCollection } from "@/lib/db/repositories/crises";
import { getDb } from "@/lib/mongodb";

export async function CountryCrisisNotice({
  countryId,
  regionId,
  className,
}: {
  countryId: string;
  regionId?: string;
  className?: string;
}) {
  const db = await getDb();
  const crises = await crisesCollection(db)
    .find(
      {
        status: "active",
        $or: [
          { scope: "country", countryIds: countryId },
          { scope: "global", countryIds: countryId },
          { scope: "global", countryIds: { $size: 0 } },
          ...(regionId ? [{ scope: "region" as const, regionIds: regionId }] : []),
        ],
      },
      { projection: { name: 1 }, sort: { startTurn: -1, _id: -1 }, limit: regionId ? 5 : undefined }
    )
    .toArray();

  if (crises.length === 0) return null;

  return (
    // A notice above the page title, not a page section: a labelled aside with
    // a plain title, so the page's own H1 stays first in the heading outline.
    <aside
      aria-label="Active crises"
      className={`rounded-xl border border-card-border bg-card px-4 py-3 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-semibold text-foreground">Active crises</p>
        <Link className="text-body text-primary hover:underline" href="/world/crises">
          Crisis board
        </Link>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body">
        {crises.map((crisis) => (
          <li key={crisis._id.toString()}>
            <Link
              className="text-foreground underline underline-offset-2"
              href={`/world/crises/${crisis._id.toString()}`}
            >
              {crisis.name}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
