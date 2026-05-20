"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { patientRepository } from "@/lib/repositories/patient.repository";
import { formatDate } from "@/lib/utils/format";

export default function PatientsPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["patients", search],
    queryFn: () => patientRepository.list({ search: search || undefined, limit: 50 }).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        <Link
          href="/patients/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Register Patient
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search by name, MRN, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500">MRN</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Gender</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">DOB</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Registered</th>
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((patient: Record<string, unknown>) => (
                <tr key={patient.patient_id as string} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${patient.patient_id}`} className="font-medium text-blue-600 hover:underline">
                      {patient.mrn as string}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {patient.first_name as string} {patient.last_name as string}
                  </td>
                  <td className="px-4 py-3 capitalize">{(patient.gender as string) || "-"}</td>
                  <td className="px-4 py-3">{formatDate(patient.date_of_birth as string)}</td>
                  <td className="px-4 py-3">{(patient.phone_primary as string) || "-"}</td>
                  <td className="px-4 py-3">{formatDate(patient.created_at as string)}</td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No patients found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
