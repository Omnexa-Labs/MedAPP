"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffRepo, type StaffCreate } from "@/lib/repositories/staff";
import { Card, CardContent } from "@/components/ui/card";
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

const empty: StaffCreate = {
  full_name: "",
  email: "",
  phone: "",
  role: "cashier",
  password: "",
};

export default function StaffPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["staff"],
    queryFn: staffRepo.list,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StaffCreate>(empty);

  const createMut = useMutation({
    mutationFn: staffRepo.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setOpen(false);
      setForm(empty);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      staffRepo.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
          <p className="text-sm text-slate-500">
            Pharmacy admins, pharmacists, and cashiers
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add Staff</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell className="capitalize">
                    {s.role.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    {s.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        toggleMut.mutate({
                          id: s.id,
                          is_active: !s.is_active,
                        })
                      }
                    >
                      {s.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    No staff yet.
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
            <DialogTitle>New staff member</DialogTitle>
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
              <label className="text-sm">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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
              <label className="text-sm">Role</label>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as StaffCreate["role"] })
                }
              >
                <option value="pharmacy_admin">Pharmacy admin</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="cashier">Cashier</option>
              </Select>
            </div>
            <div>
              <label className="text-sm">Temporary password</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.full_name ||
                !form.email ||
                !form.password ||
                createMut.isPending
              }
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
