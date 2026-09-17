"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadError } from "@/components/inventory/operation-state";
import {
  moneyToCents,
  useInventoryAction,
} from "@/components/inventory/use-inventory-action";
import { ActionButtons } from "@/components/purchasing/action-buttons";
import {
  correctionsRepo as repo,
  type Correction,
  type CorrectionCreate,
  type Refund,
  type ReconcilePrescription,
} from "@/lib/repositories/sale-corrections";
import type { Sale } from "@/lib/repositories/sales";
import type { Prescription } from "@/lib/repositories/prescriptions";
import type { PaymentMethod } from "@/lib/repositories/transactions";
import { formatCents } from "@/lib/utils";

type Completion = { number?: string; sale_number?: string };
type Callbacks = { done: (result: Completion) => void; close: () => void };
function CorrectionReview({
  sale,
  body,
  done,
  close,
}: { sale: Sale; body: CorrectionCreate } & Callbacks) {
  const [key] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ["correction-quote", key],
    queryFn: ({ signal }) => repo.quote(sale.id, body, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const action = useInventoryAction<Correction>(done, true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (query.data && !query.isError)
          void action.run((signal, requestId) =>
            repo.correct(sale.id, body, requestId, signal),
          );
      }}
    >
      <h3 className="text-lg font-semibold">Review correction</h3>
      <p>
        {body.kind === "not_collected"
          ? "These medicines never left pharmacy custody. Stock will return to the original batches; their expiry and archive rules still apply. Prescription quantities will be corrected."
          : "These medicines were returned by the customer. Keep them separate from usable stock. The original prescription dispensing quantities will remain recorded."}
      </p>
      <p>Reason: {body.reason}</p>
      {query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : !query.data ? (
        <p role="status">Calculating credit…</p>
      ) : (
        <>
          <ul className="divide-y">
            {query.data.items.map((line) => (
              <li className="py-2" key={line.sale_item_id}>
                {
                  sale.items.find((item) => item.id === line.sale_item_id)
                    ?.drug_name_snapshot
                }{" "}
                · {line.quantity} units ·{" "}
                {formatCents(line.credit_cents, sale.currency)}
              </li>
            ))}
          </ul>
          <p className="font-semibold">
            Credit: {formatCents(query.data.credit_cents, sale.currency)}
          </p>
          <p className="text-sm">
            Includes the original discount and tax allocation. This creates a
            credit; record any completed refund separately.
          </p>
        </>
      )}
      <ActionButtons
        action={action}
        label="Save correction"
        close={close}
        disabled={!query.data || query.isError || query.isFetching}
      />
    </form>
  );
}
export function CorrectionEditor({
  sale,
  rx,
  done,
  close,
}: { sale: Sale; rx?: Prescription } & Callbacks) {
  const [kind, setKind] = useState<CorrectionCreate["kind"] | "">("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const [review, setReview] = useState<CorrectionCreate | null>(null);
  const lacksLinks =
    !!sale.prescription_id &&
    sale.items.some((item) => !item.prescription_item_id);
  if (review)
    return (
      <CorrectionReview sale={sale} body={review} done={done} close={close} />
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const items = sale.items.map((item) => ({
          sale_item_id: item.id,
          quantity: Number(quantities[item.id] || "0"),
        }));
        if (
          !kind ||
          !confirmed ||
          reason.trim().length < 3 ||
          sale.items.some(
            (item, index) =>
              !/^\d+$/.test(quantities[item.id] || "0") ||
              items[index].quantity >
                item.quantity - (item.corrected_quantity || 0),
          ) ||
          !items.some((item) => item.quantity > 0)
        ) {
          setError(
            "Choose a disposition, enter valid remaining quantities and a reason, and confirm the stock details.",
          );
          return;
        }
        setReview({
          version: sale.version,
          prescription_version: rx?.version,
          kind,
          stock_confirmed: true,
          reason: reason.trim(),
          items: items.filter((item) => item.quantity > 0),
        });
      }}
    >
      <h3 className="text-lg font-semibold">Correct receipt quantities</h3>
      <label className="block">
        Stock disposition
        <Select
          required
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as CorrectionCreate["kind"]);
            setConfirmed(false);
          }}
        >
          <option value="">Choose what happened</option>
          <option value="not_collected" disabled={lacksLinks}>
            Never collected — retained in pharmacy
          </option>
          <option value="customer_return">
            Customer return — exclude from usable stock
          </option>
        </Select>
      </label>
      {lacksLinks && (
        <p>
          An administrator must verify the older prescription-line links before
          correcting an uncollected dispense.
        </p>
      )}
      {sale.items
        .filter((item) => item.quantity > (item.corrected_quantity || 0))
        .map((item, i) => (
          <label className="block" key={item.id}>
            {item.drug_name_snapshot} · receipt line {i + 1} ·{" "}
            {item.quantity - (item.corrected_quantity || 0)} available
            <Input
              aria-label={`Correction quantity line ${i + 1}`}
              type="number"
              step={1}
              min={0}
              max={item.quantity - (item.corrected_quantity || 0)}
              value={quantities[item.id] || ""}
              placeholder="0"
              onChange={(e) =>
                setQuantities({ ...quantities, [item.id]: e.target.value })
              }
            />
          </label>
        ))}
      <label className="block">
        Correction reason
        <Input
          required
          minLength={3}
          maxLength={255}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          className="mt-1 size-5"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {kind === "not_collected"
          ? "I verified these units never left pharmacy custody and belong in their original stock batches."
          : "I verified the returned units and will keep them outside usable stock for the pharmacy’s return/disposal process."}
      </label>
      {rx?.source === "medapp" && (
        <p className="text-sm">
          A MedApp report is saved with this correction. Check MedApp delivery
          on the prescription to confirm receipt or resolve a delivery problem.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={!kind || !confirmed}>
          Review correction
        </Button>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function RefundEditor({
  sale,
  done,
  close,
}: { sale: Sale } & Callbacks) {
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const action = useInventoryAction<Refund>(done, true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const cents = moneyToCents(amount);
          if (
            !cents ||
            cents > (sale.refundable_cents || 0) ||
            !method ||
            !confirmed ||
            reason.trim().length < 3 ||
            reference.trim().length < 3
          )
            throw new Error(
              "Enter a positive amount within the remaining credit, the payment reference and reason, and confirm the refund was completed.",
            );
          void action.run((signal, key) =>
            repo.refund(
              sale.id,
              {
                version: sale.version,
                amount_cents: cents,
                payment_method: method,
                payment_ref: reference.trim(),
                reason: reason.trim(),
                payment_confirmed: true,
              },
              key,
              signal,
            ),
          );
        } catch (error) {
          setError((error as Error).message);
        }
      }}
    >
      <h3 className="text-lg font-semibold">Record completed refund</h3>
      <p>
        Remaining credit:{" "}
        {formatCents(sale.refundable_cents || 0, sale.currency)}. Complete the
        refund through your payment process first, then record its actual
        details here.
      </p>
      <fieldset className="space-y-3" disabled={action.locked}>
        <label className="block">
          Refund amount ({sale.currency})
          <Input
            value={amount}
            inputMode="decimal"
            required
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block">
          Refund method
          <Select
            required
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            <option value="">Choose refund method</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile_money">Mobile money</option>
            <option value="insurance">Insurance</option>
          </Select>
        </label>
        <label className="block">
          Refund reference
          <Input
            value={reference}
            required
            minLength={3}
            maxLength={128}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="block">
          Refund reason
          <Input
            value={reason}
            required
            minLength={3}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm this refund was completed outside the portal.
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <ActionButtons
        action={action}
        label="Save refund record"
        close={close}
        disabled={!confirmed}
      />
    </form>
  );
}
export function ReconcileEditor({
  sale,
  rx,
  done,
  close,
}: { sale: Sale; rx: Prescription } & Callbacks) {
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sale.items.map((item) => [item.id, item.prescription_item_id || ""]),
    ),
  );
  const [reason, setReason] = useState("");
  const action = useInventoryAction<Sale>(done, true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          reason.trim().length < 3 ||
          sale.items.some((item) => !links[item.id])
        )
          return;
        const body: ReconcilePrescription = {
          version: sale.version,
          prescription_version: rx.version,
          reason: reason.trim(),
          allocations: sale.items.map((item) => ({
            sale_item_id: item.id,
            prescription_item_id: links[item.id],
          })),
        };
        void action.run((signal, key) =>
          repo.reconcile(sale.id, body, key, signal),
        );
      }}
    >
      <h3 className="text-lg font-semibold">Verify older prescription links</h3>
      <p>
        Use the original dispensing records to link every receipt line to its
        prescribed item. This records provenance without changing stock or
        quantities.
      </p>
      <fieldset className="space-y-3" disabled={action.locked}>
        {sale.items.map((item, i) => (
          <label className="block" key={item.id}>
            {item.drug_name_snapshot} · receipt line {i + 1} · {item.quantity}{" "}
            units
            <Select
              aria-label={`Prescription link line ${i + 1}`}
              required
              value={links[item.id]}
              disabled={!!item.prescription_item_id}
              onChange={(e) =>
                setLinks({ ...links, [item.id]: e.target.value })
              }
            >
              <option value="">Select the verified prescription item</option>
              {rx.items
                .filter((line) => line.drug_id === item.drug_id)
                .map((line, index) => (
                  <option key={line.id} value={line.id}>
                    Item {index + 1}:{" "}
                    {line.dosage_instructions || "No dosage recorded"} ·{" "}
                    {line.quantity_prescribed} prescribed /{" "}
                    {line.quantity_dispensed} dispensed
                  </option>
                ))}
            </Select>
          </label>
        ))}
        <label className="block">
          Records review note
          <Input
            value={reason}
            required
            minLength={3}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </fieldset>
      <ActionButtons
        action={action}
        label="Save verified links"
        close={close}
        disabled={
          reason.trim().length < 3 || sale.items.some((item) => !links[item.id])
        }
      />
    </form>
  );
}
export function RefundVoidEditor({
  sale,
  refund,
  done,
  close,
}: { sale: Sale; refund: Refund } & Callbacks) {
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const action = useInventoryAction<Refund>(done, true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed && reason.trim().length >= 3)
          void action.run((signal, key) =>
            repo.voidRefund(
              sale.id,
              refund.id,
              {
                version: sale.version,
                reason: reason.trim(),
                entry_was_incorrect: true,
              },
              key,
              signal,
            ),
          );
      }}
    >
      <h3 className="text-lg font-semibold">
        Correct refund entry {refund.number}
      </h3>
      <p>
        Use this only if the recorded refund did not happen or its entry was
        incorrect. The original entry stays visible. This does not reverse a
        real payment.
      </p>
      <fieldset className="space-y-3" disabled={action.locked}>
        <label className="block">
          Correction reason
          <Input
            value={reason}
            required
            minLength={3}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I verified this refund entry was incorrect.
        </label>
      </fieldset>
      <ActionButtons
        action={action}
        label="Mark entry incorrect"
        close={close}
        disabled={!confirmed || reason.trim().length < 3}
      />
    </form>
  );
}
