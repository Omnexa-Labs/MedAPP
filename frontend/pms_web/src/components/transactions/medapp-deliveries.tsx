"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  LoadError,
  Pagination,
  WriteError,
} from "@/components/inventory/operation-state";
import { useInventoryAction } from "@/components/inventory/use-inventory-action";
import {
  deliveriesRepo as repo,
  type MedAppDelivery,
} from "@/lib/repositories/medapp-deliveries";
import { formatDateTime } from "@/lib/utils";
import { useCanDispense } from "./shared";

const states: Record<MedAppDelivery["state"], string> = {
  pending: "Queued",
  sending: "Sending",
  retry: "Waiting to retry",
  delivered: "Received by MedApp",
  attention_required: "Needs attention",
};
const errors: Record<string, string> = {
  patient_link_missing:
    "This historical prescription has no verified patient link. Ask your administrator to reconcile the original record.",
  workspace_unavailable:
    "The pharmacy was not linked when this report was saved. Ask your administrator to reconcile the original record.",
  snapshot_invalid:
    "The original prescription record needs administrator review before it can be shared.",
  sync_not_configured:
    "Ask your administrator to complete MedApp delivery setup, then retry.",
  deployment_mismatch:
    "Ask your administrator to check the pharmacy deployment, then retry.",
  receiver_rejected:
    "MedApp did not accept this report. Ask your administrator to check the integration before retrying.",
  retry_limit_reached:
    "Automatic attempts have paused. Check the connection with your administrator, then retry.",
  transport_unavailable: "The connection failed. Another attempt is scheduled.",
  receiver_unavailable:
    "MedApp is temporarily unavailable. Another attempt is scheduled.",
  acknowledgement_invalid:
    "MedApp receipt could not be confirmed. Another attempt is scheduled.",
  acknowledgement_mismatch:
    "MedApp receipt could not be matched. Another attempt is scheduled.",
};
function RetryDelivery({
  rxId,
  row,
  close,
}: {
  rxId: string;
  row: MedAppDelivery;
  close: () => void;
}) {
  const action = useInventoryAction(close, true);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p>
        Retry update {row.sequence}. The saved report will be sent again;
        dispensing and payments stay recorded once.
      </p>
      <WriteError {...action} />
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={action.busy || action.conflict}
          onClick={() =>
            void action.run((signal, key) => repo.retry(rxId, row, key, signal))
          }
        >
          {action.busy
            ? "Queuing…"
            : action.uncertain
              ? "Retry same request"
              : "Queue retry"}
        </Button>
        <Button variant="outline" disabled={action.busy} onClick={close}>
          Close
        </Button>
      </div>
    </div>
  );
}
export function MedAppDeliveries({ rxId }: { rxId: string }) {
  const [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<MedAppDelivery | null>(null);
  const canRetry = useCanDispense();
  const query = useQuery({
    queryKey: ["prescriptions", rxId, "medapp-deliveries", offset],
    queryFn: ({ signal }) => repo.page(rxId, offset, signal),
    refetchInterval: selected ? false : 15000,
  });
  const close = () => {
    setSelected(null);
    void query.refetch();
  };
  return (
    <section
      aria-label="MedApp delivery"
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <h2 className="text-xl font-semibold">MedApp delivery</h2>
      <p>
        Saved pharmacy reports are sent automatically. Check the latest update
        before confirming that MedApp has received a correction.
      </p>
      {query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">Loading delivery status…</p>
      ) : (
        <>
          {query.data.items.length ? (
            <ol className="space-y-3">
              {query.data.items.map((row) => (
                <li key={row.id} className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">
                    Update {row.sequence} · {row.kind} · {states[row.state]}
                  </h3>
                  <p>
                    Saved {formatDateTime(row.created_at)} · {row.attempts}{" "}
                    delivery attempts
                  </p>
                  {row.delivered_at && (
                    <p>Received {formatDateTime(row.delivered_at)}</p>
                  )}
                  {row.last_error && (
                    <p>
                      {errors[row.last_error] ||
                        "Contact your administrator to review this delivery."}
                    </p>
                  )}
                  {row.state === "retry" && (
                    <p>Next attempt: {formatDateTime(row.next_attempt_at)}</p>
                  )}
                  {canRetry && row.can_retry && (
                    <Button
                      variant="outline"
                      disabled={!!selected || query.isFetching}
                      onClick={() => setSelected(row)}
                    >
                      Retry update {row.sequence}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>
              No delivery reports are recorded for this prescription. Historical
              records are not sent automatically.
            </p>
          )}
          <Pagination
            offset={offset}
            count={query.data.items.length}
            total={query.data.total}
            busy={query.isFetching || !!selected}
            onPage={setOffset}
          />
        </>
      )}
      {selected && (
        <RetryDelivery
          key={selected.id}
          rxId={rxId}
          row={selected}
          close={close}
        />
      )}
      <Button
        variant="outline"
        disabled={query.isFetching || !!selected}
        onClick={() => void query.refetch()}
      >
        Refresh delivery status
      </Button>
    </section>
  );
}
