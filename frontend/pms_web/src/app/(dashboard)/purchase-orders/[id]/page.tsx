import { OrderDetail } from "@/components/purchasing/order-detail";
export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderDetail id={(await params).id} />;
}
