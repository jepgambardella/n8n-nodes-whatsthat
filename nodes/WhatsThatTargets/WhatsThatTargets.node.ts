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
import { requireSessionId } from '../../shared/validation';

export class WhatsThatTargets implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsThat Targets',
    name: 'whatsThatTargets',
    icon: 'file:../WhatsThatSession/whatsthat.svg',
    group: ['transform'],
    version: 1,
    description: 'Discover, link, and manage chats and groups for WhatsThat',
    defaults: { name: 'WhatsThat Targets' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'listDiscovered',
        options: [
          { name: 'List Discovered Targets', value: 'listDiscovered' },
          { name: 'List Linked Targets', value: 'listLinked' },
          { name: 'Link Target', value: 'link' },
          { name: 'Unlink Target', value: 'unlink' },
        ],
      },
      {
        displayName: 'Session ID (Internal)',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The unique session ID created in the WhatsThat Session node.',
      },
      {
        displayName: 'Target JID',
        name: 'jid',
        type: 'string',
        default: '',
        displayOptions: {
          show: { operation: ['link'] },
        },
      },
      {
        displayName: 'Alias',
        name: 'alias',
        type: 'string',
        default: '',
        displayOptions: {
          show: { operation: ['link', 'unlink'] },
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
        const sessionId = requireSessionId(this.getNodeParameter('sessionId', itemIndex) as string);
        let json: unknown;

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
              this.getNodeParameter('alias', itemIndex) as string,
              this.getNodeParameter('jid', itemIndex) as string,
            );
            break;
          case 'unlink':
            json = {
              removed: await registry.unlinkTarget(
                access,
                sessionId,
                this.getNodeParameter('alias', itemIndex) as string,
              ),
            };
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
