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

export class WhatsThatSession implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsThat Session',
    name: 'whatsThatSession',
    icon: 'file:whatsthat.svg',
    group: ['transform'],
    version: 1,
    description: 'Manage embedded Baileys sessions for WhatsThat',
    defaults: { name: 'WhatsThat Session' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'create',
        options: [
          { name: 'Create Session', value: 'create' },
          { name: 'Connect Session', value: 'connect' },
          { name: 'List Sessions', value: 'list' },
          { name: 'Get Session Status', value: 'status' },
          { name: 'Disconnect Session', value: 'disconnect' },
          { name: 'Remove Session', value: 'remove' },
        ],
      },
      {
        displayName: 'Session ID (Internal)',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description:
          'Required unique ID for this session. Use a stable internal value such as "main-phone" or "support-team".',
        displayOptions: {
          hide: { operation: ['list'] },
        },
      },
      {
        displayName: 'Label (Visible Name)',
        name: 'label',
        type: 'string',
        default: '',
        description:
          'Human-readable name shown in results. Example: "Luca personal phone" or "Support number".',
        displayOptions: {
          show: { operation: ['create'] },
        },
      },
      {
        displayName: 'Phone Number For Pairing',
        name: 'phoneNumberForPairing',
        type: 'string',
        default: '',
        description:
          'Optional. Full phone number with country code, digits only, without 00 or +. Example: 393331234567.',
        displayOptions: {
          show: { operation: ['create'] },
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
        const sessionId = operation === 'list' ? normalizeSessionId(rawSessionId) : requireSessionId(rawSessionId);
        let json: unknown;
        const label = (this.getNodeParameter('label', itemIndex, '') as string).trim();
        const phoneNumberForPairing = (
          this.getNodeParameter('phoneNumberForPairing', itemIndex, '') as string
        ).trim();

        switch (operation) {
          case 'create':
            json = await registry.ensureSession(access.paths.root, access, {
              sessionId,
              label: label || sessionId,
              phoneNumberForPairing,
            });
            break;
          case 'connect':
            json = await registry.connectSession(access.paths.root, access, sessionId);
            break;
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
