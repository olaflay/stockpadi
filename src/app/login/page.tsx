import { generateCsrfToken } from "@/lib/csrf";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const csrfToken = await generateCsrfToken();
  return <LoginForm csrfToken={csrfToken} />;
}
