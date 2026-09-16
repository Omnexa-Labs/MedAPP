import { NextRequest } from 'next/server';
import { signIn } from '@/server/sign-in';
import { apiFetch } from '@/server/runtime';
import { errorResponse, privateJson } from '@/server/http';
import { HttpError, responseError } from '@/server/errors';
export const runtime = 'nodejs';
type Context = { params: Promise<{ action: string }> };
export async function POST(request: NextRequest, context: Context) {
  return signIn(request, (await context.params).action);
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    if ((await context.params).action !== 'config')
      throw new HttpError(404, 'Sign-in action unavailable.');
    const response = await apiFetch('/v1/auth/admin-sso/config');
    if (!response.ok) throw await responseError(response);
    const value = await response.json();
    return privateJson({ enabled: value.enabled === true });
  } catch (error) {
    return errorResponse(error);
  }
}
