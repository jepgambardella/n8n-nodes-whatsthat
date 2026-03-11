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

function buildPayload(context: IExecuteFunctions, itemIndex: number): IDataObject {
  const messageType = context.getNodeParameter('messageType', itemIndex) as string;
  const targetMode = context.getNodeParameter('targetMode', itemIndex) as string;
  const deliveryMode = context.getNodeParameter('deliveryMode', itemIndex, 'native') as string;

  const payload: IDataObject = {
    sessionId: requireSessionId(context.getNodeParameter('sessionId', itemIndex) as string),
    type: messageType,
  };

  if (targetMode === 'alias') {
    payload.channelAlias = context.getNodeParameter('alias', itemIndex) as string;
  } else {
    payload.jid = context.getNodeParameter('jid', itemIndex) as string;
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

export class WhatsThatMessage implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsThat Message',
    name: 'whatsThatMessage',
    icon: 'file:../WhatsThatSession/whatsthat.svg',
    group: ['transform'],
    version: 1,
    description: 'Send messages and media through an embedded WhatsThat session',
    defaults: { name: 'WhatsThat Message' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'whatsThatRuntime', required: true }],
    properties: [
      {
        displayName: 'Session ID (Internal)',
        name: 'sessionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The unique session ID created in the WhatsThat Session node.',
      },
      {
        displayName: 'Target Mode',
        name: 'targetMode',
        type: 'options',
        default: 'alias',
        options: [
          { name: 'Linked Alias', value: 'alias' },
          { name: 'Raw JID', value: 'jid' },
        ],
      },
      {
        displayName: 'Alias',
        name: 'alias',
        type: 'string',
        default: '',
        displayOptions: { show: { targetMode: ['alias'] } },
      },
      {
        displayName: 'JID',
        name: 'jid',
        type: 'string',
        default: '',
        displayOptions: { show: { targetMode: ['jid'] } },
      },
      {
        displayName: 'Message Type',
        name: 'messageType',
        type: 'options',
        default: 'text',
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
        options: [
          { name: 'Native Media', value: 'native' },
          { name: 'As File', value: 'document' },
        ],
        displayOptions: { show: { messageType: ['image', 'video'] } },
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: { hide: { messageType: ['location', 'contact', 'poll'] } },
      },
      {
        displayName: 'Media URL',
        name: 'mediaUrl',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['image', 'video', 'audio', 'document'] } },
      },
      {
        displayName: 'Caption',
        name: 'caption',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['image', 'video', 'document'] } },
      },
      {
        displayName: 'Mimetype',
        name: 'mimetype',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['image', 'video', 'audio', 'document'] } },
      },
      {
        displayName: 'File Name',
        name: 'fileName',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['image', 'video', 'document'] } },
      },
      { displayName: 'Reply To Message ID', name: 'replyToMessageId', type: 'string', default: '' },
      {
        displayName: 'Reaction Text',
        name: 'reactionText',
        type: 'string',
        default: '👍',
        displayOptions: { show: { messageType: ['reaction'] } },
      },
      {
        displayName: 'Latitude',
        name: 'latitude',
        type: 'number',
        default: 0,
        displayOptions: { show: { messageType: ['location'] } },
      },
      {
        displayName: 'Longitude',
        name: 'longitude',
        type: 'number',
        default: 0,
        displayOptions: { show: { messageType: ['location'] } },
      },
      {
        displayName: 'Location Name',
        name: 'locationName',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['location'] } },
      },
      {
        displayName: 'Location Address',
        name: 'locationAddress',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['location'] } },
      },
      {
        displayName: 'Contact Name',
        name: 'contactName',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['contact'] } },
      },
      {
        displayName: 'Contact VCard',
        name: 'contactVcard',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: { show: { messageType: ['contact'] } },
      },
      {
        displayName: 'Poll Name',
        name: 'pollName',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['poll'] } },
      },
      {
        displayName: 'Poll Options',
        name: 'pollOptions',
        type: 'string',
        default: '',
        displayOptions: { show: { messageType: ['poll'] } },
      },
      {
        displayName: 'Selectable Count',
        name: 'pollSelectableCount',
        type: 'number',
        default: 1,
        displayOptions: { show: { messageType: ['poll'] } },
      }
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const access = await buildAccess(this);
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const result = await registry.sendMessage(access, buildPayload(this, itemIndex) as never);
        returnData.push({ json: result as IDataObject, pairedItem: itemIndex });
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
