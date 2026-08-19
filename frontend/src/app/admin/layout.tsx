import { AuthProvider } from "@/features/auth/AuthProvider";
import { AdminGate } from "@/features/shells/AdminGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AdminGate>{children}</AdminGate></AuthProvider>;
}
