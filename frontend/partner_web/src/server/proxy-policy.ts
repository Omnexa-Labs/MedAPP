const uuid =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const base = `applications/(${uuid})`;
const rules: [RegExp, string[]][] = [
  [/^applications$/, ['GET', 'POST']],
  [new RegExp(`^${base}$`), ['GET', 'PATCH']],
  [new RegExp(`^${base}/(requirements|history|activation)$`), ['GET']],
  [new RegExp(`^${base}/documents/upload$`), ['POST']],
  [new RegExp(`^${base}/documents/${uuid}/content$`), ['GET']],
  [new RegExp(`^${base}/documents/${uuid}$`), ['DELETE']],
  [new RegExp(`^${base}/team-members$`), ['POST']],
  [new RegExp(`^${base}/team-members/${uuid}$`), ['DELETE']],
  [new RegExp(`^${base}/(submit|reopen)$`), ['POST']],
];
export function proxyPolicy(segments: string[], method: string) {
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment))) return null;
  const path = segments.join('/');
  for (const [pattern, methods] of rules) {
    const match = pattern.exec(path);
    if (match && methods.includes(method))
      return {
        path,
        applicationId: match[1],
        upload: path.endsWith('/documents/upload'),
      };
  }
  return null;
}
