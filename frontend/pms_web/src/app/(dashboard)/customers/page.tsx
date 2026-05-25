"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customersRepo,
  type CustomerCreate,
} from "@/lib/repositories/customers";
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

export default function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => customersRepo.list(search || undefined),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerCreate>({ full_name: "" });

  const createMut = useMutation({
    mutationFn: customersRepo.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setForm({ full_name: "" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Repeat buyers and Rx patients</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add Customer</Button>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>MedApp ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell>{c.email || "—"}</TableCell>
                  <TableCell>{c.date_of_birth || "—"}</TableCell>
                  <TableCell>{c.medapp_user_id || "—"}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">
                    No customers yet.
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
            <DialogTitle>New customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm">Full name</label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm">Phone</label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Email</label>
              <Input
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Date of birth</label>
              <Input
                type="date"
                value={form.date_of_birth ?? ""}
                onChange={(e) =>
                  setForm({ ...form, date_of_birth: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.full_name || createMut.isPending}
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
