const id =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const rules: [RegExp, string[]][] = [
  [/^hospital-profile$/, ["GET", "PATCH"]],
  [/^hospital-profile\/history$/, ["GET"]],
  [/^hospital-profile\/(publish|withdraw)$/, ["POST"]],
  [/^team\/invitations$/, ["GET", "POST"]],
  [new RegExp(`^team/invitations/${id}$`), ["DELETE"]],
  [/^team\/memberships$/, ["GET"]],
  [/^team\/history$/, ["GET"]],
  [new RegExp(`^team/memberships/${id}$`), ["PATCH"]],
  [
    /^(patients|staff|departments|appointments|invoices|prescriptions|queue|pharmacy\/drugs)$/,
    ["GET", "POST"],
  ],
  [
    new RegExp(`^(patients|staff|appointments|invoices)/${id}$`),
    ["GET", "PATCH"],
  ],
  [new RegExp(`^(departments|queue|pharmacy/drugs)/${id}$`), ["PATCH"]],
  [new RegExp(`^patients/${id}/visits$`), ["GET", "POST"]],
  [new RegExp(`^visits/${id}$`), ["GET", "PATCH"]],
  [new RegExp(`^staff/${id}/schedule$`), ["GET", "POST"]],
  [new RegExp(`^invoices/${id}/(items|payments)$`), ["POST"]],
  [new RegExp(`^pharmacy/drugs/${id}/batches$`), ["POST"]],
  [new RegExp(`^prescriptions/${id}$`), ["GET"]],
  [new RegExp(`^prescriptions/${id}/dispense$`), ["POST"]],
  [
    /^(dashboard\/summary|billing\/summary|queue\/stats|pharmacy\/stock-alerts)$/,
    ["GET"],
  ],
];
export function proxyPolicy(segments: string[], method: string) {
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment))) return null;
  const path = segments.join("/");
  return rules.some(
    ([pattern, methods]) => pattern.test(path) && methods.includes(method),
  )
    ? `/v1/hms/${path}`
    : null;
}
