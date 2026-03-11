import path from 'node:path';

import type { NodeContext, RuntimeConfig } from './context';
import { runtimePaths } from './context';
import { ensureDir, readJson, writeJson } from './fs';
import type { DedupRecord, DiscoveredTarget, LinkedTarget, SessionRecord } from './types';

type TableName = 'sessions' | 'linked_targets' | 'discovered_targets' | 'dedup';

type StorePayloadMap = {
  sessions: SessionRecord[];
  linked_targets: LinkedTarget[];
  discovered_targets: DiscoveredTarget[];
  dedup: DedupRecord[];
};

async function fallbackFile<T extends TableName>(
  config: RuntimeConfig,
  tableName: T,
): Promise<string> {
  const filePath = path.join(runtimePaths(config).tablesFallback, `${tableName}.json`);
  await ensureDir(path.dirname(filePath));
  return filePath;
}

export async function listRecords<T extends TableName>(
  _context: NodeContext,
  config: RuntimeConfig,
  tableName: T,
): Promise<StorePayloadMap[T]> {
  return readJson(await fallbackFile(config, tableName), [] as StorePayloadMap[T]);
}

export async function saveRecords<T extends TableName>(
  _context: NodeContext,
  config: RuntimeConfig,
  tableName: T,
  data: StorePayloadMap[T],
): Promise<void> {
  await writeJson(await fallbackFile(config, tableName), data);
}
