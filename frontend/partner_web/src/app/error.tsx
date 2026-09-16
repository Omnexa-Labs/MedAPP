'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="workspace panel">
      <h1>This page could not be loaded</h1>
      <p>
        Your saved applications are still available. Try loading the page again.
      </p>
      <button className="button button--primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
