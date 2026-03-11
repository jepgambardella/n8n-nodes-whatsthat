export function normalizeSessionId(sessionId: string): string {
  return sessionId.trim();
}

export function requireSessionId(sessionId: string): string {
  const normalized = normalizeSessionId(sessionId);
  if (!normalized) {
    throw new Error(
      'Session ID is required. Use a stable internal identifier such as "main-phone" or "support-team".',
    );
  }
  return normalized;
}
