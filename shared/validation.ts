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

export function normalizeWhatsappNumber(phoneNumber: string): string {
  return phoneNumber.trim().replace(/\s+/g, '').replace(/^\+/, '').replace(/^00/, '');
}

export function requireWhatsappNumber(phoneNumber: string): string {
  const normalized = normalizeWhatsappNumber(phoneNumber);
  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new Error(
      'WhatsApp Number must contain digits only, including country code, without 00 or +.',
    );
  }
  return normalized;
}
