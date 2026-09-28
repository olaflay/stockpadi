import SharedPage from "@/app/(app)/more/page";
import { WorkerRoute } from "@/features/shells/WorkerRoute";

export default function WorkerMorePage() {
  return (
    <WorkerRoute>
      <SharedPage />
    </WorkerRoute>
  );
}
