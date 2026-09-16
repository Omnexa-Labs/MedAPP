const uuid =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
export function proxyPolicy(segments: string[], method: string) {
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment))) return null;
  const path = segments.join('/');
  if (method === 'GET' && path === 'applications')
    return { path, applicationId: undefined };
  const match = new RegExp(
    `^applications/(${uuid})(?:/(requirements|history|activation|documents/${uuid}/content))?$`,
  ).exec(path);
  if (method === 'GET' && match) return { path, applicationId: match[1] };
  const mutation = new RegExp(
    `^applications/(${uuid})/(review|activation/retry)$`,
  ).exec(path);
  return method === 'POST' && mutation
    ? { path, applicationId: mutation[1] }
    : null;
}
