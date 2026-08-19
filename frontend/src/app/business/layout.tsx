import { ExperienceShell } from "@/features/shells/ExperienceShell";

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <ExperienceShell shell="business">{children}</ExperienceShell>;
}
