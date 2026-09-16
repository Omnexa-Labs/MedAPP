import type {
  ActivationStatus,
  Application,
  ApplicationDetails,
  ApplicationEvent,
  Mode,
  PartnerType,
  Requirements,
  TeamMember,
} from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      0,
      'Connection lost. Reload the saved application before trying again.',
    );
  }
  if (!response.ok) {
    let data: { detail?: string; code?: string } = {};
    try {
      data = await response.json();
    } catch {
      /* Error pages need not be JSON. */
    }
    const signingIn =
      path === '/api/session/login' || path === '/api/session/verify';
    if (
      (response.status === 401 && !signingIn) ||
      data.code === 'session_changed'
    )
      window.dispatchEvent(new Event('partner:session-changed'));
    throw new ApiError(
      response.status,
      typeof data.detail === 'string'
        ? data.detail
        : 'The request could not be completed.',
      data.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function asApplication(value: Application): Application {
  if (
    !value ||
    !uuid.test(value.application_id) ||
    !uuid.test(value.submitted_by_user_id) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.legal_name !== 'string' ||
    typeof value.display_name !== 'string' ||
    !Array.isArray(value.documents) ||
    !Array.isArray(value.team_members) ||
    value.documents.some((doc) => !uuid.test(doc.document_id))
  )
    throw new ApiError(
      502,
      'The saved application could not be read. Please reload.',
    );
  return value;
}
export function applicationApi(scope: string) {
  const headers = (version?: number) => ({
    'X-Session-Scope': scope,
    ...(version ? { 'If-Match': `"${version}"` } : {}),
  });
  const root = '/api/onboarding/applications';
  async function json(
    path: string,
    method: string,
    value: unknown,
    version?: number,
    signal?: AbortSignal,
  ) {
    return asApplication(
      await request<Application>(root + path, {
        method,
        headers: { ...headers(version), 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
        signal,
      }),
    );
  }
  return {
    async list(signal?: AbortSignal) {
      const data = await request<{ items: Application[] }>(root, {
        headers: headers(),
        signal,
      });
      if (!Array.isArray(data.items))
        throw new ApiError(502, 'Applications could not be loaded.');
      return data.items.map(asApplication);
    },
    async read(id: string, signal?: AbortSignal) {
      return asApplication(
        await request<Application>(root + '/' + id, {
          headers: headers(),
          signal,
        }),
      );
    },
    requirements(id: string, signal?: AbortSignal) {
      return request<Requirements>(`${root}/${id}/requirements`, {
        headers: headers(),
        signal,
      });
    },
    async activation(id: string, signal?: AbortSignal) {
      const value = await request<ActivationStatus>(
        `${root}/${id}/activation`,
        { headers: headers(), signal },
      );
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
          (typeof value.profile_id !== 'string' ||
            !uuid.test(value.profile_id))) ||
        (value.state === 'active' &&
          (!value.profile_id || !value.activated_at)) ||
        (value.activated_at !== null &&
          (typeof value.activated_at !== 'string' ||
            !Number.isFinite(Date.parse(value.activated_at))))
      )
        throw new ApiError(502, 'Account setup status could not be confirmed.');
      return value;
    },
    history(id: string, signal?: AbortSignal) {
      return request<ApplicationEvent[]>(`${root}/${id}/history`, {
        headers: headers(),
        signal,
      });
    },
    create(
      value: ApplicationDetails & {
        partner_type: PartnerType;
        onboarding_mode?: Mode;
      },
      signal?: AbortSignal,
    ) {
      return json('', 'POST', value, undefined, signal);
    },
    update(
      id: string,
      version: number,
      value: Partial<ApplicationDetails>,
      signal?: AbortSignal,
    ) {
      return json('/' + id, 'PATCH', value, version, signal);
    },
    submit(
      id: string,
      version: number,
      attestation_version: string,
      signal?: AbortSignal,
    ) {
      return json(
        `/${id}/submit`,
        'POST',
        { attestation_accepted: true, attestation_version },
        version,
        signal,
      );
    },
    reopen(id: string, version: number, signal?: AbortSignal) {
      return json(`/${id}/reopen`, 'POST', {}, version, signal);
    },
    addMember(
      id: string,
      version: number,
      member: Pick<TeamMember, 'full_name' | 'role' | 'email'>,
      signal?: AbortSignal,
    ) {
      return json(`/${id}/team-members`, 'POST', member, version, signal);
    },
    async removeMember(
      id: string,
      version: number,
      memberId: string,
      signal?: AbortSignal,
    ) {
      return asApplication(
        await request<Application>(`${root}/${id}/team-members/${memberId}`, {
          method: 'DELETE',
          headers: headers(version),
          signal,
        }),
      );
    },
    async upload(
      id: string,
      version: number,
      kind: string,
      file: File,
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams({
        kind,
        label: file.name.slice(0, 255),
      });
      return asApplication(
        await request<Application>(`${root}/${id}/documents/upload?${query}`, {
          method: 'POST',
          headers: {
            ...headers(version),
            'Content-Type':
              file.type ||
              (file.name.toLowerCase().endsWith('.pdf')
                ? 'application/pdf'
                : 'application/octet-stream'),
          },
          body: file,
          signal,
        }),
      );
    },
    async remove(
      id: string,
      version: number,
      documentId: string,
      signal?: AbortSignal,
    ) {
      return asApplication(
        await request<Application>(`${root}/${id}/documents/${documentId}`, {
          method: 'DELETE',
          headers: headers(version),
          signal,
        }),
      );
    },
    async download(id: string, documentId: string, signal?: AbortSignal) {
      if (!uuid.test(id) || !uuid.test(documentId))
        throw new ApiError(400, 'Document unavailable.');
      const response = await fetch(
        `${root}/${id}/documents/${documentId}/content`,
        {
          headers: headers(),
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 409)
          window.dispatchEvent(new Event('partner:session-changed'));
        throw new ApiError(
          response.status,
          'The document could not be downloaded. Please try again.',
        );
      }
      return response.blob();
    },
  };
}
export type ApplicationApi = ReturnType<typeof applicationApi>;
