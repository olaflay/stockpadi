import { AuthProvider } from "@/features/auth/AuthProvider";
import { AdminGate } from "@/features/shells/AdminGate";
import { AdminShell } from "@/features/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminGate>
        <AdminShell>{children}</AdminShell>
      </AdminGate>
    </AuthProvider>
  );
}
