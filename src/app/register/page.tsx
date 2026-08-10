import { generateCsrfToken } from "@/lib/csrf";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const csrfToken = await generateCsrfToken();
  return <RegisterForm csrfToken={csrfToken} />;
}
