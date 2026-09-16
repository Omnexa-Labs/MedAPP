import { NextRequest } from 'next/server';
import { sessions } from '@/server/runtime';
import { HttpError, responseError } from '@/server/errors';
import {
  boundedBody,
  errorResponse,
  originCheck,
  scopeCheck,
  sessionId,
} from '@/server/http';
import { proxyPolicy } from '@/server/proxy-policy';
export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  try {
    const policy = proxyPolicy((await context.params).path, request.method);
    if (!policy) throw new HttpError(404, 'Review action unavailable.');
    if (request.method !== 'GET') originCheck(request);
    const id = sessionId(request);
    // Scope precedes live identity and application reads to isolate old tabs.
    scopeCheck(request, (await sessions.get(id)).scope);
    const identity = await sessions.identity(id);
    let body: Uint8Array | undefined;
    const headers = new Headers();
    if (request.method === 'POST') {
      const version = request.headers.get('if-match');
      if (!version || !/^"[1-9][0-9]{0,9}"$/.test(version))
        throw new HttpError(
          428,
          'Reload the saved application before deciding.',
        );
      const saved = await sessions.request(
        id,
        `/v1/onboarding/applications/${policy.applicationId}`,
        { signal: request.signal },
      );
      if (!saved.ok) throw await responseError(saved);
      if ((await saved.json()).submitted_by_user_id === identity.user.id)
        throw new HttpError(
          403,
          'You cannot review or activate your own application.',
        );
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !==
        'application/json'
      )
        throw new HttpError(415, 'Send application review details as JSON.');
      headers.set('If-Match', version);
      headers.set('Content-Type', 'application/json');
      body = await boundedBody(request, 16384);
    }
    const query = new URLSearchParams();
    const status = request.nextUrl.searchParams.get('status');
    if (policy.path === 'applications' && status) query.set('status', status);
    const response = await sessions.request(
      id,
      `/v1/onboarding/${policy.path}${query.size ? '?' + query : ''}`,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        signal: request.signal,
      },
    );
    if (!response.ok) throw await responseError(response);
    const forwarded = new Headers({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['content-type', 'content-disposition', 'etag']) {
      const value = response.headers.get(name);
      if (value) forwarded.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: forwarded,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export { proxy as GET, proxy as POST };
