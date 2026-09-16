import { NextRequest, NextResponse } from 'next/server';
import { HttpError } from './errors';
export const cookieName = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-medapp_partner'
    : 'medapp_partner';
export function sessionId(request: NextRequest): string {
  const id = request.cookies.get(cookieName())?.value;
  if (!id || !/^[a-f0-9]{64}$/.test(id))
    throw new HttpError(401, 'Sign in to continue.');
  return id;
}
export function originCheck(request: Request) {
  const expected = process.env.PARTNER_ORIGIN;
  if (!expected)
    throw new HttpError(
      503,
      'The application service is temporarily unavailable.',
    );
  if (
    request.headers.get('origin') !== new URL(expected).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new HttpError(
      403,
      'This request must come from the partner application.',
    );
}
export function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export function setSession(response: NextResponse, id: string) {
  response.cookies.set(cookieName(), id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 86400,
  });
  return response;
}
export function clearSession(response: NextResponse) {
  response.cookies.set(cookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 503;
  const response = privateJson(
    {
      detail:
        error instanceof HttpError
          ? error.message
          : 'The service is temporarily unavailable. Please try again.',
      code: error instanceof HttpError ? error.code : undefined,
    },
    status,
  );
  return status === 401 ? clearSession(response) : response;
}
export async function boundedBody(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > maximum))
    throw new HttpError(413, 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new HttpError(413, 'The request is too large.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export async function smallJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const result = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 16384)),
    );
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error();
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Enter valid form details.');
  }
}

export function scopeCheck(request: Request, scope: string) {
  if (request.headers.get('x-session-scope') !== scope)
    throw new HttpError(
      409,
      'Your signed-in account changed. Reload to continue.',
      'session_changed',
    );
}
