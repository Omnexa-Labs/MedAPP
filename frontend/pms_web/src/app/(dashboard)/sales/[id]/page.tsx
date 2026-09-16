import { SaleDetail } from "@/components/transactions/sale-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleDetail id={id} />;
}
