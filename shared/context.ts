import path from 'node:path';

import type {
  ICredentialDataDecryptedObject,
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  IDataTableProjectAggregateService,
  IDataTableProjectService,
} from 'n8n-workflow';

export type NodeContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface RuntimeConfig {
  storagePath: string;
  useDataTables: boolean;
}

export async function getRuntimeConfig(context: NodeContext): Promise<RuntimeConfig> {
  const credentials = await context.getCredentials<ICredentialDataDecryptedObject>('whatsThatRuntime');
  const storagePath = String(credentials.storagePath || '/home/node/.n8n/whatsthat');
  return {
    storagePath,
    useDataTables: Boolean(credentials.useDataTables ?? true),
  };
}

export function runtimePaths(config: RuntimeConfig) {
  return {
    root: config.storagePath,
    authRoot: path.join(config.storagePath, 'auth'),
    tablesFallback: path.join(config.storagePath, 'tables'),
  };
}

export async function getAggregateProxy(
  context: NodeContext,
): Promise<IDataTableProjectAggregateService | null> {
  if (!context.helpers.getDataTableAggregateProxy) {
    return null;
  }

  return context.helpers.getDataTableAggregateProxy();
}

export async function getTableProxy(
  context: NodeContext,
  tableId: string,
): Promise<IDataTableProjectService | null> {
  if (!context.helpers.getDataTableProxy) {
    return null;
  }

  return context.helpers.getDataTableProxy(tableId);
}

export function asDataObject(value: unknown): IDataObject {
  return value as IDataObject;
}
