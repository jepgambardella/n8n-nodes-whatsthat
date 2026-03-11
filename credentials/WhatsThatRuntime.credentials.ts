import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class WhatsThatRuntime implements ICredentialType {
  name = 'whatsThatRuntime';

  displayName = 'WhatsThat Runtime';

  documentationUrl = 'https://github.com/jepgambardella/n8n-nodes-whatsthat';

  properties: INodeProperties[] = [
    {
      displayName: 'Storage Path',
      name: 'storagePath',
      type: 'string',
      default: '=/home/node/.n8n/whatsthat',
      required: true,
      description: 'Root folder used for session auth files and metadata',
    },
  ];
}
