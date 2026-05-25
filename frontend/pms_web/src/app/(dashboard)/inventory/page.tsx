"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { drugsRepo, type DrugCreate } from "@/lib/repositories/drugs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/utils";

const empty: DrugCreate = {
  name: "",
  category: "general",
  form: "tablet",
  strength: "",
  unit: "tablet",
  reorder_level: 10,
  default_selling_price_cents: 0,
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const { data: drugs = [], isLoading } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DrugCreate>(empty);
  const [search, setSearch] = useState("");

  const createMut = useMutation({
    mutationFn: drugsRepo.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drugs"] });
      setOpen(false);
      setForm(empty);
    },
  });

  const filtered = drugs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Drug catalog and live stock levels</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add Drug</Button>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search drugs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-slate-500">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Strength</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.name}
                      {d.brand_name && (
                        <span className="ml-1 text-xs text-slate-500">
                          ({d.brand_name})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{d.category}</TableCell>
                    <TableCell>{d.strength}</TableCell>
                    <TableCell className="text-right">{d.quantity_on_hand}</TableCell>
                    <TableCell className="text-right">{d.reorder_level}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(d.default_selling_price_cents, d.currency)}
                    </TableCell>
                    <TableCell>
                      {d.quantity_on_hand <= d.reorder_level ? (
                        <Badge variant="warning">Low</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No drugs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add new drug</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Brand</label>
              <Input
                value={form.brand_name ?? ""}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Category</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Form</label>
              <Select
                value={form.form}
                onChange={(e) => setForm({ ...form, form: e.target.value })}
              >
                <option value="tablet">tablet</option>
                <option value="capsule">capsule</option>
                <option value="syrup">syrup</option>
                <option value="injection">injection</option>
                <option value="cream">cream</option>
                <option value="drops">drops</option>
                <option value="other">other</option>
              </Select>
            </div>
            <div>
              <label className="text-sm">Strength</label>
              <Input
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Unit</label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Reorder level</label>
              <Input
                type="number"
                value={form.reorder_level}
                onChange={(e) =>
                  setForm({ ...form, reorder_level: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm">Default sell price (cents)</label>
              <Input
                type="number"
                value={form.default_selling_price_cents}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_selling_price_cents: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="rx"
                type="checkbox"
                checked={form.requires_prescription ?? false}
                onChange={(e) =>
                  setForm({ ...form, requires_prescription: e.target.checked })
                }
              />
              <label htmlFor="rx" className="text-sm">
                Requires prescription
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.name || createMut.isPending}
              onClick={() => createMut.mutate(form)}
            >
              {createMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
