import { redirect } from "next/navigation";

/**
 * /corporations was folded into the market hub, whose stocks tab handles
 * listings, founding and filtering. The proxy answers this path with a single
 * redirect so the request never renders; this page is the fallback for any
 * request that reaches the route directly.
 */
export default function CorporationsRedirect() {
  redirect("/market?tab=stocks");
}
