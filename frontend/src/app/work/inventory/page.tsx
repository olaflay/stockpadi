import { InventoryView } from "@/features/inventory/InventoryView";
import { WorkerRoute } from "@/features/shells/WorkerRoute";
export default function WorkerInventoryPage() { return <WorkerRoute><InventoryView worker /></WorkerRoute>; }
