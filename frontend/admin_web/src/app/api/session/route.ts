import { NextRequest } from 'next/server';
import { sessions } from '@/server/runtime';
import { HttpError } from '@/server/errors';
import {
  errorResponse,
  originCheck,
  privateJson,
  scopeCheck,
  sessionId,
} from '@/server/http';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    return privateJson(await sessions.identity(sessionId(request)));
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      return privateJson({ user: null });
    return errorResponse(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    originCheck(request);
    const id = sessionId(request);
    scopeCheck(request, (await sessions.get(id)).scope);
    try {
      await sessions.logout(id);
    } catch (error) {
      return errorResponse(error);
    }
    return privateJson({ signed_out: true });
  } catch (error) {
    return errorResponse(error);
  }
}
