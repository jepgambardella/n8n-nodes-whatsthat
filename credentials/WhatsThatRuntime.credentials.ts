import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class WhatsThatRuntime implements ICredentialType {
  name = 'whatsThatRuntime';

  displayName = 'WhatsThat Runtime';

  documentationUrl = 'https://github.com/jep182/whatsapp-bot';

  properties: INodeProperties[] = [
    {
      displayName: 'Storage Path',
      name: 'storagePath',
      type: 'string',
      default: '=/home/node/.n8n/whatsthat',
      required: true,
      description: 'Root folder used for session files and local fallback data',
    },
    {
      displayName: 'Use Data Tables',
      name: 'useDataTables',
      type: 'boolean',
      default: true,
      description: 'Use n8n Data Tables when available, with filesystem fallback',
    },
  ];
}
