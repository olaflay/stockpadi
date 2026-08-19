import { AuthProvider } from "@/features/auth/AuthProvider";

/** Onboarding is an authenticated continuation, not a public application screen. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
