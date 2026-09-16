import { NextRequest } from 'next/server';
import { sessions } from '@/server/runtime';
import { HttpError, responseError } from '@/server/errors';
import {
  boundedBody,
  errorResponse,
  originCheck,
  privateJson,
  scopeCheck,
  sessionId,
} from '@/server/http';
import { proxyPolicy } from '@/server/proxy-policy';
export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  try {
    if (request.method !== 'GET') originCheck(request);
    const policy = proxyPolicy((await context.params).path, request.method);
    if (!policy)
      throw new HttpError(404, 'This application action is not available.');
    const id = sessionId(request);
    const session = await sessions.get(id);
    scopeCheck(request, session.scope);
    let savedResponse: Response | null = null;
    if (policy.applicationId) {
      savedResponse = await sessions.request(
        id,
        `/v1/onboarding/applications/${policy.applicationId}`,
        { signal: request.signal },
      );
      if (!savedResponse.ok) throw await responseError(savedResponse);
      const saved = await savedResponse.clone().json();
      if (saved.submitted_by_user_id !== session.user.id)
        throw new HttpError(
          403,
          'This application belongs to another account.',
        );
    }
    const headers = new Headers();
    const version = request.headers.get('if-match');
    if (version) headers.set('If-Match', version);
    let body: Uint8Array | undefined;
    if (request.method === 'POST' || request.method === 'PATCH') {
      const contentType = request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase();
      if (
        !contentType ||
        !(
          policy.upload
            ? ['application/pdf', 'image/png', 'image/jpeg']
            : ['application/json']
        ).includes(contentType)
      )
        throw new HttpError(
          415,
          policy.upload
            ? 'Choose a PDF, JPG or PNG document.'
            : 'Enter valid form details.',
        );
      headers.set('Content-Type', contentType);
      body = await boundedBody(
        request,
        policy.upload ? 10 * 1024 * 1024 : 65536,
      );
    }
    const query = new URLSearchParams();
    for (const key of ['kind', 'label', 'status']) {
      const value = request.nextUrl.searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    const url = `/v1/onboarding/${policy.path}${query.size ? '?' + query : ''}`;
    const response =
      request.method === 'GET' &&
      policy.path === `applications/${policy.applicationId}` &&
      savedResponse
        ? savedResponse
        : await sessions.request(id, url, {
            method: request.method,
            headers,
            body: body as BodyInit | undefined,
            signal: request.signal,
          });
    if (!response.ok) throw await responseError(response);
    if (request.method === 'GET' && policy.path === 'applications') {
      const result = await response.json();
      if (!Array.isArray(result.items))
        throw new HttpError(502, 'Applications could not be loaded.');
      return privateJson({
        items: result.items.filter(
          (item: { submitted_by_user_id?: string }) =>
            item.submitted_by_user_id === session.user.id,
        ),
      });
    }
    const forwarded = new Headers({ 'Cache-Control': 'private, no-store' });
    for (const key of [
      'content-type',
      'etag',
      'content-disposition',
      'x-content-type-options',
    ]) {
      const value = response.headers.get(key);
      if (value) forwarded.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: forwarded,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
