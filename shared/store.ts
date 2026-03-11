import path from 'node:path';

import type { NodeContext, RuntimeConfig } from './context';
import { getAggregateProxy, getTableProxy, runtimePaths } from './context';
import { ensureDir, readJson, writeJson } from './fs';
import type { DedupRecord, DiscoveredTarget, LinkedTarget, SessionRecord } from './types';

type TableName = 'sessions' | 'linked_targets' | 'discovered_targets' | 'dedup';

const tableSchemas = {
  sessions: [
    { name: 'sessionId', type: 'string' as const },
    { name: 'label', type: 'string' as const },
    { name: 'status', type: 'string' as const },
    { name: 'phone', type: 'string' as const },
    { name: 'pairingCode', type: 'string' as const },
    { name: 'qr', type: 'string' as const },
    { name: 'qrDataUrl', type: 'string' as const },
    { name: 'phoneNumberForPairing', type: 'string' as const },
    { name: 'lastSeenAt', type: 'string' as const },
    { name: 'createdAt', type: 'string' as const },
    { name: 'updatedAt', type: 'string' as const },
    { name: 'lastDisconnectReason', type: 'string' as const },
  ],
  linked_targets: [
    { name: 'alias', type: 'string' as const },
    { name: 'sessionId', type: 'string' as const },
    { name: 'jid', type: 'string' as const },
    { name: 'displayName', type: 'string' as const },
    { name: 'targetType', type: 'string' as const },
    { name: 'lastSeenAt', type: 'string' as const },
    { name: 'createdAt', type: 'string' as const },
  ],
  discovered_targets: [
    { name: 'sessionId', type: 'string' as const },
    { name: 'jid', type: 'string' as const },
    { name: 'displayName', type: 'string' as const },
    { name: 'targetType', type: 'string' as const },
    { name: 'lastSeenAt', type: 'string' as const },
  ],
  dedup: [
    { name: 'sessionId', type: 'string' as const },
    { name: 'messageId', type: 'string' as const },
    { name: 'expiresAt', type: 'string' as const },
  ],
};

type StorePayloadMap = {
  sessions: SessionRecord[];
  linked_targets: LinkedTarget[];
  discovered_targets: DiscoveredTarget[];
  dedup: DedupRecord[];
};

async function ensureTable(
  context: NodeContext,
  tableName: TableName,
): Promise<string | null> {
  const aggregate = await getAggregateProxy(context);
  if (!aggregate) {
    return null;
  }

  const existing = await aggregate.getManyAndCount({ filter: { name: tableName } });
  const found = existing.data.find((table) => table.name === tableName);
  if (found) {
    return found.id;
  }

  const created = await aggregate.createDataTable({
    name: tableName,
    columns: tableSchemas[tableName],
  });
  return created.id;
}

async function fallbackFile<T extends TableName>(
  config: RuntimeConfig,
  tableName: T,
): Promise<string> {
  const filePath = path.join(runtimePaths(config).tablesFallback, `${tableName}.json`);
  await ensureDir(path.dirname(filePath));
  return filePath;
}

export async function listRecords<T extends TableName>(
  context: NodeContext,
  config: RuntimeConfig,
  tableName: T,
): Promise<StorePayloadMap[T]> {
  if (config.useDataTables) {
    const tableId = await ensureTable(context, tableName);
    if (tableId) {
      const table = await getTableProxy(context, tableId);
      if (table) {
        const rows = await table.getManyRowsAndCount({});
        return rows.data as unknown as StorePayloadMap[T];
      }
    }
  }

  return readJson(await fallbackFile(config, tableName), [] as StorePayloadMap[T]);
}

export async function saveRecords<T extends TableName>(
  context: NodeContext,
  config: RuntimeConfig,
  tableName: T,
  data: StorePayloadMap[T],
): Promise<void> {
  if (config.useDataTables) {
    const tableId = await ensureTable(context, tableName);
    if (tableId) {
      const table = await getTableProxy(context, tableId);
      if (table) {
        await table.deleteDataTable();
        const recreatedTableId = await ensureTable(context, tableName);
        const recreated = recreatedTableId
          ? await getTableProxy(context, recreatedTableId)
          : null;
        if (recreated && data.length > 0) {
          await recreated.insertRows(data as never, 'count');
        }
        return;
      }
    }
  }

  await writeJson(await fallbackFile(config, tableName), data);
}
