import { SalesList } from "@/components/transactions/transaction-lists";
export default function Page() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Sales ledger</h1>
      <p>View recorded sales, payment details and dispense receipts.</p>
      <SalesList />
    </div>
  );
}
