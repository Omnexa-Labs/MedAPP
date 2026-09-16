'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useAccount } from '@/components/auth';
import { Button, Loading, Notice, Status } from '@/components/ui';
import type { Application } from '@/lib/types';
import { titleCase } from '@/lib/types';
export function partnerLabel(application: Application) {
  if (application.partner_type === 'practitioner')
    return `Practitioner · ${titleCase(application.practitioner_role || 'Unspecified')}`;
  return (
    titleCase(application.partner_type) +
    (application.onboarding_mode
      ? ` · ${titleCase(application.onboarding_mode)}`
      : '')
  );
}
export function Queue() {
  const { api, identity } = useAccount();
  const [status, setStatus] = useState('submitted');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['applications', identity.scope, status],
    queryFn: ({ signal }) => api.list(status, signal),
  });
  const needle = search.trim().toLowerCase();
  const rows = (query.data || []).filter(
    (row) =>
      (!type || row.partner_type === type) &&
      [row.display_name, row.legal_name, row.email, row.license_number].some(
        (value) => value?.toLowerCase().includes(needle),
      ),
  );
  return (
    <main className="workspace">
      <div className="page-heading">
        <h1>Professional applications</h1>
        <p>Review submitted credentials and track account activation.</p>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label="Search applications"
            placeholder="Search applications"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Application status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {[
            'submitted',
            'under_review',
            'approved',
            'rejected',
            'suspended',
            'draft',
          ].map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Partner type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All partner types</option>
          <option value="practitioner">Practitioner</option>
          <option value="pharmacy">Pharmacy</option>
          <option value="hospital">Hospital</option>
        </select>
        <Button
          variant="secondary"
          busy={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={18} aria-hidden="true" />
          Refresh
        </Button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Notice error>{query.error.message} Use Refresh to try again.</Notice>
      ) : (
        <div className="table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Applicant / organization</th>
                  <th>Partner type</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>
                    <span className="sr-only">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.application_id}>
                    <td>
                      <Link href={`/applications/${row.application_id}`}>
                        {row.display_name || row.legal_name}
                      </Link>
                    </td>
                    <td>{partnerLabel(row)}</td>
                    <td>
                      <Status value={row.status} />
                    </td>
                    <td>
                      {row.submitted_at
                        ? new Date(row.submitted_at).toLocaleDateString(
                            undefined,
                            { dateStyle: 'medium' },
                          )
                        : 'Not submitted'}
                    </td>
                    <td>
                      <Link
                        href={`/applications/${row.application_id}`}
                        aria-label={`Review ${row.display_name || row.legal_name}`}
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="empty">No applications match these filters.</p>
          )}
          <p className="table-footer">
            {rows.length} {rows.length === 1 ? 'application' : 'applications'}
          </p>
        </div>
      )}
    </main>
  );
}
