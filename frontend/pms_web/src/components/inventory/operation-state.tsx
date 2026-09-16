import { Button } from "@/components/ui/button";
import { inventoryError } from "./use-inventory-action";

export function LoadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5"
    >
      <p>{inventoryError(error).message}</p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={retry}
      >
        Retry loading
      </Button>
    </div>
  );
}
export function WriteError({
  error,
  uncertain,
  conflict,
}: {
  error: string;
  uncertain: boolean;
  conflict: boolean;
}) {
  return error ? (
    <div
      role="alert"
      className="space-y-2 rounded-lg bg-red-50 p-4 text-sm text-red-900"
    >
      <p>{error}</p>
      {uncertain && (
        <p>
          Your values are kept. Use Retry same request to check or finish this
          operation without duplicating it.
        </p>
      )}
      {conflict && (
        <p>Close this form and reload the saved record before editing again.</p>
      )}
    </div>
  ) : null;
}
export function Pagination({
  offset,
  count,
  total,
  busy,
  onPage,
}: {
  offset: number;
  count: number;
  total: number;
  busy: boolean;
  onPage: (offset: number) => void;
}) {
  return (
    <nav
      aria-label="Results pages"
      className="flex flex-wrap items-center justify-between gap-3 py-4"
    >
      <p className="text-sm text-slate-600">
        {total ? `${offset + 1}–${offset + count} of ${total}` : "0 results"}
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!offset || busy}
          onClick={() => onPage(Math.max(0, offset - 25))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={offset + count >= total || busy}
          onClick={() => onPage(offset + 25)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
