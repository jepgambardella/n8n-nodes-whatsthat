import { EventEmitter } from 'node:events';
import path from 'node:path';

import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

import { ensureDir, removeDir } from './fs';
import type { DiscoveredTarget, LinkedTarget, RuntimeEvent, SessionRecord } from './types';

type DataAccess = {
  listSessions(): Promise<SessionRecord[]>;
  saveSessions(data: SessionRecord[]): Promise<void>;
  listLinkedTargets(): Promise<LinkedTarget[]>;
  saveLinkedTargets(data: LinkedTarget[]): Promise<void>;
  listDiscoveredTargets(): Promise<DiscoveredTarget[]>;
  saveDiscoveredTargets(data: DiscoveredTarget[]): Promise<void>;
};

type SendRequest = {
  sessionId: string;
  channelAlias?: string;
  jid?: string;
  phoneNumber?: string;
  sendToSelf?: boolean;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'reaction' | 'location' | 'contact' | 'poll';
  sendAsDocument?: boolean;
  message?: string;
  mediaUrl?: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  replyToMessageId?: string;
  reactionText?: string;
  location?: {
    degreesLatitude: number;
    degreesLongitude: number;
    name?: string;
    address?: string;
  };
  contact?: {
    displayName: string;
    vcard: string;
  };
  poll?: {
    name: string;
    values: string[];
    selectableCount?: number;
  };
};

class WhatsThatRegistry extends EventEmitter {
  private sockets = new Map<string, WASocket>();

  async ensureSession(
    storageRoot: string,
    access: DataAccess,
    input: { sessionId: string; label: string; phoneNumberForPairing?: string },
  ): Promise<SessionRecord> {
    const sessions = await access.listSessions();
    const now = new Date().toISOString();
    const existing = sessions.find((session) => session.sessionId === input.sessionId);
    const record: SessionRecord = existing ?? {
      sessionId: input.sessionId,
      label: input.label,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    record.label = input.label;
    record.phoneNumberForPairing = input.phoneNumberForPairing;
    record.updatedAt = now;
    await this.upsertSession(access, record);
    return record;
  }

  async connectSession(
    storageRoot: string,
    access: DataAccess,
    sessionId: string,
  ): Promise<SessionRecord> {
    const existingRecord = await this.getSession(access, sessionId);
    if (!existingRecord) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    if (this.sockets.has(sessionId)) {
      return existingRecord;
    }

    const authDir = path.join(storageRoot, 'auth', sessionId);
    await ensureDir(authDir);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ['WhatsThat', 'Chrome', '1.0.0'],
    });

