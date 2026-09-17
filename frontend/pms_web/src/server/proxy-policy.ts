const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export function proxyPolicy(parts: string[], method: string) {
  if (parts.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))) return null;
  const path = parts.join("/");
  const rules: Record<string, RegExp[]> = {
    GET: [
      new RegExp(`^prescriptions/${uuid}/medapp-deliveries$`),
      new RegExp(`^sales/${uuid}/(corrections|refunds)$`),
      /^pharmacy-profile(\/history)?$/,
      new RegExp(`^pharmacy-profile/photos/${uuid}$`),
      new RegExp(`^batches/${uuid}/movements$`),
      new RegExp(`^purchase-orders/${uuid}/history$`),
      /^(drugs|batches|suppliers|purchase-orders|prescriptions|sales|customers|staff)$/,
      new RegExp(
        `^(drugs|purchase-orders|prescriptions|sales|customers)/${uuid}$`,
      ),
      /^drugs\/(stock-alerts|expiring-soon)$/,
      /^reports\/(sales-summary|sales-daily|top-drugs|dispensing|movements|stock-valuation|overview|dashboard)$/,
    ],
    POST: [
      new RegExp(`^prescriptions/${uuid}/medapp-deliveries/${uuid}/retry$`),
      new RegExp(
        `^sales/${uuid}/(corrections|refunds|reconcile-prescription)$`,
      ),
      new RegExp(`^sales/${uuid}/corrections/quote$`),
      new RegExp(`^sales/${uuid}/refunds/${uuid}/void$`),
      /^sales\/quote$/,
      /^pharmacy-profile\/(publish|withdraw)$/,
      /^pharmacy-profile\/photo$/,
      /^(drugs|batches|suppliers|purchase-orders|prescriptions|sales|customers|staff)$/,
      new RegExp(`^batches/${uuid}/adjust$`),
      new RegExp(`^purchase-orders/${uuid}/(send|cancel|receive|reconcile)$`),
      new RegExp(`^prescriptions/${uuid}/(dispense|cancel|quote)$`),
      new RegExp(`^sales/${uuid}/void$`),
    ],
    PATCH: [
      /^pharmacy-profile$/,
      new RegExp(`^(drugs|suppliers|customers|staff|purchase-orders)/${uuid}$`),
    ],
    DELETE: [new RegExp(`^staff/${uuid}$`)],
  };
  return rules[method]?.some((rule) => rule.test(path)) ? "/v1/" + path : null;
}
