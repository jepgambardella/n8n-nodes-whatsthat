import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildAccess } from '../../shared/access';
import { registry } from '../../shared/runtime';
import { normalizeSessionId, requireSessionId, requireWhatsappNumber } from '../../shared/validation';

function formatSessionOutput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => formatSessionOutput(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (!('sessionId' in record) || !('status' in record)) {
    return value;
  }

  return {
    qrCodeUrl: record.qrCodeUrl,
    sessionId: record.sessionId,
    status: record.status,
    pairingCode: record.pairingCode,
    qr: record.qr,
    qrDataUrl: record.qrDataUrl,
    phone: record.phone,
    label: record.label,
    phoneNumberForPairing: record.phoneNumberForPairing,
    lastDisconnectReason: record.lastDisconnectReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
  };
}

function buildMessagePayload(context: IExecuteFunctions, itemIndex: number): IDataObject {
  const messageType = context.getNodeParameter('messageType', itemIndex) as string;
  const sendMessageTo = context.getNodeParameter('sendMessageTo', itemIndex) as string;
  const deliveryMode = context.getNodeParameter('deliveryMode', itemIndex, 'native') as string;

  const payload: IDataObject = {
    sessionId: requireSessionId(context.getNodeParameter('sessionId', itemIndex) as string),
    type: messageType,
  };

  if (sendMessageTo === 'linkedChat') {
    payload.channelAlias = context.getNodeParameter('linkedAlias', itemIndex) as string;
  } else if (sendMessageTo === 'jid') {
    payload.jid = context.getNodeParameter('jid', itemIndex) as string;
  } else if (sendMessageTo === 'number') {
    payload.phoneNumber = requireWhatsappNumber(
      context.getNodeParameter('phoneNumber', itemIndex) as string,
    );
  } else if (sendMessageTo === 'yourself') {
    payload.sendToSelf = true;
  }

  payload.message = context.getNodeParameter('message', itemIndex, '') as string;
  payload.replyToMessageId = context.getNodeParameter('replyToMessageId', itemIndex, '') as string;

  if (['image', 'video', 'audio', 'document'].includes(messageType)) {
    payload.mediaUrl = context.getNodeParameter('mediaUrl', itemIndex) as string;
    payload.mimetype = context.getNodeParameter('mimetype', itemIndex, '') as string;
    payload.fileName = context.getNodeParameter('fileName', itemIndex, '') as string;
  }

  if (['image', 'video'].includes(messageType)) {
    payload.sendAsDocument = deliveryMode === 'document';
  }

  if (['image', 'video', 'document'].includes(messageType)) {
    payload.caption = context.getNodeParameter('caption', itemIndex, '') as string;
  }

  if (messageType === 'reaction') {
    payload.reactionText = context.getNodeParameter('reactionText', itemIndex, '👍') as string;
  }

  if (messageType === 'location') {
    payload.location = {
      degreesLatitude: context.getNodeParameter('latitude', itemIndex) as number,
      degreesLongitude: context.getNodeParameter('longitude', itemIndex) as number,
      name: context.getNodeParameter('locationName', itemIndex, '') as string,
      address: context.getNodeParameter('locationAddress', itemIndex, '') as string,
    };
  }

  if (messageType === 'contact') {
    payload.contact = {
      displayName: context.getNodeParameter('contactName', itemIndex) as string,
      vcard: context.getNodeParameter('contactVcard', itemIndex) as string,
    };
  }

  if (messageType === 'poll') {
    const raw = context.getNodeParameter('pollOptions', itemIndex) as string;
    payload.poll = {
      name: context.getNodeParameter('pollName', itemIndex) as string,
      values: raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      selectableCount: context.getNodeParameter('pollSelectableCount', itemIndex, 1) as number,
    };
  }

  return payload;
}

