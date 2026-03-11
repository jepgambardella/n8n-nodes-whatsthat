import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
} from 'n8n-workflow';

import { registry } from '../../shared/runtime';
import type { RuntimeEvent } from '../../shared/types';

export class WhatsThatTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsThat Trigger',
    name: 'whatsThatTrigger',
    icon: 'file:../WhatsThatSession/whatsthat.svg',
    group: ['trigger'],
    version: 1,
    description: 'Listen to session, message, and group events from WhatsThat',
    defaults: { name: 'WhatsThat Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      { displayName: 'Session ID', name: 'sessionId', type: 'string', default: '' },
      {
        displayName: 'Event',
        name: 'eventName',
        type: 'options',
        default: 'message.received',
        options: [
          { name: 'Message Received', value: 'message.received' },
          { name: 'Message From Me', value: 'message.from_me' },
          { name: 'Message Sent', value: 'message.sent' },
          { name: 'Session Pairing', value: 'session.pairing' },
          { name: 'Session Connected', value: 'session.connected' },
          { name: 'Session Disconnected', value: 'session.disconnected' },
          { name: 'Group Updated', value: 'group.updated' },
          { name: 'Group Participants', value: 'group.participants' },
          { name: 'Any Event', value: '*' }
        ],
      }
    ],
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const sessionId = this.getNodeParameter('sessionId') as string;
    const eventName = this.getNodeParameter('eventName') as string;
    const handler = (event: RuntimeEvent) => {
      if (event.sessionId !== sessionId) return;
      if (eventName !== '*' && event.event !== eventName) return;
      this.emit([[{ json: event as unknown as IDataObject }]]);
    };

    registry.on('event', handler);

    return {
      closeFunction: async () => {
        registry.off('event', handler);
      },
    };
  }
}
