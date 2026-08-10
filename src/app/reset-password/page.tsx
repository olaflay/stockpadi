import { generateCsrfToken } from "@/lib/csrf";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const csrfToken = await generateCsrfToken();
  return <ResetPasswordForm csrfToken={csrfToken} />;
}
