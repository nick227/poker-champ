export function getMessageByteSize(obj: unknown): number {
  try {
    const s = JSON.stringify(obj);
    return Buffer.byteLength(s, "utf8");
  } catch {
    return 0;
  }
}