    const starting: SessionRecord = {
      ...existingRecord,
      status: 'starting',
      updatedAt: new Date().toISOString(),
    };
    await this.upsertSession(access, starting);

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', async (update) => {
      const current = (await this.getSession(access, sessionId)) ?? starting;
      if (update.qr) {
        qrcodeTerminal.generate(update.qr, { small: true });
        const qrDataUrl = await QRCode.toDataURL(update.qr);
        const qrCodeUrl = this.buildQrCodeUrl(update.qr);
        const pairingRecord: SessionRecord = {
          ...current,
          status: 'pairing',
          qr: update.qr,
          qrCodeUrl,
          qrDataUrl,
          updatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        if (current.phoneNumberForPairing && !pairingRecord.pairingCode) {
          try {
            pairingRecord.pairingCode = await socket.requestPairingCode(
              current.phoneNumberForPairing,
            );
          } catch {
            // Keep QR fallback when pairing code is not available.
          }
        }
        await this.upsertSession(access, pairingRecord);
        this.emitRuntime({
          event: 'session.pairing',
          sessionId,
          createdAt: new Date().toISOString(),
          data: pairingRecord,
        });
      }

      if (update.connection === 'open') {
        const connected: SessionRecord = {
          ...current,
          status: 'connected',
          phone: socket.user?.id,
          qr: undefined,
          qrCodeUrl: undefined,
          qrDataUrl: undefined,
          pairingCode: undefined,
          updatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        await this.upsertSession(access, connected);
        await this.syncGroups(access, sessionId, socket);
        this.emitRuntime({
          event: 'session.connected',
          sessionId,
          createdAt: new Date().toISOString(),
          data: connected,
        });
      }

      if (update.connection === 'close') {
        const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const disconnected: SessionRecord = {
          ...current,
          status: shouldReconnect ? 'starting' : 'disconnected',
          lastDisconnectReason: String(statusCode ?? 'unknown'),
          updatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        await this.upsertSession(access, disconnected);
        this.sockets.delete(sessionId);
        this.emitRuntime({
          event: 'session.disconnected',
          sessionId,
          createdAt: new Date().toISOString(),
          data: { statusCode, shouldReconnect },
        });
        if (shouldReconnect) {
          setTimeout(() => {
            void this.connectSession(storageRoot, access, sessionId);
          }, 5000);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const message of messages) {
        await this.rememberTarget(access, sessionId, socket, message);
        this.emitRuntime({
          event: message.key.fromMe ? 'message.from_me' : 'message.received',
          sessionId,
          createdAt: new Date().toISOString(),
          data: {
            type,
            messageId: message.key.id,
            remoteJid: message.key.remoteJid,
            fromMe: message.key.fromMe,
            pushName: message.pushName,
            message: message.message,
            timestamp: message.messageTimestamp,
          },
        });
      }
    });

    socket.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        if (update.id) {
          await this.upsertDiscoveredTarget(access, {
            sessionId,
            jid: update.id,
            displayName: update.subject ?? update.id,
            targetType: 'group',
            lastSeenAt: new Date().toISOString(),
          });
        }
        this.emitRuntime({
          event: 'group.updated',
          sessionId,
          createdAt: new Date().toISOString(),
          data: update,
        });
      }
    });

    socket.ev.on('group-participants.update', async (update) => {
      this.emitRuntime({
        event: 'group.participants',
        sessionId,
        createdAt: new Date().toISOString(),
        data: update,
      });
    });

    this.sockets.set(sessionId, socket);
    return (await this.getSession(access, sessionId)) ?? starting;
  }

  async ensureConnectedSession(
    _storageRoot: string,
    access: DataAccess,
    input: { sessionId: string },
    options?: { waitFor?: 'pairing_or_connected' | 'connected'; timeoutMs?: number },
  ): Promise<SessionRecord> {
    const current = await this.getSession(access, input.sessionId);
    if (!current) {
      throw new Error(`Unknown session ${input.sessionId}`);
    }

    if (!this.sockets.has(input.sessionId) && current.status !== 'connected') {
      throw new Error(
        `Session ${input.sessionId} is not active. Run Connect Session first and keep the n8n runtime alive until pairing completes.`,
      );
    }

    return this.waitForSessionState(
      access,
      input.sessionId,
      options?.waitFor ?? 'pairing_or_connected',
      options?.timeoutMs ?? 20000,
    );
  }

  async listSessions(access: DataAccess): Promise<SessionRecord[]> {
    const sessions = await access.listSessions();
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(access: DataAccess, sessionId: string): Promise<SessionRecord | undefined> {
    const sessions = await access.listSessions();
    return sessions.find((session) => session.sessionId === sessionId);
  }

  async disconnectSession(access: DataAccess, sessionId: string): Promise<SessionRecord | undefined> {
    const socket = this.sockets.get(sessionId);
    if (socket) {
      await socket.logout();
      this.sockets.delete(sessionId);
    }
    const session = await this.getSession(access, sessionId);
    if (!session) return undefined;
    const updated = {
      ...session,
      status: 'disconnected' as const,
      updatedAt: new Date().toISOString(),
    };
    await this.upsertSession(access, updated);
    return updated;
  }

  async removeSession(storageRoot: string, access: DataAccess, sessionId: string): Promise<boolean> {
    const sessions = await access.listSessions();
    const next = sessions.filter((session) => session.sessionId !== sessionId);
    if (next.length === sessions.length) return false;
    await access.saveSessions(next);
    const linked = await access.listLinkedTargets();
    await access.saveLinkedTargets(linked.filter((item) => item.sessionId !== sessionId));
    const discovered = await access.listDiscoveredTargets();
    await access.saveDiscoveredTargets(discovered.filter((item) => item.sessionId !== sessionId));
    this.sockets.delete(sessionId);
    await removeDir(path.join(storageRoot, 'auth', sessionId));
    return true;
  }

  async listTargets(access: DataAccess, sessionId: string): Promise<DiscoveredTarget[]> {
    const items = await access.listDiscoveredTargets();
    return items
      .filter((item) => item.sessionId === sessionId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async listLinkedTargets(access: DataAccess, sessionId: string): Promise<LinkedTarget[]> {
    const items = await access.listLinkedTargets();
    return items
      .filter((item) => item.sessionId === sessionId)
      .sort((a, b) => a.alias.localeCompare(b.alias));
  }

  async connectTarget(
    access: DataAccess,
    sessionId: string,
    alias: string,
    jid: string,
  ): Promise<LinkedTarget> {
    const discovered = await this.listTargets(access, sessionId);
    const target =
      discovered.find((item) => item.jid === jid) ?? {
        sessionId,
        jid,
        displayName: jid,
        targetType: jid.endsWith('@g.us') ? 'group' : 'direct',
        lastSeenAt: new Date().toISOString(),
      };
    const linked = await access.listLinkedTargets();
    const next: LinkedTarget = {
      alias,
      sessionId,
      jid: target.jid,
      displayName: target.displayName,
      targetType: target.targetType,
      lastSeenAt: target.lastSeenAt,
      createdAt: new Date().toISOString(),
    };
    const filtered = linked.filter(
      (item) => !(item.sessionId === sessionId && item.alias === alias),
    );
    filtered.push(next);
    await access.saveLinkedTargets(filtered);
    return next;
  }

  async unlinkTarget(access: DataAccess, sessionId: string, alias: string): Promise<boolean> {
    const linked = await access.listLinkedTargets();
    const next = linked.filter((item) => !(item.sessionId === sessionId && item.alias === alias));
    if (next.length === linked.length) return false;
    await access.saveLinkedTargets(next);
    return true;
  }

  async sendMessage(access: DataAccess, request: SendRequest): Promise<Record<string, unknown>> {
    const socket = this.sockets.get(request.sessionId);
    if (!socket) {
      throw new Error(`Session ${request.sessionId} is not connected`);
    }
    const targetJid = await this.resolveTargetJid(access, request, socket);
    if (!targetJid) {
      throw new Error('Unknown target. Use a linked chat, WhatsApp number, raw JID, or Yourself.');
    }
    const content = this.buildContent(request, targetJid);
    const response = await socket.sendMessage(targetJid, content, {
      quoted: request.replyToMessageId
        ? ({
            key: {
              remoteJid: targetJid,
              id: request.replyToMessageId,
              fromMe: false,
            },
          } as never)
        : undefined,
    });
    this.emitRuntime({
      event: 'message.sent',
      sessionId: request.sessionId,
      createdAt: new Date().toISOString(),
      data: {
        targetJid,
        request,
        messageId: response?.key.id ?? null,
      },
    });
    return {
      sessionId: request.sessionId,
      targetJid,
      messageId: response?.key.id ?? null,
      status: 'queued',
    };
  }

  private buildContent(request: SendRequest, targetJid: string): AnyMessageContent {
    switch (request.type) {
      case 'text':
        return { text: request.message ?? '' };
      case 'image':
        if (request.sendAsDocument) {
          return {
            document: { url: this.required(request.mediaUrl, 'mediaUrl') },
            fileName: request.fileName ?? 'image',
            mimetype: request.mimetype ?? 'image/jpeg',
            caption: request.caption,
          };
        }
        return { image: { url: this.required(request.mediaUrl, 'mediaUrl') }, caption: request.caption };
      case 'video':
        if (request.sendAsDocument) {
          return {
            document: { url: this.required(request.mediaUrl, 'mediaUrl') },
            fileName: request.fileName ?? 'video',
            mimetype: request.mimetype ?? 'video/mp4',
            caption: request.caption,
          };
        }
        return {
          video: { url: this.required(request.mediaUrl, 'mediaUrl') },
          caption: request.caption,
          mimetype: request.mimetype,
        };
      case 'audio':
        return { audio: { url: this.required(request.mediaUrl, 'mediaUrl') }, mimetype: request.mimetype };
      case 'document':
        return {
          document: { url: this.required(request.mediaUrl, 'mediaUrl') },
          fileName: request.fileName ?? 'attachment',
          mimetype: this.required(request.mimetype, 'mimetype'),
          caption: request.caption,
        };
      case 'reaction':
        return {
          react: {
            text: request.reactionText ?? request.message ?? '👍',
            key: {
              remoteJid: targetJid,
              id: request.replyToMessageId,
              fromMe: false,
            },
          },
        };
      case 'location':
        return { location: this.required(request.location, 'location') };
      case 'contact':
        return {
          contacts: {
            displayName: this.required(request.contact?.displayName, 'contact.displayName'),
            contacts: [{ vcard: this.required(request.contact?.vcard, 'contact.vcard') }],
          },
        };
      case 'poll':
        return {
          poll: {
            name: this.required(request.poll?.name, 'poll.name'),
            values: request.poll?.values ?? [],
            selectableCount: request.poll?.selectableCount ?? 1,
          },
        };
    }
  }

  private async resolveTargetJid(
    access: DataAccess,
    request: SendRequest,
    socket: WASocket,
  ): Promise<string | undefined> {
    if (request.jid) {
      return request.jid;
    }

    if (request.phoneNumber) {
      return `${request.phoneNumber}@s.whatsapp.net`;
    }

    if (request.sendToSelf) {
      const session = await this.getSession(access, request.sessionId);
      const raw = session?.phone ?? socket.user?.id;
      const normalized = raw?.split(':')[0];
      if (!normalized) {
        throw new Error(
          `Session ${request.sessionId} does not have a known WhatsApp number yet. Connect the session first.`,
        );
      }
      return normalized;
    }

    if (request.channelAlias) {
      const linked = await this.listLinkedTargets(access, request.sessionId);
      return linked.find((item) => item.alias === request.channelAlias)?.jid;
    }

    return undefined;
  }

  private async syncGroups(access: DataAccess, sessionId: string, socket: WASocket): Promise<void> {
    const groups = await socket.groupFetchAllParticipating();
    for (const [jid, data] of Object.entries(groups)) {
      await this.upsertDiscoveredTarget(access, {
        sessionId,
        jid,
        displayName: data.subject ?? jid,
        targetType: 'group',
        lastSeenAt: new Date().toISOString(),
      });
    }
  }

  private async rememberTarget(
    access: DataAccess,
    sessionId: string,
    socket: WASocket,
    message: WAMessage,
  ): Promise<void> {
    const jid = message.key.remoteJid;
    if (!jid) return;
    const isGroup = jid.endsWith('@g.us');
    const displayName = isGroup
      ? (await socket.groupMetadata(jid)).subject ?? jid
      : message.pushName ?? (jid === socket.user?.id ? 'Self chat' : jid);
    await this.upsertDiscoveredTarget(access, {
      sessionId,
      jid,
      displayName,
      targetType: isGroup ? 'group' : 'direct',
      lastSeenAt: new Date().toISOString(),
    });
  }

  private async upsertSession(access: DataAccess, record: SessionRecord): Promise<void> {
    const sessions = await access.listSessions();
    const filtered = sessions.filter((item) => item.sessionId !== record.sessionId);
    filtered.push(record);
    await access.saveSessions(filtered);
  }

  private async upsertDiscoveredTarget(access: DataAccess, target: DiscoveredTarget): Promise<void> {
    const items = await access.listDiscoveredTargets();
    const filtered = items.filter(
      (item) => !(item.sessionId === target.sessionId && item.jid === target.jid),
    );
    filtered.push(target);
    await access.saveDiscoveredTargets(filtered);
  }

  private emitRuntime(event: RuntimeEvent): void {
    this.emit('event', event);
  }

  private async waitForSessionState(
    access: DataAccess,
    sessionId: string,
    waitFor: 'pairing_or_connected' | 'connected',
    timeoutMs: number,
  ): Promise<SessionRecord> {
    const current = await this.getSession(access, sessionId);
    if (!current) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    if (this.matchesWaitTarget(current, waitFor)) {
      return current;
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeout: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        this.off('event', handler);
      };

      const settle = async () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve((await this.getSession(access, sessionId)) ?? current);
      };

      const handler = async (event: RuntimeEvent) => {
        if (event.sessionId !== sessionId) return;
        const latest = await this.getSession(access, sessionId);
        if (latest && this.matchesWaitTarget(latest, waitFor)) {
          await settle();
        }
      };

      this.on('event', handler);
      timeout = setTimeout(() => {
        void settle();
      }, timeoutMs);
    });
  }

  private matchesWaitTarget(
    record: SessionRecord,
    waitFor: 'pairing_or_connected' | 'connected',
  ): boolean {
    if (record.status === 'connected') {
      return true;
    }

    if (waitFor === 'pairing_or_connected' && record.status === 'pairing') {
      return true;
    }

    return false;
  }

  async waitForConnectedSession(
    access: DataAccess,
    sessionId: string,
    timeoutMs: number,
  ): Promise<SessionRecord> {
    const current = await this.getSession(access, sessionId);
    if (!current) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    if (!this.sockets.has(sessionId) && current.status !== 'connected') {
      throw new Error(
        `Session ${sessionId} is not active. Run Connect Session first and keep the n8n runtime alive until pairing completes.`,
      );
    }

    return this.waitForSessionState(access, sessionId, 'connected', timeoutMs);
  }

  private required<T>(value: T | undefined, field: string): T {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required field ${field}`);
    }
    return value;
  }

  private buildQrCodeUrl(qr: string): string {
    return `https://quickchart.io/qr?text=${encodeURIComponent(qr)}`;
  }
}

export const registry = new WhatsThatRegistry();

export function extractMessageText(message: proto.IMessage | null | undefined): string | undefined {
  if (!message) return undefined;
  if (typeof message.conversation === 'string') return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  return undefined;
}
