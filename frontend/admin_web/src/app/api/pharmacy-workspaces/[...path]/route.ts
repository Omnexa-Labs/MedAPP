import { NextRequest } from 'next/server';
import { sessions } from '@/server/runtime';
import { HttpError, responseError } from '@/server/errors';
import { errorResponse, originCheck, scopeCheck, sessionId, smallJson } from '@/server/http';
import { parseChoices, parseDeployment } from '@/lib/pharmacy-deployment';

export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function proxy(request: NextRequest, context: Context) {
  try {
    const parts = (await context.params).path;
    const choices = parts.length === 1 && parts[0] === 'deployments' && request.method === 'GET';
    const applicationId = parts.length === 2 && parts[0] === 'applications' && uuid.test(parts[1]) ? parts[1] : null;
    if (!choices && (!applicationId || !['GET', 'PUT'].includes(request.method)))
      throw new HttpError(404, 'Pharmacy deployment action unavailable.');
    if (request.method === 'PUT') originCheck(request);
    const id = sessionId(request);
    scopeCheck(request, (await sessions.get(id)).scope);
    const identity = await sessions.identity(id);
    let target = '/v1/pharmacy-workspaces/deployments';
    let pharmacyId: string | undefined;
    const headers = new Headers();
    let body: string | undefined;
    if (applicationId) {
      const saved = await sessions.request(id, `/v1/onboarding/applications/${applicationId}`, { signal: request.signal });
      if (!saved.ok) throw await responseError(saved);
      const application = await saved.json();
      if (application.application_id !== applicationId || application.partner_type !== 'pharmacy' || application.status !== 'approved')
        throw new HttpError(409, 'Reload the approved pharmacy application before continuing.');
      if (request.method === 'PUT' && application.submitted_by_user_id === identity.user.id)
        throw new HttpError(403, 'Another administrator must assign your pharmacy deployment.');
      const activation = await sessions.request(id, `/v1/onboarding/applications/${applicationId}/activation`, { signal: request.signal });
      if (!activation.ok) throw await responseError(activation);
      const status = await activation.json();
      if (typeof status.profile_id !== 'string' || !uuid.test(status.profile_id))
        throw new HttpError(409, 'The approved pharmacy profile is not ready. Refresh setup status.');
      pharmacyId = status.profile_id;
      target = `/v1/pharmacy-workspaces/${pharmacyId}/deployment`;
      if (request.method === 'PUT') {
        const version = request.headers.get('if-match');
        if (!version || !/^(0|[1-9][0-9]{0,9})$/.test(version))
          throw new HttpError(428, 'Reload the saved deployment before assigning.');
        if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
          throw new HttpError(415, 'Send deployment details as JSON.');
        const input = await smallJson(request);
        if (Object.keys(input).length !== 1 || typeof input.deployment_key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.deployment_key))
          throw new HttpError(400, 'Select a configured deployment.');
        body = JSON.stringify({ deployment_key: input.deployment_key });
        headers.set('If-Match', version);
        headers.set('Content-Type', 'application/json');
      }
    }
    const response = await sessions.request(id, target, { method: request.method, headers, body, signal: request.signal });
    if (!response.ok) throw await responseError(response);
    let value;
    try {
      value = choices ? parseChoices(await response.json()) : parseDeployment(await response.json(), pharmacyId);
    } catch {
      throw new HttpError(502, 'The pharmacy deployment could not be confirmed. Reload before continuing.');
    }
    return Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
export { proxy as GET, proxy as PUT };
