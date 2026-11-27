import type { ReactNode } from "react";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <div className="contents financial-surfaces">{children}</div>;
}
