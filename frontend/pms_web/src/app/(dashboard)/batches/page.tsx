import { Suspense } from "react";
import { BatchesScreen } from "@/components/inventory/batches-screen";
export default function BatchesPage() {
  return (
    <Suspense fallback={<p role="status">Loading batches…</p>}>
      <BatchesScreen />
    </Suspense>
  );
}
