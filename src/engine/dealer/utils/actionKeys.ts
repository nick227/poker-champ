/**
 * Action dedup keys: same format used for duplicate detection and claim collision warning.
 */

export function buildActionKey(handId: string, userId: string, actionId: string): string {
  return `${handId}:${userId}:${actionId}`;
}

export function buildClaimKey(handId: string, actionId: string): string {
  return `${handId}:${actionId}`;
}
