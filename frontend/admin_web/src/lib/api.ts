import type {
  ActivationStatus,
  Application,
  ApplicationEvent,
  Identity,
  Requirements,
} from './types';
import { parseChoices, parseDeployment } from './pharmacy-deployment';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
async function response(path: string, init: RequestInit = {}) {
  let result: Response;
  try {
    result = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      0,
      'Connection lost. Reload saved data before trying again.',
    );
  }
  if (!result.ok) {
    const value = await result.json().catch(() => ({}));
    if (
      (result.status === 401 && !path.startsWith('/api/sso/')) ||
      value.code === 'session_changed'
    )
      window.dispatchEvent(new Event('admin:session-changed'));
    throw new ApiError(
      result.status,
      typeof value.detail === 'string'
        ? value.detail
        : 'The request could not be completed.',
      value.code,
    );
  }
  return result;
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return (await response(path, init)).json();
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function application(value: Application) {
  if (
    !value ||
    !uuid.test(value.application_id) ||
    !uuid.test(value.submitted_by_user_id) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.display_name !== 'string' ||
    !Array.isArray(value.documents) ||
    value.documents.some(
      (doc) =>
        !doc || !uuid.test(doc.document_id) || typeof doc.kind !== 'string',
    ) ||
    !Array.isArray(value.team_members)
  )
    throw new ApiError(
      502,
      'The saved application could not be read. Reload to continue.',
    );
  return value;
}
export function activation(value: ActivationStatus) {
  if (
    !value ||
    ![
      'not_started',
      'pending',
      'retry',
      'attention_required',
      'setup_required',
      'active',
    ].includes(value.state) ||
    !Number.isSafeInteger(value.attempts) ||
    value.attempts < 0 ||
    (value.reason !== null && typeof value.reason !== 'string') ||
    (value.profile_id !== null &&
      (typeof value.profile_id !== 'string' || !uuid.test(value.profile_id))) ||
    (value.activated_at !== null &&
      (typeof value.activated_at !== 'string' ||
        !Number.isFinite(Date.parse(value.activated_at)))) ||
    (value.state === 'active' &&
      (!value.activated_at ||
        !value.profile_id ||
        !uuid.test(value.profile_id)))
  )
    throw new ApiError(502, 'Account setup status could not be confirmed.');
  return value;
}
export function adminApi(scope: string) {
  const root = '/api/onboarding/applications';
  const headers = (version?: number) => ({
    'X-Session-Scope': scope,
    ...(version ? { 'If-Match': `"${version}"` } : {}),
  });
  const read = <T>(path: string, signal?: AbortSignal) =>
    request<T>(root + path, { headers: headers(), signal });
  return {
    async pharmacyDeployments(signal?: AbortSignal) {
      return parseChoices(await request('/api/pharmacy-workspaces/deployments', { headers: headers(), signal }));
    },
    async pharmacyDeployment(id: string, signal?: AbortSignal) {
      return parseDeployment(await request(`/api/pharmacy-workspaces/applications/${id}`, { headers: headers(), signal }));
    },
    async assignPharmacyDeployment(id: string, deploymentKey: string, version: number, signal?: AbortSignal) {
      return parseDeployment(await request(`/api/pharmacy-workspaces/applications/${id}`, {
        method: 'PUT', signal,
        headers: { ...headers(), 'If-Match': String(version), 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployment_key: deploymentKey }),
      }));
    },
    async list(status: string, signal?: AbortSignal) {
      const value = await read<{ items: Application[] }>(
        status ? `?status=${encodeURIComponent(status)}` : '',
        signal,
      );
      if (!Array.isArray(value.items))
        throw new ApiError(502, 'Applications could not be loaded.');
      return value.items.map(application);
    },
    async read(id: string, signal?: AbortSignal) {
      return application(await read<Application>(`/${id}`, signal));
    },
    async requirements(id: string, signal?: AbortSignal) {
      const value = await read<Requirements>(`/${id}/requirements`, signal);
      if (
        !value ||
        !Array.isArray(value.required_fields) ||
        !Array.isArray(value.required_document_kinds) ||
        ![...value.required_fields, ...value.required_document_kinds].every(
          (item) => typeof item === 'string',
        ) ||
        typeof value.requires_team_member !== 'boolean' ||
        typeof value.attestation_version !== 'string'
      )
        throw new ApiError(502, 'Review requirements could not be confirmed.');
      return value;
    },
    async history(id: string, signal?: AbortSignal) {
      const value = await read<ApplicationEvent[]>(`/${id}/history`, signal);
      if (
        !Array.isArray(value) ||
        value.some(
          (item) =>
            !item ||
            !uuid.test(item.event_id) ||
            typeof item.action !== 'string' ||
            !item.details,
        )
      )
        throw new ApiError(502, 'Application history could not be loaded.');
      return value;
    },
    async activation(id: string, signal?: AbortSignal) {
      return activation(
        await read<ActivationStatus>(`/${id}/activation`, signal),
      );
    },
    async review(
      id: string,
      version: number,
      decision: 'under_review' | 'approve' | 'reject',
      documents: string[],
      feedback: string,
      signal?: AbortSignal,
    ) {
      return application(
        await request<Application>(`${root}/${id}/review`, {
          method: 'POST',
          signal,
          headers: { ...headers(version), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: decision,
            verified_document_ids: documents,
            ...(decision === 'reject'
              ? { rejection_reason: feedback.trim() }
              : {}),
          }),
        }),
      );
    },
    async retry(id: string, version: number, signal?: AbortSignal) {
      return activation(
        await request<ActivationStatus>(`${root}/${id}/activation/retry`, {
          method: 'POST',
          signal,
          headers: { ...headers(version), 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
    },
    async document(id: string, documentId: string, signal?: AbortSignal) {
      if (!uuid.test(id) || !uuid.test(documentId))
        throw new ApiError(400, 'Document unavailable.');
      const result = await response(
        `${root}/${id}/documents/${documentId}/content`,
        { headers: headers(), signal },
      );
      const type = result.headers.get('content-type')?.split(';')[0];
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(type || ''))
        throw new ApiError(502, 'Document format could not be confirmed.');
      return result.blob();
    },
  };
}
export type AdminApi = ReturnType<typeof adminApi>;
export interface SigninStart {
  nonce: string;
  client_id: string;
  hosted_domains: string[];
  scope: string;
}
export type SigninResult = Identity | { mfa_required: true; scope: string };
