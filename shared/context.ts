import path from 'node:path';

import type {
  ICredentialDataDecryptedObject,
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
} from 'n8n-workflow';

export type NodeContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface RuntimeConfig {
  storagePath: string;
}

export async function getRuntimeConfig(context: NodeContext): Promise<RuntimeConfig> {
  const credentials = await context.getCredentials<ICredentialDataDecryptedObject>('whatsThatRuntime');
  const storagePath = String(credentials.storagePath || '/home/node/.n8n/whatsthat');
  return {
    storagePath,
  };
}

export function runtimePaths(config: RuntimeConfig) {
  return {
    root: config.storagePath,
    authRoot: path.join(config.storagePath, 'auth'),
    tablesFallback: path.join(config.storagePath, 'tables'),
  };
}

export function asDataObject(value: unknown): IDataObject {
  return value as IDataObject;
}
