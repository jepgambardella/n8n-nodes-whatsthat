import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildAccess } from '../../shared/access';
import { registry } from '../../shared/runtime';
import { normalizeSessionId, requireSessionId } from '../../shared/validation';

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

export class WhatsThatSession implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsThat',
    name: 'whatsThatSession',
    icon: 'file:whatsthat.svg',
    group: ['transform'],
    version: 1,
    description: 'Connect and manage WhatsApp sessions',
    defaults: { name: 'Connect Session' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'connect',
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
        displayName: 'Session Name',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description:
          'Stable internal name for this session, for example main-phone or support-phone.',
        displayOptions: {
          hide: { operation: ['list'] },
        },
      },
      {
        displayName: 'Display Name',
        name: 'label',
        type: 'string',
        default: '',
        description: 'Friendly label for this session, for example Luca phone or Support phone.',
        displayOptions: {
          show: { operation: ['connect'] },
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
          show: { operation: ['connect'] },
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
          show: { operation: ['ensure'] },
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
        const operation = this.getNodeParameter('operation', itemIndex) as string;
        const rawSessionId = this.getNodeParameter('sessionId', itemIndex, '') as string;
        const sessionId =
          operation === 'list' ? normalizeSessionId(rawSessionId) : requireSessionId(rawSessionId);
        let json: unknown;

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
            const timeoutSeconds = this.getNodeParameter('timeoutSeconds', itemIndex, 300) as number;

            json = await registry.ensureConnectedSession(
              access.paths.root,
              access,
              {
                sessionId,
                label: sessionId,
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
            throw new Error(`Unsupported operation ${operation}`);
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
