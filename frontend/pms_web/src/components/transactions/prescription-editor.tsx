"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionButtons } from "@/components/purchasing/action-buttons";
import { useInventoryAction } from "@/components/inventory/use-inventory-action";
import {
  prescriptionsRepo,
  type Prescription,
  type RxCreate,
} from "@/lib/repositories/prescriptions";
import type { DrugWithStock } from "@/lib/repositories/drugs";
import type { Customer } from "@/lib/repositories/customers";
import { CustomerPicker, DrugPicker } from "./shared";

export function PrescriptionEditor({
  done,
  close,
}: {
  done: (rx: Prescription) => void;
  close: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [prescriber, setPrescriber] = useState(""),
    [license, setLicense] = useState("");
  const [source, setSource] = useState<RxCreate["source"]>("walk_in"),
    [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    { drug: DrugWithStock; quantity: string; dosage: string }[]
  >([]);
  const [error, setError] = useState("");
  const action = useInventoryAction(done);
  return (
    <form
      className="space-y-4 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (
          !lines.length ||
          lines.some(
            (l) =>
              !/^\d+$/.test(l.quantity) ||
              Number(l.quantity) < 1 ||
              Number(l.quantity) > 1000000,
          )
        ) {
          setError("Enter a whole prescribed quantity for every item.");
          return;
        }
        const body: RxCreate = {
          customer_id: customer?.id,
          prescriber_name: prescriber || undefined,
          prescriber_license: license || undefined,
          source,
          notes: notes || undefined,
          items: lines.map((l) => ({
            drug_id: l.drug.id,
            quantity_prescribed: Number(l.quantity),
            dosage_instructions: l.dosage || undefined,
          })),
        };
        void action.run((signal, key) =>
          prescriptionsRepo.create(body, key, signal),
        );
      }}
    >
      <h2 className="text-xl font-semibold">Record prescription</h2>
      <p>
        Copy the medicines and instructions from the prescription supplied to
        the pharmacy.
      </p>
      <fieldset className="space-y-4" disabled={action.locked}>
        <CustomerPicker value={customer} onChange={setCustomer} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Prescriber
            <Input
              value={prescriber}
              maxLength={255}
              onChange={(e) => setPrescriber(e.target.value)}
            />
          </label>
          <label>
            Prescriber license
            <Input
              value={license}
              maxLength={64}
              onChange={(e) => setLicense(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          Source
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as RxCreate["source"])}
          >
            <option value="walk_in">Walk-in</option>
            <option value="internal">Internal</option>
          </Select>
        </label>
        <DrugPicker
          add={(drug) =>
            setLines((current) =>
              current.some((l) => l.drug.id === drug.id)
                ? current
                : [...current, { drug, quantity: "1", dosage: "" }],
            )
          }
        />
        {lines.map((line, i) => (
          <div key={line.drug.id} className="space-y-2 rounded-lg border p-3">
            <h3 className="font-semibold">
              {line.drug.name} · {line.drug.strength}
            </h3>
            <label className="block">
              Prescribed quantity
              <Input
                aria-label={`Prescribed quantity for ${line.drug.name}`}
                type="number"
                min={1}
                max={1000000}
                step={1}
                required
                value={line.quantity}
                onChange={(e) =>
                  setLines(
                    lines.map((l, index) =>
                      index === i ? { ...l, quantity: e.target.value } : l,
                    ),
                  )
                }
              />
            </label>
            <label className="block">
              Dosage instructions
              <Input
                aria-label={`Dosage for ${line.drug.name}`}
                value={line.dosage}
                maxLength={512}
                onChange={(e) =>
                  setLines(
                    lines.map((l, index) =>
                      index === i ? { ...l, dosage: e.target.value } : l,
                    ),
                  )
                }
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines(lines.filter((l) => l !== line))}
            >
              Remove {line.drug.name}
            </Button>
          </div>
        ))}
        <label className="block">
          Prescription notes
          <Input
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <ActionButtons
        action={action}
        label="Save prescription"
        close={close}
        disabled={!lines.length || lines.length > 100}
      />
    </form>
  );
}
