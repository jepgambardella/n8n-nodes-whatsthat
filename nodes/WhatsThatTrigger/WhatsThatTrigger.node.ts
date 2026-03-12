import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
} from 'n8n-workflow';

import { buildAccess } from '../../shared/access';
import { extractMessageText, registry } from '../../shared/runtime';
import type { RuntimeEvent } from '../../shared/types';
import { requireSessionId } from '../../shared/validation';

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
      {
        displayName: 'Session Name',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The session that owns the incoming events for this trigger.',
      },
      {
        displayName: 'Event',
        name: 'eventName',
        type: 'options',
        default: 'message.received',
        options: [
          { name: 'Link Chat Command', value: 'link.chat.command' },
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
      },
      {
        displayName: 'Link Command',
        name: 'linkCommand',
        type: 'string',
        default: '/link-whatsthat',
        description:
          'Users must send this command followed by a space and the alias in the chat to link. Example: /link-whatsthat support',
        displayOptions: {
          show: {
            eventName: ['link.chat.command'],
          },
        },
      }
    ],
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const sessionId = requireSessionId(this.getNodeParameter('sessionId') as string);
    const eventName = this.getNodeParameter('eventName') as string;
    const linkCommand = (this.getNodeParameter('linkCommand') as string) || '/link-whatsthat';
    const access = await buildAccess(this);

    const handler = async (event: RuntimeEvent) => {
      if (event.sessionId !== sessionId) return;

      if (eventName === 'link.chat.command') {
        if (event.event !== 'message.received') return;

        const data = event.data as {
          remoteJid?: string;
          pushName?: string;
          message?: unknown;
        };
        const text = extractMessageText(data.message as never)?.trim();
        const prefix = linkCommand.trim();
        if (!text || !prefix || !text.startsWith(`${prefix} `)) return;

        const alias = text.slice(prefix.length).trim();
        const jid = data.remoteJid;
        if (!alias || !jid) return;

        const linked = await registry.connectTarget(access, sessionId, alias, jid);
        this.emit([
          [
            {
              json: {
                event: 'link.chat.command',
                sessionId,
                alias,
                jid,
                linked,
              } as IDataObject,
            },
          ],
        ]);
        return;
      }

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
