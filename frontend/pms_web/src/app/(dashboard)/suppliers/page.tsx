"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { suppliersRepo, type SupplierCreate } from "@/lib/repositories/suppliers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierCreate>({ name: "" });

  const createMut = useMutation({
    mutationFn: suppliersRepo.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      setForm({ name: "" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500">Wholesalers and manufacturers</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add Supplier</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contact_person || "—"}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell>{s.address || "—"}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(["name", "contact_person", "phone", "email", "address", "notes"] as const).map(
              (f) => (
                <div key={f}>
                  <label className="text-sm capitalize">{f.replace("_", " ")}</label>
                  <Input
                    value={(form as unknown as Record<string, string | undefined>)[f] ?? ""}
                    onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  />
                </div>
              )
            )}
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
