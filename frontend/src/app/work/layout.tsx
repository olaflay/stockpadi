import { ExperienceShell } from "@/features/shells/ExperienceShell";

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return <ExperienceShell shell="work">{children}</ExperienceShell>;
}
