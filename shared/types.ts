export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'pairing'
  | 'connected'
  | 'disconnected'
  | 'error';

export type TargetType = 'group' | 'direct';

export interface SessionRecord {
  sessionId: string;
  label: string;
  status: SessionStatus;
  phone?: string;
  pairingCode?: string;
  qr?: string;
  qrDataUrl?: string;
  phoneNumberForPairing?: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  lastDisconnectReason?: string;
}

export interface LinkedTarget {
  alias: string;
  sessionId: string;
  jid: string;
  displayName: string;
  targetType: TargetType;
  lastSeenAt: string;
  createdAt: string;
}

export interface DiscoveredTarget {
  sessionId: string;
  jid: string;
  displayName: string;
  targetType: TargetType;
  lastSeenAt: string;
}

export interface DedupRecord {
  sessionId: string;
  messageId: string;
  expiresAt: string;
}

export interface RuntimeEvent<T = unknown> {
  event: string;
  sessionId: string;
  createdAt: string;
  data: T;
}
