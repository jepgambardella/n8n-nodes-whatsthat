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
import {
  normalizeSessionId,
  requireSessionId,
  requireWhatsappNumber,
} from '../../shared/validation';

function buildPayload(context: IExecuteFunctions, itemIndex: number): IDataObject {
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
      values: raw.split(',').map((value) => value.trim()).filter(Boolean),
      selectableCount: context.getNodeParameter('pollSelectableCount', itemIndex, 1) as number,
    };
  }

  return payload;
}

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

export class WhatsThat implements INodeType {
  methods = {
    loadOptions: {
      async getLinkedAliases(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const access = await buildAccess(this);
        const sessionId = requireSessionId(this.getNodeParameter('sessionId') as string);
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
    icon: 'file:../WhatsThatSession/whatsthat.svg',
    group: ['transform'],
    version: 1,
    description: 'Manage sessions, chat links, and messages for WhatsThat',
    defaults: { name: 'WhatsThat' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'session',
        noDataExpression: true,
        options: [
          { name: 'Session', value: 'session' },
          { name: 'Linked Chat', value: 'linkChat' },
          { name: 'Send Message', value: 'sendMessage' },
        ],
      },
      {
        displayName: 'Operation',
        name: 'sessionOperation',
        type: 'options',
        default: 'connect',
        displayOptions: {
          show: { resource: ['session'] },
        },
        options: [
          { name: 'Connect Session', value: 'connect' },
          { name: 'Wait Until Connect', value: 'ensure' },
          { name: 'List Sessions', value: 'list' },
          { name: 'Get Session', value: 'status' },
          { name: 'Disconnect Session', value: 'disconnect' },
          { name: 'Remove Session', value: 'remove' },
        ],
      },
      {
        displayName: 'Operation',
        name: 'linkChatOperation',
        type: 'options',
        default: 'listDiscovered',
        displayOptions: {
          show: { resource: ['linkChat'] },
        },
        options: [
          { name: 'List Discovered Chats', value: 'listDiscovered' },
          { name: 'List Linked Chats', value: 'listLinked' },
          { name: 'Link Chat', value: 'link' },
          { name: 'Unlink Chat', value: 'unlink' },
        ],
      },
      {
        displayName: 'Session Name',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description:
          'Required unique ID for this session. Use a stable internal value such as "main-phone" or "support-team".',
        displayOptions: {
          hide: {
            resource: ['session'],
            sessionOperation: ['list'],
          },
        },
      },
      {
        displayName: 'Display Name',
        name: 'label',
        type: 'string',
        default: '',
        description:
          'Human-readable name shown in results. Example: "Luca personal phone" or "Support number".',
        displayOptions: {
          show: {
            resource: ['session'],
            sessionOperation: ['connect'],
          },
        },
      },
      {
        displayName: 'WhatsApp Number',
        name: 'phoneNumberForPairing',
        type: 'string',
        default: '',
        description:
          'Optional. Full phone number with country code, digits only, without 00 or +. Example: 393331234567.',
        displayOptions: {
          show: {
            resource: ['session'],
            sessionOperation: ['connect'],
          },
        },
      },
      {
        displayName: 'Timeout Seconds',
        name: 'timeoutSeconds',
        type: 'number',
        default: 300,
        typeOptions: {
          minValue: 1,
        },
        description: 'Maximum time to wait before returning the latest known session status.',
        displayOptions: {
          show: {
            resource: ['session'],
            sessionOperation: ['ensure'],
          },
        },
      },
      {
        displayName: 'Chat JID',
        name: 'linkJid',
        type: 'string',
        default: '',
        description: 'The raw WhatsApp JID to link. Usually taken from List Discovered Chats.',
        displayOptions: {
          show: {
            resource: ['linkChat'],
            linkChatOperation: ['link'],
          },
        },
      },
      {
        displayName: 'Linked Chat',
        name: 'linkAlias',
        type: 'string',
        default: '',
        description: 'Friendly name you will use later when sending messages by alias.',
        displayOptions: {
          show: {
            resource: ['linkChat'],
            linkChatOperation: ['link', 'unlink'],
          },
        },
      },
      {
        displayName: 'Send Message To',
        name: 'sendMessageTo',
        type: 'options',
        default: 'linkedChat',
        description: 'Choose how to resolve the destination chat.',
        options: [
          { name: 'Linked Chat', value: 'linkedChat' },
          { name: 'WhatsApp Number', value: 'number' },
          { name: 'Raw JID', value: 'jid' },
          { name: 'Yourself', value: 'yourself' },
        ],
        displayOptions: {
          show: { resource: ['sendMessage'] },
        },
      },
      {
        displayName: 'Linked Chat',
        name: 'linkedAlias',
        type: 'options',
        default: '',
        description: 'Choose one of the linked chats saved for this session.',
        typeOptions: {
          loadOptionsMethod: 'getLinkedAliases',
        },
        displayOptions: {
          show: {
            resource: ['sendMessage'],
            sendMessageTo: ['linkedChat'],
          },
        },
      },
      {
        displayName: 'WhatsApp Number',
        name: 'phoneNumber',
        type: 'string',
        default: '',
        description:
          'Full phone number with country code, digits only, without 00 or +. Example: 393331234567.',
        displayOptions: {
          show: {
            resource: ['sendMessage'],
            sendMessageTo: ['number'],
          },
        },
      },
      {
        displayName: 'JID',
        name: 'jid',
        type: 'string',
        default: '',
        description: 'Raw WhatsApp JID, for example 393331234567@s.whatsapp.net or a group JID.',
        displayOptions: {
          show: {
            resource: ['sendMessage'],
            sendMessageTo: ['jid'],
          },
        },
      },
      {
        displayName: 'Yourself',
        name: 'yourselfNotice',
        type: 'notice',
        default: '',
        description: 'Send the message to the WhatsApp number already connected for this session.',
        displayOptions: {
          show: {
            resource: ['sendMessage'],
            sendMessageTo: ['yourself'],
          },
        },
      },
      {
        displayName: 'Message Type',
        name: 'messageType',
        type: 'options',
        default: 'text',
        description: 'The kind of outbound message to send.',
        displayOptions: {
          show: { resource: ['sendMessage'] },
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
            resource: ['sendMessage'],
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
          show: { resource: ['sendMessage'] },
          hide: { messageType: ['location', 'contact', 'poll'] },
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
          show: { resource: ['sendMessage'] },
        },
      },
      {
        displayName: 'Reaction Text',
        name: 'reactionText',
        type: 'string',
        default: '👍',
        displayOptions: {
          show: {
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
            messageType: ['poll'],
          },
        },
      },
      {
        displayName: 'Poll Options',
        name: 'pollOptions',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['sendMessage'],
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
            resource: ['sendMessage'],
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
        const rawSessionId = this.getNodeParameter('sessionId', itemIndex, '') as string;
        let json: unknown;

        if (resource === 'session') {
          const operation = this.getNodeParameter('sessionOperation', itemIndex) as string;
          const sessionId =
            operation === 'list' ? normalizeSessionId(rawSessionId) : requireSessionId(rawSessionId);

          switch (operation) {
            case 'connect': {
              const label = (this.getNodeParameter('label', itemIndex, '') as string).trim();
              const phoneNumberForPairing = (
                this.getNodeParameter('phoneNumberForPairing', itemIndex, '') as string
              ).trim();

              await registry.ensureSession(access.paths.root, access, {
                sessionId,
                label: label || sessionId,
                phoneNumberForPairing,
              });
              json = await registry.connectSession(access.paths.root, access, sessionId);
              break;
            }
            case 'ensure': {
              const label = (this.getNodeParameter('label', itemIndex, '') as string).trim();
              const phoneNumberForPairing = (
                this.getNodeParameter('phoneNumberForPairing', itemIndex, '') as string
              ).trim();
              const timeoutSeconds = this.getNodeParameter('timeoutSeconds', itemIndex, 300) as number;

              json = await registry.ensureConnectedSession(
                access.paths.root,
                access,
                {
                  sessionId,
                  label: label || sessionId,
                  phoneNumberForPairing,
                },
                {
                  waitFor: 'connected',
                  timeoutMs: timeoutSeconds * 1000,
                },
              );
              break;
            }
            case 'list':
              json = await registry.listSessions(access);
              break;
            case 'status':
              json = (await registry.getSession(access, sessionId)) ?? null;
              break;
            case 'disconnect':
              json = (await registry.disconnectSession(access, sessionId)) ?? null;
              break;
            case 'remove':
              json = { removed: await registry.removeSession(access, sessionId) };
              break;
            default:
              throw new Error(`Unsupported session operation ${operation}`);
          }

          json = formatSessionOutput(json);
        } else if (resource === 'linkChat') {
          const operation = this.getNodeParameter('linkChatOperation', itemIndex) as string;
          const sessionId = requireSessionId(rawSessionId);

          switch (operation) {
            case 'listDiscovered':
              json = await registry.listTargets(access, sessionId);
              break;
            case 'listLinked':
              json = await registry.listLinkedTargets(access, sessionId);
              break;
            case 'link':
              json = await registry.connectTarget(
                access,
                sessionId,
                this.getNodeParameter('linkAlias', itemIndex) as string,
                this.getNodeParameter('linkJid', itemIndex) as string,
              );
              break;
            case 'unlink':
              json = {
                removed: await registry.unlinkTarget(
                  access,
                  sessionId,
                  this.getNodeParameter('linkAlias', itemIndex) as string,
                ),
              };
              break;
            default:
              throw new Error(`Unsupported link chat operation ${operation}`);
          }
        } else if (resource === 'sendMessage') {
          json = await registry.sendMessage(access, buildPayload(this, itemIndex) as never);
        } else {
          throw new Error(`Unsupported resource ${resource}`);
        }

        returnData.push({ json: json as IDataObject, pairedItem: itemIndex });
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
