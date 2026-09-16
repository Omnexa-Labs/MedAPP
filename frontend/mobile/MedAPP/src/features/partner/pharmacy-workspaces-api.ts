import { client, type RequestOptions } from '@/lib/api/client';
import { validatePharmacyLink } from '@/lib/partner/open-pharmacy';

export interface PharmacyWorkspace {
  pharmacy_id: string;
  pharmacy_name: string;
  deployment_key: string;
  web_origin: string;
}
export async function getPharmacyWorkspaces(options: RequestOptions): Promise<PharmacyWorkspace[]> {
  const value = await client.get<unknown>('/v1/pharmacy-workspaces', options);
  if (!Array.isArray(value)) throw new Error('Pharmacy access could not be loaded.');
  const seen = new Set<string>();
  return value.map((row) => {
    if (!row || typeof row.pharmacy_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.pharmacy_id)
      || typeof row.pharmacy_name !== 'string' || !row.pharmacy_name.trim() || typeof row.web_origin !== 'string'
      || typeof row.deployment_key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.deployment_key) || seen.has(row.pharmacy_id))
      throw new Error('Pharmacy access could not be confirmed. Reload before continuing.');
    const origin = new URL(row.web_origin);
    if (origin.pathname !== '/' || origin.href !== origin.origin + '/') throw new Error('The pharmacy website address could not be confirmed.');
    validatePharmacyLink(origin.origin + '/handoff#code=' + 'a'.repeat(32), origin.origin);
    seen.add(row.pharmacy_id);
    return { pharmacy_id: row.pharmacy_id, pharmacy_name: row.pharmacy_name, deployment_key: row.deployment_key, web_origin: origin.origin };
  });
}
