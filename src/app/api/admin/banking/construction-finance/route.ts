import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { createAdminLog } from "@/lib/adminLog";

import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse, statusResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { setConstructionFinanceEnabled } from "@/lib/banking/constructionAdmission";

/** Finance disable must leave no cash receipt or site pledge behind. */
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const body = await parseJsonBody(request, z.object({ enabled: z.boolean() }).strict());
  if (!body.success) return errorResponse(body.status, body.error);
  const result = await setConstructionFinanceEnabled(await getDb(), body.data.enabled);
  if (result.ok)
    await createAdminLog({
      category: "system",
      action: body.data.enabled ? "construction_finance_enabled" : "construction_finance_disabled",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: `Construction finance enabled: ${body.data.enabled}`,
    });
  return statusResponse(
    result.ok ? 200 : 409,
    result.ok ? { enabled: body.data.enabled } : { error: result.error },
    { headers: { "Cache-Control": "no-store" } }
  );
});