export class WhatsThat implements INodeType {
  methods = {
    loadOptions: {
      async getLinkedChats(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const access = await buildAccess(this);
        const rawSessionId = String(this.getNodeParameter('sessionId', '') ?? '').trim();
        if (!rawSessionId) {
          return [];
        }

        const sessionId = requireSessionId(rawSessionId);
        const linked = await registry.listLinkedTargets(access, sessionId);

        return linked.map((item) => ({
          name: `${item.alias} (${item.displayName})`,
          value: item.alias,
        }));
      },
    },
  };

  description: INodeTypeDescription = {
    displayName: 'WhatsThat',
    name: 'whatsThat',
    icon: 'file:whatsthat.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'Connect sessions, link chats, and send WhatsApp messages',
    defaults: { name: 'WhatsThat' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Section',
        name: 'resource',
        type: 'options',
        default: 'session',
        options: [
          { name: 'Session', value: 'session' },
          { name: 'Linked Chat', value: 'linkedChat' },
          { name: 'Message', value: 'message' },
        ],
      },
      {
        displayName: 'Action',
        name: 'operation',
        type: 'options',
        default: 'connect',
        displayOptions: {
          show: { resource: ['session'] },
        },
        options: [
          { name: 'Connect Session', value: 'connect', description: 'Start the WhatsApp session and return QR details' },
          { name: 'Wait Until Connect', value: 'ensure', description: 'Wait for an already-started session to become connected' },
          { name: 'List Sessions', value: 'list', description: 'List all saved sessions' },
          { name: 'Get Session', value: 'status', description: 'Get the current status for one session' },
          { name: 'Disconnect Session', value: 'disconnect', description: 'Disconnect the current session socket' },
          { name: 'Remove Session', value: 'remove', description: 'Remove the session and its saved auth files' },
        ],
      },
      {
        displayName: 'Action',
        name: 'operation',
        type: 'options',
        default: 'listDiscovered',
        displayOptions: {
          show: { resource: ['linkedChat'] },
        },
        options: [
          { name: 'List Discovered Chats', value: 'listDiscovered', description: 'List chats and groups seen by this session' },
          { name: 'List Linked Chats', value: 'listLinked', description: 'List saved aliases for this session' },
          { name: 'Link Chat', value: 'link', description: 'Save a chat or group under a simple alias' },
          { name: 'Unlink Chat', value: 'unlink', description: 'Remove a saved alias from this session' },
        ],
      },
      {
        displayName: 'Action',
        name: 'operation',
        type: 'options',
        default: 'send',
        displayOptions: {
          show: { resource: ['message'] },
        },
        options: [
          { name: 'Send Message', value: 'send', description: 'Send a message or media from the connected session' },
        ],
      },
      {
        displayName: 'Session Name',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description: 'Stable internal name for this session, for example main-phone or support-phone.',
      },
      {
        displayName: 'Display Name',
        name: 'label',
        type: 'string',
        default: '',
        description: 'Friendly label for this session, for example Luca phone or Support phone.',
        displayOptions: {
          show: {
            resource: ['session'],
            operation: ['connect'],
          },
        },
      },
      {
        displayName: 'WhatsApp Number',
        name: 'phoneNumberForPairing',
        type: 'string',
        default: '',
        description:
          'Optional. Full number with country code, digits only, without 00 or +. Open qrCodeUrl if available.',
        displayOptions: {
          show: {
            resource: ['session'],
            operation: ['connect'],
          },
        },
      },
      {
        displayName: 'Timeout Seconds',
        name: 'timeoutSeconds',
        type: 'number',
        typeOptions: {
          minValue: 1,
        },
        default: 300,
        description: 'How long to wait for the already-started session to become connected.',
        displayOptions: {
          show: {
            resource: ['session'],
            operation: ['ensure'],
          },
        },
      },
      {
        displayName: 'Chat JID',
        name: 'jid',
        type: 'string',
        default: '',
        required: true,
        description: 'Raw WhatsApp chat or group JID. Usually copied from List Discovered Chats.',
        displayOptions: {
          show: {
            resource: ['linkedChat'],
            operation: ['link'],
          },
        },
      },
      {
        displayName: 'Linked Chat',
        name: 'alias',
        type: 'string',
        default: '',
        required: true,
        description: 'Simple name you will use later, for example support, sales, or team.',
        displayOptions: {
          show: {
            resource: ['linkedChat'],
            operation: ['link', 'unlink'],
          },
        },
      },
      {
        displayName: 'Send Message To',
        name: 'sendMessageTo',
        type: 'options',
        default: 'linkedChat',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
          },
        },
        options: [
          { name: 'Linked Chat', value: 'linkedChat' },
          { name: 'WhatsApp Number', value: 'number' },
          { name: 'Raw JID', value: 'jid' },
          { name: 'Yourself', value: 'yourself' },
        ],
      },
      {
        displayName: 'Linked Chat',
        name: 'linkedAlias',
        type: 'options',
        default: '',
        required: true,
        description: 'Choose one of the chats already linked for this session.',
        typeOptions: {
          loadOptionsMethod: 'getLinkedChats',
        },
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            sendMessageTo: ['linkedChat'],
          },
        },
      },
      {
        displayName: 'WhatsApp Number',
        name: 'phoneNumber',
        type: 'string',
        default: '',
        required: true,
        description:
          'Full number with country code, digits only, without 00 or +. Example: 393331234567.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            sendMessageTo: ['number'],
          },
        },
      },
      {
        displayName: 'JID',
        name: 'jid',
        type: 'string',
        default: '',
        required: true,
        description: 'Raw WhatsApp JID, for example 393331234567@s.whatsapp.net.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            sendMessageTo: ['jid'],
          },
        },
      },
      {
        displayName: 'Send To Yourself',
        name: 'yourselfNotice',
        type: 'notice',
        default: '',
        description:
          'The message will be sent to the WhatsApp number already connected for this session.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            sendMessageTo: ['yourself'],
          },
        },
      },
      {
        displayName: 'Message Type',
        name: 'messageType',
        type: 'options',
        default: 'text',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
          },
        },
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Image', value: 'image' },
          { name: 'Video', value: 'video' },
          { name: 'Audio', value: 'audio' },
          { name: 'Document', value: 'document' },
          { name: 'Reaction', value: 'reaction' },
          { name: 'Location', value: 'location' },
          { name: 'Contact', value: 'contact' },
          { name: 'Poll', value: 'poll' },
        ],
      },
      {
        displayName: 'Delivery Mode',
        name: 'deliveryMode',
        type: 'options',
        default: 'native',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['image', 'video'],
          },
        },
        options: [
          { name: 'Native Media', value: 'native' },
          { name: 'As File', value: 'document' },
        ],
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        description: 'Main text body for the outbound message.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
          },
          hide: {
            messageType: ['location', 'contact', 'poll'],
          },
        },
      },
      {
        displayName: 'Media URL',
        name: 'mediaUrl',
        type: 'string',
        default: '',
        description: 'Public URL or reachable file URL for the media to send.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['image', 'video', 'audio', 'document'],
          },
        },
      },
      {
        displayName: 'Caption',
        name: 'caption',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['image', 'video', 'document'],
          },
        },
      },
      {
        displayName: 'Mimetype',
        name: 'mimetype',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['image', 'video', 'audio', 'document'],
          },
        },
      },
      {
        displayName: 'File Name',
        name: 'fileName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['image', 'video', 'document'],
          },
        },
      },
      {
        displayName: 'Reply To Message ID',
        name: 'replyToMessageId',
        type: 'string',
        default: '',
        description: 'Optional. Reply or react to a specific WhatsApp message ID.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
          },
        },
      },
      {
        displayName: 'Reaction Text',
        name: 'reactionText',
        type: 'string',
        default: '👍',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['reaction'],
          },
        },
      },
      {
        displayName: 'Latitude',
        name: 'latitude',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['location'],
          },
        },
      },
      {
        displayName: 'Longitude',
        name: 'longitude',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['location'],
          },
        },
      },
      {
        displayName: 'Location Name',
        name: 'locationName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['location'],
          },
        },
      },
      {
        displayName: 'Location Address',
        name: 'locationAddress',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['location'],
          },
        },
      },
      {
        displayName: 'Contact Name',
        name: 'contactName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['contact'],
          },
        },
      },
      {
        displayName: 'Contact VCard',
        name: 'contactVcard',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['contact'],
          },
        },
      },
      {
        displayName: 'Poll Name',
        name: 'pollName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['poll'],
          },
        },
      },
      {
        displayName: 'Poll Options',
        name: 'pollOptions',
        type: 'string',
        default: '',
        description: 'Comma-separated options, for example Yes, No, Maybe.',
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['poll'],
          },
        },
      },
      {
        displayName: 'Selectable Count',
        name: 'pollSelectableCount',
        type: 'number',
        default: 1,
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['send'],
            messageType: ['poll'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const access = await buildAccess(this);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const operation = this.getNodeParameter('operation', itemIndex) as string;
        const rawSessionId = this.getNodeParameter('sessionId', itemIndex, '') as string;
        const sessionId =
          resource === 'session' && operation === 'list'
            ? normalizeSessionId(rawSessionId)
            : requireSessionId(rawSessionId);
        let json: unknown;

        switch (`${resource}:${operation}`) {
          case 'session:connect': {
            const label = String(this.getNodeParameter('label', itemIndex, '') ?? '').trim();
            const phoneNumberForPairing = String(
              this.getNodeParameter('phoneNumberForPairing', itemIndex, '') ?? '',
            ).trim();

            await registry.ensureSession(access.paths.root, access, {
              sessionId,
              label: label || sessionId,
              phoneNumberForPairing,
            });
            json = await registry.connectSession(access.paths.root, access, sessionId);
            break;
          }
          case 'session:ensure': {
            const timeoutSeconds = this.getNodeParameter('timeoutSeconds', itemIndex, 300) as number;
            json = await registry.ensureConnectedSession(
              access.paths.root,
              access,
              { sessionId },
              {
                waitFor: 'connected',
                timeoutMs: timeoutSeconds * 1000,
              },
            );
            break;
          }
          case 'session:list':
            json = await registry.listSessions(access);
            break;
          case 'session:status':
            json = (await registry.getSession(access, sessionId)) ?? null;
            break;
          case 'session:disconnect':
            json = (await registry.disconnectSession(access, sessionId)) ?? null;
            break;
          case 'session:remove':
            json = { removed: await registry.removeSession(access.paths.root, access, sessionId) };
            break;
          case 'linkedChat:listDiscovered':
            json = await registry.listTargets(access, sessionId);
            break;
          case 'linkedChat:listLinked':
            json = await registry.listLinkedTargets(access, sessionId);
            break;
          case 'linkedChat:link':
            json = await registry.connectTarget(
              access,
              sessionId,
              this.getNodeParameter('alias', itemIndex) as string,
              this.getNodeParameter('jid', itemIndex) as string,
            );
            break;
          case 'linkedChat:unlink':
            json = {
              removed: await registry.unlinkTarget(
                access,
                sessionId,
                this.getNodeParameter('alias', itemIndex) as string,
              ),
            };
            break;
          case 'message:send':
            json = await registry.sendMessage(access, buildMessagePayload(this, itemIndex) as never);
            break;
          default:
            throw new Error(`Unsupported action ${resource}:${operation}`);
        }

        returnData.push({ json: formatSessionOutput(json) as IDataObject, pairedItem: itemIndex });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: itemIndex });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
      }
    }

    return [returnData];
  }
}
