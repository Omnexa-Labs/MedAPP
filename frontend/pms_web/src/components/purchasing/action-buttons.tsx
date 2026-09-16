import { Button } from "@/components/ui/button";
import { WriteError } from "@/components/inventory/operation-state";

export function ActionButtons({
  action,
  label,
  close,
  disabled = false,
}: {
  action: {
    busy: boolean;
    conflict: boolean;
    uncertain: boolean;
    error: string;
  };
  label: string;
  close: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      <WriteError {...action} />
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-11"
          type="submit"
          disabled={
            action.busy || action.conflict || (disabled && !action.uncertain)
          }
        >
          {action.busy
            ? "Saving…"
            : action.uncertain
              ? "Retry same request"
              : label}
        </Button>
        <Button
          className="min-h-11"
          type="button"
          variant="outline"
          disabled={action.busy || action.uncertain}
          onClick={close}
        >
          {action.conflict ? "Close and reload" : "Cancel"}
        </Button>
      </div>
    </>
  );
}
