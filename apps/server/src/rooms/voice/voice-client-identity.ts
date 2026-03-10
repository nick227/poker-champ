/**
 * get -> client userId
 * Update this function to match your auth wiring.
 *
 * Common patterns:
 * - client.auth?.userId
 * - client.userData?.userId
 * - client.userId
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readUserId(source: unknown): string | null {
  const record = asRecord(source);
  if (!record) return null;
  return typeof record.userId === "string" ? record.userId : null;
}

export function getClientUserId(client: unknown): string | null {
  const clientRecord = asRecord(client);
  if (!clientRecord) return null;
  return (
    readUserId(clientRecord.auth) ??
    readUserId(clientRecord.userData) ??
    (typeof clientRecord.userId === "string" ? clientRecord.userId : null)
  );
}
