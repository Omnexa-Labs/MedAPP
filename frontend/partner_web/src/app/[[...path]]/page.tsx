import { Suspense } from 'react';
import { PartnerApp } from '@/components/app';
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="workspace" role="status">
          Loading MedApp Partner…
        </main>
      }
    >
      <PartnerApp />
    </Suspense>
  );
}
