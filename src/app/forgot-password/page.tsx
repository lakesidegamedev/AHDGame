import { AccountFieldsNoticePage } from "@/components/auth/AccountFieldsNotice";
import { getAccountFieldsMode } from "@/lib/auth/accountFields/mode";
import ForgotPasswordPageClient from "./ForgotPasswordPageClient";

export const metadata = {
  title: "Forgot password | A House Divided",
};

// The switch is read per request, not frozen at build time.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const mode = getAccountFieldsMode();
  if (mode !== "off") {
    return <AccountFieldsNoticePage kind="reset" mode={mode} title="Forgot password" />;
  }
  return <ForgotPasswordPageClient />;
}
