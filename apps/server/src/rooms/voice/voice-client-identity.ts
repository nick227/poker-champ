/**
 * get -> client userId
 * Update this function to match your auth wiring.
 *
 * Common patterns:
 * - client.auth?.userId
 * - client.userData?.userId
 * - client.userId
 */
export function getClientUserId(client: any): string | null {
  return (
    client?.auth?.userId ??
    client?.userData?.userId ??
    client?.userId ??
    null
  );
}
