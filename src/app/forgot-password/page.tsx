import { generateCsrfToken } from "@/lib/csrf";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const csrfToken = await generateCsrfToken();
  return <ForgotPasswordForm csrfToken={csrfToken} />;
}
