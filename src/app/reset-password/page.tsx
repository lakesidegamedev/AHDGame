import { Suspense } from "react";
import { AccountFieldsNoticePage } from "@/components/auth/AccountFieldsNotice";
import { getAccountFieldsMode } from "@/lib/auth/accountFields/mode";
import ResetPasswordPageClient from "./ResetPasswordPageClient";

export const metadata = {
  title: "Reset password | A House Divided",
};

// The switch is read per request, not frozen at build time.
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  const mode = getAccountFieldsMode();
  if (mode !== "off") {
    return <AccountFieldsNoticePage kind="reset" mode={mode} title="Reset password" />;
  }
  return (
    <Suspense>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
