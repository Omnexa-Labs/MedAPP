import { PrescriptionDetail } from "@/components/transactions/prescription-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PrescriptionDetail id={id} />;
}
