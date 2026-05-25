"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { drugsRepo } from "@/lib/repositories/drugs";
import { customersRepo } from "@/lib/repositories/customers";
import { salesRepo, type WalkInSaleCreate } from "@/lib/repositories/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCents } from "@/lib/utils";

type CartLine = {
  drug_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  stock: number;
};

export default function PosPage() {
  const qc = useQueryClient();
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersRepo.list(),
  });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [discount, setDiscount] = useState(0);

  const filtered = useMemo(
    () =>
      search
        ? drugs
            .filter((d) =>
              d.name.toLowerCase().includes(search.toLowerCase())
            )
            .slice(0, 8)
        : [],
    [drugs, search]
  );

  const subtotal = cart.reduce(
    (s, l) => s + l.quantity * l.unit_price_cents,
    0
  );
  const total = Math.max(0, subtotal - discount);

  const addToCart = (drugId: string) => {
    const d = drugs.find((x) => x.id === drugId);
    if (!d) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.drug_id === drugId);
      if (existing) {
        return prev.map((l) =>
          l.drug_id === drugId && l.quantity < d.quantity_on_hand
            ? { ...l, quantity: l.quantity + 1 }
            : l
        );
      }
      return [
        ...prev,
        {
          drug_id: d.id,
          name: d.name,
          quantity: 1,
          unit_price_cents: d.default_selling_price_cents,
          stock: d.quantity_on_hand,
        },
      ];
    });
    setSearch("");
  };

  const updateQty = (drugId: string, qty: number) =>
    setCart((p) =>
      p.map((l) =>
        l.drug_id === drugId
          ? { ...l, quantity: Math.max(0, Math.min(qty, l.stock)) }
          : l
      )
    );

  const removeLine = (drugId: string) =>
    setCart((p) => p.filter((l) => l.drug_id !== drugId));

  const saleMut = useMutation({
    mutationFn: (body: WalkInSaleCreate) => salesRepo.createWalkIn(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["drugs"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      setCart([]);
      setCustomerId("");
      setPaymentRef("");
      setDiscount(0);
    },
  });

  const checkout = () => {
    if (cart.length === 0) return;
    saleMut.mutate({
      customer_id: customerId || undefined,
      items: cart
        .filter((l) => l.quantity > 0)
        .map((l) => ({
          drug_id: l.drug_id,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
        })),
      payment_method: paymentMethod,
      payment_ref: paymentRef || undefined,
      discount_cents: discount,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
        <p className="text-sm text-slate-500">Walk-in over-the-counter sale</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Find a drug</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {filtered.length > 0 && (
                <ul className="mt-2 divide-y rounded border">
                  {filtered.map((d) => (
                    <li
                      key={d.id}
                      className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-slate-50"
                      onClick={() => addToCart(d.id)}
                    >
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-slate-500">
                          {d.strength} · stock {d.quantity_on_hand}
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {formatCents(d.default_selling_price_cents, d.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cart</CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500">Cart is empty.</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((l) => (
                    <div
                      key={l.drug_id}
                      className="flex items-center gap-3 border-b pb-2"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-slate-500">
                          {formatCents(l.unit_price_cents)} · stock {l.stock}
                        </div>
                      </div>
                      <Input
                        type="number"
                        className="w-20"
                        value={l.quantity}
                        min={0}
                        max={l.stock}
                        onChange={(e) =>
                          updateQty(l.drug_id, Number(e.target.value))
                        }
                      />
                      <div className="w-24 text-right text-sm font-medium">
                        {formatCents(l.quantity * l.unit_price_cents)}
                      </div>
                      <button
                        onClick={() => removeLine(l.drug_id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm">Customer (optional)</label>
              <Select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Walk-in</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Payment method</label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile_money">Mobile money</option>
                <option value="insurance">Insurance</option>
              </Select>
            </div>
            <div>
              <label className="text-sm">Payment reference</label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm">Discount (cents)</label>
              <Input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>−{formatCents(discount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCents(total)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={cart.length === 0 || saleMut.isPending}
              onClick={checkout}
            >
              {saleMut.isPending ? "Processing..." : "Complete sale"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
