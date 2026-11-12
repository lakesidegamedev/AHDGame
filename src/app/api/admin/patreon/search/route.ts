import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { searchPatreonUsers } from "@/lib/patreon/staffUserSearch";

export const GET = withAdminRoute(async (_auth, request: Request) => {
  const { searchParams } = new URL(request.url);
  const users = await searchPatreonUsers(
    searchParams.get("q")?.trim() ?? "",
    searchParams.get("characterId") ?? "",
    { excludeAdmins: false }
  );
  return NextResponse.json({ users });
});
