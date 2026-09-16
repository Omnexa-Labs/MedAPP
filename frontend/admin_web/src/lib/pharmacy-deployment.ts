export interface PharmacyDeployment {
  pharmacy_id: string;
  deployment_key: string | null;
  version: number;
  activated_at: string | null;
}
export interface DeploymentChoice {
  deployment_key: string;
  label: string;
  assigned: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function parseDeployment(value: unknown, expectedId?: string): PharmacyDeployment {
  const v = value as Partial<PharmacyDeployment> | null;
  if (!v || typeof v.pharmacy_id !== 'string' || !uuid.test(v.pharmacy_id)
    || (expectedId !== undefined && v.pharmacy_id !== expectedId)
    || !Number.isSafeInteger(v.version) || v.version! < 0
    || !(v.deployment_key === null || (typeof v.deployment_key === 'string' && key.test(v.deployment_key)))
    || !(v.activated_at === null || (typeof v.activated_at === 'string' && Number.isFinite(Date.parse(v.activated_at))))
    || (v.version === 0 ? v.deployment_key !== null || v.activated_at !== null : !v.deployment_key)
    || (v.activated_at !== null && v.version! < 2))
    throw new Error('The pharmacy deployment could not be confirmed.');
  return { pharmacy_id: v.pharmacy_id, deployment_key: v.deployment_key, version: v.version!, activated_at: v.activated_at };
}
export function parseChoices(value: unknown): DeploymentChoice[] {
  if (!Array.isArray(value)) throw new Error('Deployment choices could not be confirmed.');
  const seen = new Set<string>();
  return value.map((v) => {
    if (!v || typeof v.deployment_key !== 'string' || !key.test(v.deployment_key)
      || typeof v.label !== 'string' || !v.label.trim() || v.label.length > 128
      || typeof v.assigned !== 'boolean' || seen.has(v.deployment_key))
      throw new Error('Deployment choices could not be confirmed.');
    seen.add(v.deployment_key);
    return { deployment_key: v.deployment_key, label: v.label, assigned: v.assigned };
  });
}
